import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case invalidServerURL
    case unauthorized(String)
    case server(status: Int, code: String, message: String)
    case http(Int)
    case decoding(String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Connect to your XS Studio server first."
        case .invalidServerURL: return "That server address isn't a valid URL."
        case .unauthorized(let message): return message.isEmpty ? "Your session expired. Sign in again." : message
        case .server(_, _, let message): return message
        case .http(let status): return "The server returned an error (\(status))."
        case .decoding(let detail): return "Unexpected response from the server. \(detail)"
        case .transport(let detail): return detail
        }
    }
}

/// Thin, typed client for the XS Studio backend (see docs/API.md).
final class APIClient {
    private let lock = NSLock()
    private var _baseURL: URL?
    private var _token: String?

    /// Called on the main actor when the server rejects our token.
    var onUnauthorized: (@MainActor () -> Void)?

    let session: URLSession

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 600
        configuration.waitsForConnectivity = true
        session = URLSession(configuration: configuration)
    }

    var baseURL: URL? {
        get { lock.lock(); defer { lock.unlock() }; return _baseURL }
        set { lock.lock(); _baseURL = newValue; lock.unlock() }
    }

    var token: String? {
        get { lock.lock(); defer { lock.unlock() }; return _token }
        set { lock.lock(); _token = newValue; lock.unlock() }
    }

    static func normalizedServerURL(_ text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "https://" + trimmed
        }
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard let url = URL(string: trimmed), url.host != nil else { return nil }
        return url
    }

    // MARK: Request building

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], base: URL? = nil) throws -> URLRequest {
        guard let root = base ?? baseURL else { throw APIError.notConfigured }
        guard var components = URLComponents(url: root.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidServerURL
        }
        let items = query.filter { ($0.value ?? "").isEmpty == false }
        if !items.isEmpty { components.queryItems = items }
        guard let url = components.url else { throw APIError.invalidServerURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            let result = try await session.data(for: request)
            data = result.0
            response = result.1
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.http(0) }
        guard (200..<300).contains(http.statusCode) else {
            throw mapError(status: http.statusCode, data: data)
        }
        return data
    }

    func mapError(status: Int, data: Data) -> APIError {
        let envelope = try? JSONCoding.decoder.decode(APIErrorEnvelope.self, from: data)
        let message = envelope?.error.message ?? ""
        if status == 401 {
            if let handler = onUnauthorized {
                Task { @MainActor in handler() }
            }
            return .unauthorized(message)
        }
        if let envelope {
            return .server(status: status, code: envelope.error.code ?? "error", message: message.isEmpty ? "Request failed (\(status))." : message)
        }
        return .http(status)
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONCoding.decoder.decode(T.self, from: data)
        } catch let DecodingError.keyNotFound(key, context) {
            throw APIError.decoding("Missing \(key.stringValue) at \(context.codingPath.map(\.stringValue).joined(separator: "."))")
        } catch let DecodingError.typeMismatch(_, context) {
            throw APIError.decoding("Type mismatch at \(context.codingPath.map(\.stringValue).joined(separator: "."))")
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    func send<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [], body: (any Encodable)? = nil, as type: T.Type = T.self) async throws -> T {
        var request = try makeRequest(method, path, query: query)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONCoding.encoder.encode(body)
        }
        let data = try await perform(request)
        return try decode(T.self, from: data)
    }

    func sendVoid(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws {
        var request = try makeRequest(method, path)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONCoding.encoder.encode(body)
        }
        _ = try await perform(request)
    }

    func upload<T: Decodable>(_ path: String, file: Data, filename: String, mimeType: String, fields: [String: String] = [:], as type: T.Type = T.self) async throws -> T {
        var request = try makeRequest("POST", path)
        let boundary = "XSStudio-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 300
        var body = Data()
        func append(_ string: String) { body.append(Data(string.utf8)) }
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) where !value.isEmpty {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            append("\(value)\r\n")
        }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(file)
        append("\r\n--\(boundary)--\r\n")
        request.httpBody = body
        let data = try await perform(request)
        return try decode(T.self, from: data)
    }

    func downloadData(_ url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.http(http.statusCode)
        }
        return data
    }
}

// MARK: - Request bodies

private struct LoginBody: Encodable { let email: String; let password: String }
private struct CreateUserBody: Encodable { let email: String; let name: String; let password: String; let role: String }
private struct CreateBody: Encodable { let prompt: String; let attachmentAssetIds: [String] }
private struct ThreadBody: Encodable { let title: String? }
private struct MessageBody: Encodable { let text: String; let attachmentAssetIds: [String] }
private struct ParseBody: Encodable { let text: String }

struct OutputPatch: Encodable {
    var status: String?
    var favorite: Bool?
    var title: String?
    var text: String?
}

struct RerenderBody: Encodable {
    var fields: [String: String]?
    var format: String?
    var template: String?
}

struct AssetPatch: Encodable {
    var title: String?
    var artist: String?
    var tags: [String]?
    var kind: String?
}

// MARK: - Endpoints

extension APIClient {
    // Health & auth
    func health(base: URL) async throws -> HealthResponse {
        let request = try makeRequest("GET", "/health", base: base)
        let data = try await perform(request)
        return try decode(HealthResponse.self, from: data)
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        try await send("POST", "/auth/login", body: LoginBody(email: email, password: password))
    }

    func me() async throws -> User { try await send("GET", "/me") }
    func systemStatus() async throws -> SystemStatus { try await send("GET", "/system/status") }
    func users() async throws -> [User] { try await send("GET", "/users") }

    func createUser(email: String, name: String, password: String, role: String) async throws -> User {
        try await send("POST", "/users", body: CreateUserBody(email: email, name: name, password: password, role: role))
    }

    func deleteUser(_ id: String) async throws { try await sendVoid("DELETE", "/users/\(id)") }

    // Studio
    func create(prompt: String, attachmentAssetIds: [String] = []) async throws -> CreateResponse {
        try await send("POST", "/create", body: CreateBody(prompt: prompt, attachmentAssetIds: attachmentAssetIds))
    }

    func threads() async throws -> [StudioThread] { try await send("GET", "/threads") }

    func createThread(title: String?) async throws -> StudioThread {
        try await send("POST", "/threads", body: ThreadBody(title: title))
    }

    func thread(_ id: String) async throws -> ThreadDetail { try await send("GET", "/threads/\(id)") }
    func deleteThread(_ id: String) async throws { try await sendVoid("DELETE", "/threads/\(id)") }

    func postMessage(threadId: String, text: String, attachmentAssetIds: [String] = []) async throws -> PostMessageResponse {
        try await send("POST", "/threads/\(threadId)/messages", body: MessageBody(text: text, attachmentAssetIds: attachmentAssetIds))
    }

    func run(_ id: String) async throws -> Run { try await send("GET", "/runs/\(id)") }
    func cancelRun(_ id: String) async throws -> Run { try await send("POST", "/runs/\(id)/cancel") }

    // Outputs
    func outputs(kind: OutputKind? = nil, status: OutputStatus? = nil, query: String? = nil, limit: Int = 50, before: Date? = nil) async throws -> [Output] {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let kind { items.append(URLQueryItem(name: "kind", value: kind.rawValue)) }
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if let before { items.append(URLQueryItem(name: "before", value: JSONCoding.isoString(before))) }
        return try await send("GET", "/outputs", query: items)
    }

    func output(_ id: String) async throws -> Output { try await send("GET", "/outputs/\(id)") }

    func patchOutput(_ id: String, _ patch: OutputPatch) async throws -> Output {
        try await send("PATCH", "/outputs/\(id)", body: patch)
    }

    func deleteOutput(_ id: String) async throws { try await sendVoid("DELETE", "/outputs/\(id)") }

    func rerender(_ id: String, fields: [String: String]? = nil, format: String? = nil, template: String? = nil) async throws -> Output {
        try await send("POST", "/outputs/\(id)/rerender", body: RerenderBody(fields: fields, format: format, template: template))
    }

    // Assets
    func assets(kind: AssetKind? = nil, artist: String? = nil, query: String? = nil) async throws -> [Asset] {
        var items: [URLQueryItem] = []
        if let kind { items.append(URLQueryItem(name: "kind", value: kind.rawValue)) }
        if let artist, !artist.isEmpty { items.append(URLQueryItem(name: "artist", value: artist)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        return try await send("GET", "/assets", query: items)
    }

    func uploadAsset(data: Data, filename: String, mimeType: String, kind: AssetKind, artist: String?, title: String?, tags: [String]) async throws -> Asset {
        var fields: [String: String] = ["kind": kind.rawValue]
        if let artist, !artist.isEmpty { fields["artist"] = artist }
        if let title, !title.isEmpty { fields["title"] = title }
        if !tags.isEmpty { fields["tags"] = tags.joined(separator: ",") }
        return try await upload("/assets", file: data, filename: filename, mimeType: mimeType, fields: fields)
    }

    func patchAsset(_ id: String, _ patch: AssetPatch) async throws -> Asset {
        try await send("PATCH", "/assets/\(id)", body: patch)
    }

    func deleteAsset(_ id: String) async throws { try await sendVoid("DELETE", "/assets/\(id)") }

    // Events
    func events(from: String, to: String) async throws -> [Event] {
        try await send("GET", "/events", query: [URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to)])
    }

    func createEvent(_ input: EventInput) async throws -> Event { try await send("POST", "/events", body: input) }
    func updateEvent(_ id: String, _ input: EventInput) async throws -> Event { try await send("PATCH", "/events/\(id)", body: input) }
    func deleteEvent(_ id: String) async throws { try await sendVoid("DELETE", "/events/\(id)") }

    func parseEvents(text: String) async throws -> [EventInput] {
        let response: ParsedEventsResponse = try await send("POST", "/events/parse", body: ParseBody(text: text))
        return response.events
    }

    // Brand
    func brand() async throws -> BrandResponse { try await send("GET", "/brand") }

    func updateBrandProfile(_ patch: [String: JSONValue]) async throws -> [String: JSONValue] {
        try await send("PUT", "/brand/profile", body: patch)
    }

    func uploadBrandReference(data: Data, filename: String, mimeType: String) async throws -> Asset {
        try await upload("/brand/references", file: data, filename: filename, mimeType: mimeType)
    }

    func rebuildDNA() async throws -> String {
        let response: DNAResponse = try await send("POST", "/brand/dna/rebuild")
        return response.dna
    }

    func templates() async throws -> [TemplateInfo] { try await send("GET", "/templates") }

    /// Pulls the latest @xslasvegas posts via the official Instagram API (server-side token) and rebuilds the DNA.
    func syncInstagram() async throws -> InstagramSyncResult {
        try await send("POST", "/brand/instagram/sync", body: InstagramSyncRequest(rebuildDna: true))
    }
}
