import Foundation

/// A raw Server-Sent Event (one `event:` name + joined `data:` lines).
struct RawSSEEvent: Equatable {
    var event: String
    var data: String
}

/// Incremental, line-oriented SSE parser. Feed it lines **including empty ones**; it emits an
/// event whenever a blank line terminates a block.
struct SSEParser {
    private var eventName: String = ""
    private var dataLines: [String] = []

    mutating func feed(line rawLine: String) -> RawSSEEvent? {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        if line.isEmpty { return dispatch() }
        if line.hasPrefix(":") { return nil } // comment / keep-alive

        let field: String
        var value: String
        if let colon = line.firstIndex(of: ":") {
            field = String(line[line.startIndex..<colon])
            value = String(line[line.index(after: colon)...])
            if value.hasPrefix(" ") { value.removeFirst() }
        } else {
            field = line
            value = ""
        }

        switch field {
        case "event": eventName = value
        case "data": dataLines.append(value)
        default: break // id, retry — not needed
        }
        return nil
    }

    /// Emit any pending block (call at end of stream).
    mutating func flush() -> RawSSEEvent? { dispatch() }

    private mutating func dispatch() -> RawSSEEvent? {
        defer { eventName = ""; dataLines = [] }
        guard !dataLines.isEmpty || !eventName.isEmpty else { return nil }
        return RawSSEEvent(event: eventName.isEmpty ? "message" : eventName, data: dataLines.joined(separator: "\n"))
    }

    /// Convenience for tests / whole-chunk parsing.
    static func parse(_ chunk: String) -> [RawSSEEvent] {
        var parser = SSEParser()
        var events: [RawSSEEvent] = []
        for line in chunk.components(separatedBy: "\n") {
            if let event = parser.feed(line: line) { events.append(event) }
        }
        if let event = parser.flush() { events.append(event) }
        return events
    }
}

struct ToolEvent: Codable, Hashable {
    let id: String
    let name: String
    let label: String
    let phase: String
    let ok: Bool?
    let detail: String?

    enum CodingKeys: String, CodingKey { case id, name, label, phase, ok, detail }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.value(.name, or: "tool")
        id = c.value(.id, or: name)
        label = c.value(.label, or: name)
        phase = c.value(.phase, or: "start")
        ok = c.optional(.ok)
        detail = c.optional(.detail)
    }
}

/// Typed agent-run events (docs/API.md → SSE event types).
enum RunEvent {
    case status(RunState)
    case progress(String)
    case tool(ToolEvent)
    case delta(String)
    case output(Output)
    case message(ChatMessage)
    case error(String)
    case done(RunState)
    case unknown(String)

    private struct StatePayload: Decodable { let state: RunState? }
    private struct TextPayload: Decodable { let text: String? }
    private struct MessagePayload: Decodable { let message: String? }
    private struct OutputPayload: Decodable { let output: Output }
    private struct ChatMessagePayload: Decodable { let message: ChatMessage }

    init(raw: RawSSEEvent, decoder: JSONDecoder = JSONCoding.decoder) {
        let data = Data(raw.data.utf8)
        switch raw.event {
        case "status":
            let state = (try? decoder.decode(StatePayload.self, from: data))?.state ?? .unknown
            self = .status(state)
        case "progress":
            self = .progress((try? decoder.decode(TextPayload.self, from: data))?.text ?? "")
        case "tool":
            if let tool = try? decoder.decode(ToolEvent.self, from: data) { self = .tool(tool) } else { self = .unknown(raw.event) }
        case "delta":
            self = .delta((try? decoder.decode(TextPayload.self, from: data))?.text ?? "")
        case "output":
            if let payload = try? decoder.decode(OutputPayload.self, from: data) { self = .output(payload.output) } else { self = .unknown(raw.event) }
        case "message":
            if let payload = try? decoder.decode(ChatMessagePayload.self, from: data) { self = .message(payload.message) } else { self = .unknown(raw.event) }
        case "error":
            self = .error((try? decoder.decode(MessagePayload.self, from: data))?.message ?? "Something went wrong.")
        case "done":
            let state = (try? decoder.decode(StatePayload.self, from: data))?.state ?? .completed
            self = .done(state)
        default:
            self = .unknown(raw.event)
        }
    }
}

/// Streams `GET /runs/:id/events` as typed `RunEvent`s.
final class SSEClient {
    private let api: APIClient
    private let session: URLSession

    init(api: APIClient) {
        self.api = api
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 600 // idle timeout between bytes (server sends keep-alives)
        configuration.timeoutIntervalForResource = 60 * 60 * 2
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    func events(runId: String) -> AsyncThrowingStream<RunEvent, Error> {
        let api = self.api
        let session = self.session
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try api.makeRequest("GET", "/runs/\(runId)/events")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw APIError.http(0) }
                    guard (200..<300).contains(http.statusCode) else {
                        var body = Data()
                        for try await byte in bytes { body.append(byte); if body.count > 64_000 { break } }
                        throw api.mapError(status: http.statusCode, data: body)
                    }

                    var parser = SSEParser()
                    var buffer: [UInt8] = []
                    buffer.reserveCapacity(4096)
                    // Iterate raw bytes: `bytes.lines` drops the blank lines that delimit SSE events.
                    for try await byte in bytes {
                        if byte == 0x0A {
                            let line = String(decoding: buffer, as: UTF8.self)
                            buffer.removeAll(keepingCapacity: true)
                            if let raw = parser.feed(line: line) {
                                let event = RunEvent(raw: raw)
                                continuation.yield(event)
                                if case .done = event {
                                    continuation.finish()
                                    return
                                }
                            }
                        } else {
                            buffer.append(byte)
                        }
                    }
                    if !buffer.isEmpty, let raw = parser.feed(line: String(decoding: buffer, as: UTF8.self)) {
                        continuation.yield(RunEvent(raw: raw))
                    }
                    if let raw = parser.flush() {
                        continuation.yield(RunEvent(raw: raw))
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch let error as URLError where error.code == .cancelled {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
