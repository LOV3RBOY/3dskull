import SwiftUI

struct QuickAction: Identifiable {
    let id: String
    let title: String
    let systemImage: String
    let prompt: String

    static let all: [QuickAction] = [
        QuickAction(id: "weekend", title: "Flyer for this weekend", systemImage: "sparkles.rectangle.stack",
                    prompt: "Make the flyer set for this weekend's headliners at XS — feed, story and square."),
        QuickAction(id: "lineup", title: "Weekly lineup", systemImage: "list.bullet.rectangle",
                    prompt: "Build this week's XS lineup graphic (feed + story) from the calendar."),
        QuickAction(id: "countdown", title: "Story countdown", systemImage: "timer",
                    prompt: "Make a TONIGHT story for tonight's headliner at XS."),
        QuickAction(id: "captions", title: "Caption pack", systemImage: "text.quote",
                    prompt: "Write the caption pack for this weekend at XS: Instagram caption, story text, X post and email subject lines."),
        QuickAction(id: "recap", title: "Recap post from photos", systemImage: "photo.on.rectangle.angled",
                    prompt: "Build a recap carousel and caption from the attached photos from last night at XS."),
    ]
}

struct StudioView: View {
    @Environment(AppState.self) private var app

    @State private var path: [StudioRoute] = []
    @State private var threads: [StudioThread] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var draft = ""
    @State private var attachments: [Asset] = []
    @State private var isSending = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    header
                    quickActions
                    if let errorMessage {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                            .padding(.horizontal, 20)
                    }
                    recentThreads
                }
                .padding(.vertical, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .safeAreaInset(edge: .bottom) {
                ComposerView(text: $draft, attachments: $attachments,
                             placeholder: "Make a poster for Diplo this weekend…",
                             isBusy: isSending, onSend: { Task { await send() } })
            }
            .navigationTitle("Studio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("XS STUDIO")
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(4)
                        .foregroundStyle(Theme.goldGradient)
                }
            }
            .navigationDestination(for: StudioRoute.self) { route in
                destination(for: route)
            }
            .refreshable { await loadThreads() }
            .onAppear {
                consumePendingRoute()
                Task { await loadThreads() }
            }
            .onChange(of: app.pendingStudioRoute) { _, _ in
                consumePendingRoute()
            }
        }
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(greeting)
            Text("What are we\nmaking tonight?")
                .font(.system(size: 34, weight: .ultraLight))
                .foregroundStyle(Theme.text)
                .lineSpacing(2)
            Text("Flyers, stories, lineups and captions in the XS lane — built from the live calendar and your official artist assets.")
                .font(.footnote)
                .foregroundStyle(Theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20)
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Quick start", color: Theme.textMuted)
                .padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(QuickAction.all) { action in
                        Button {
                            draft = action.prompt
                            Haptics.tap()
                        } label: {
                            VStack(alignment: .leading, spacing: 14) {
                                Image(systemName: action.systemImage)
                                    .font(.system(size: 20, weight: .light))
                                    .foregroundStyle(Theme.gold)
                                Text(action.title)
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(Theme.text)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(14)
                            .frame(width: 140, height: 112, alignment: .topLeading)
                            .card()
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private var recentThreads: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionLabel("Recent sessions", color: Theme.textMuted)
                Spacer()
                if isLoading { ProgressView().controlSize(.small).tint(Theme.gold) }
            }
            .padding(.horizontal, 20)

            if threads.isEmpty && !isLoading {
                Text("Nothing yet. Ask for your first flyer below.")
                    .font(.footnote)
                    .foregroundStyle(Theme.textFaint)
                    .padding(.horizontal, 20)
            } else {
                VStack(spacing: 0) {
                    ForEach(threads) { thread in
                        NavigationLink(value: StudioRoute.thread(id: thread.id, runId: nil)) {
                            ThreadRow(thread: thread)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) {
                                Task { await delete(thread) }
                            } label: {
                                Label("Delete session", systemImage: "trash")
                            }
                        }
                        if thread.id != threads.last?.id {
                            Hairline().padding(.leading, 76)
                        }
                    }
                }
                .card()
                .padding(.horizontal, 16)
            }
        }
        .padding(.bottom, 12)
    }

    private var greeting: String {
        let hour = LasVegas.calendar.component(.hour, from: Date())
        let name = app.user?.name.split(separator: " ").first.map(String.init) ?? ""
        let base: String
        switch hour {
        case 5..<12: base = "Good morning"
        case 12..<17: base = "Good afternoon"
        default: base = "Good evening"
        }
        return name.isEmpty ? base : "\(base), \(name)"
    }

    @ViewBuilder
    private func destination(for route: StudioRoute) -> some View {
        switch route {
        case .thread(let id, let runId):
            ThreadDetailView(threadId: id, initialRunId: runId, api: app.api, sse: app.sse)
        case .output(let output):
            OutputDetailView(output: output)
        }
    }

    // MARK: Actions

    private func consumePendingRoute() {
        guard let route = app.pendingStudioRoute else { return }
        app.pendingStudioRoute = nil
        path = [route]
    }

    @MainActor
    private func loadThreads() async {
        isLoading = true
        defer { isLoading = false }
        do {
            threads = try await app.api.threads()
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func send() async {
        let prompt = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !isSending else { return }
        isSending = true
        defer { isSending = false }
        do {
            let response = try await app.api.create(prompt: prompt, attachmentAssetIds: attachments.map(\.id))
            draft = ""
            attachments = []
            threads.insert(response.thread, at: 0)
            path.append(.thread(id: response.thread.id, runId: response.runId))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete(_ thread: StudioThread) async {
        do {
            try await app.api.deleteThread(thread.id)
            threads.removeAll { $0.id == thread.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ThreadRow: View {
    let thread: StudioThread

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                if let cover = thread.coverURL {
                    RemoteImage(url: cover)
                } else {
                    Theme.surface2
                    Image(systemName: "sparkles").foregroundStyle(Theme.gold)
                }
            }
            .frame(width: 46, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 5) {
                Text(thread.title.isEmpty ? "Untitled session" : thread.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                Text(thread.updatedAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
            if let state = thread.lastRunState {
                RunStateBadge(state: state)
            }
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(Theme.textFaint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

struct RunStateBadge: View {
    let state: RunState

    var body: some View {
        switch state {
        case .queued, .running:
            Badge(text: "Live", color: Theme.gold)
        case .needsInput:
            Badge(text: "Reply", color: Theme.goldLight)
        case .failed:
            Badge(text: "Failed", color: Theme.danger)
        default:
            EmptyView()
        }
    }
}
