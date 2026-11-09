import Foundation
import Observation

/// Drives a single Studio thread: history + the live agent run streamed over SSE.
@Observable
final class ThreadViewModel {
    enum StepKind: Hashable { case progress, tool }
    enum StepState: Hashable { case running, done, failed }

    struct Step: Identifiable, Hashable {
        let id: String
        let kind: StepKind
        var label: String
        var state: StepState
        var detail: String?
    }

    let threadId: String
    private let api: APIClient
    private let sse: SSEClient
    @ObservationIgnored private var initialRunId: String?
    @ObservationIgnored private var streamTask: Task<Void, Never>?

    var thread: StudioThread?
    var messages: [ChatMessage] = []
    var outputsById: [String: Output] = [:]
    var isLoading = false
    var isSending = false
    var errorMessage: String?

    // Live run
    var activeRunId: String?
    var runState: RunState?
    var steps: [Step] = []
    var streamingText = ""
    var liveOutputIds: [String] = []
    /// Incremented when a run finishes successfully (drives haptics).
    var completionCount = 0

    init(threadId: String, initialRunId: String?, api: APIClient, sse: SSEClient) {
        self.threadId = threadId
        self.initialRunId = initialRunId
        self.api = api
        self.sse = sse
    }

    var isRunActive: Bool { runState?.isActive ?? false }
    var needsInput: Bool { runState == .needsInput }
    var canCompose: Bool { !isSending && (!isRunActive || needsInput) }

    var unattachedLiveOutputs: [Output] {
        let attached = Set(messages.flatMap(\.outputIds))
        return liveOutputIds.filter { !attached.contains($0) }.compactMap { outputsById[$0] }
    }

    // MARK: Loading

    @MainActor
    func load() async {
        isLoading = thread == nil
        defer { isLoading = false }
        do {
            let detail = try await api.thread(threadId)
            apply(detail)
            if let runId = initialRunId {
                initialRunId = nil
                connect(runId)
            } else if streamTask == nil, let runId = activeRunId, runState?.isActive == true || runState == nil {
                connect(runId)
            } else if streamTask == nil, detail.thread.lastRunState?.isActive == true, let runId = detail.thread.lastRunId {
                connect(runId)
            } else if activeRunId == nil, let state = detail.thread.lastRunState {
                runState = state
            }
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func apply(_ detail: ThreadDetail) {
        thread = detail.thread
        messages = detail.messages.sorted { $0.createdAt < $1.createdAt }
        for output in detail.outputs { outputsById[output.id] = output }
    }

    @MainActor
    private func refresh() async {
        guard let detail = try? await api.thread(threadId) else { return }
        apply(detail)
    }

    // MARK: Sending

    @MainActor
    func send(text: String, attachmentAssetIds: [String]) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return false }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            let response = try await api.postMessage(threadId: threadId, text: trimmed, attachmentAssetIds: attachmentAssetIds)
            if !messages.contains(where: { $0.id == response.message.id }) {
                messages.append(response.message)
            }
            connect(response.runId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @MainActor
    func cancel() async {
        guard let runId = activeRunId else { return }
        do {
            let run = try await api.cancelRun(runId)
            runState = run.state
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Streaming

    @MainActor
    func connect(_ runId: String) {
        streamTask?.cancel()
        activeRunId = runId
        runState = .queued
        resetLive()
        liveOutputIds = []
        streamTask = Task { [weak self] in
            await self?.consume(runId)
        }
    }

    /// Stops listening (e.g. the view disappeared). The run keeps going on the server.
    func stop() {
        streamTask?.cancel()
        streamTask = nil
    }

    @MainActor
    private func resetLive() {
        steps = []
        streamingText = ""
    }

    @MainActor
    private func consume(_ runId: String) async {
        var attempts = 0
        var lastError: Error?
        while !Task.isCancelled {
            if attempts > 0 { resetLive() } // the server replays the whole run on reconnect
            lastError = nil
            do {
                for try await event in sse.events(runId: runId) {
                    handle(event)
                }
            } catch {
                lastError = error
            }
            if Task.isCancelled { return }
            if runState?.isActive == true, attempts < 4 {
                attempts += 1
                try? await Task.sleep(nanoseconds: UInt64(attempts) * 1_500_000_000)
                continue
            }
            break
        }
        if Task.isCancelled { return }
        if let lastError, runState?.isActive == true {
            errorMessage = "Lost connection to the run: \(lastError.localizedDescription)"
        }
        streamTask = nil
        await refresh()
    }

    @MainActor
    private func handle(_ event: RunEvent) {
        switch event {
        case .status(let state):
            runState = state

        case .progress(let text):
            guard !text.isEmpty else { return }
            settleProgress()
            if steps.last?.kind == .progress, steps.last?.label == text { return }
            steps.append(Step(id: "p-\(steps.count)", kind: .progress, label: text, state: .running))

        case .tool(let tool):
            let stepId = "t-\(tool.id)"
            if tool.phase == "start" {
                settleProgress()
                if !steps.contains(where: { $0.id == stepId }) {
                    steps.append(Step(id: stepId, kind: .tool, label: tool.label, state: .running, detail: tool.detail))
                }
            } else {
                let state: StepState = (tool.ok ?? true) ? .done : .failed
                if let index = steps.firstIndex(where: { $0.id == stepId }) {
                    steps[index].state = state
                    if let detail = tool.detail, !detail.isEmpty { steps[index].detail = detail }
                } else {
                    steps.append(Step(id: stepId, kind: .tool, label: tool.label, state: state, detail: tool.detail))
                }
            }

        case .delta(let text):
            streamingText += text

        case .output(let output):
            outputsById[output.id] = output
            if !liveOutputIds.contains(output.id) { liveOutputIds.append(output.id) }

        case .message(let message):
            if let index = messages.firstIndex(where: { $0.id == message.id }) {
                messages[index] = message
            } else {
                messages.append(message)
            }
            if !message.isUser { streamingText = "" }

        case .error(let message):
            errorMessage = message

        case .done(let state):
            runState = state
            for index in steps.indices where steps[index].state == .running {
                steps[index].state = state == .failed ? .failed : .done
            }
            if state == .completed || state == .needsInput {
                completionCount += 1
            }

        case .unknown:
            break
        }
    }

    @MainActor
    private func settleProgress() {
        for index in steps.indices where steps[index].kind == .progress && steps[index].state == .running {
            steps[index].state = .done
        }
    }
}
