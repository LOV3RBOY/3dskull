import SwiftUI

struct ThreadDetailView: View {
    @State private var model: ThreadViewModel
    @State private var draft = ""
    @State private var attachments: [Asset] = []

    init(threadId: String, initialRunId: String?, api: APIClient, sse: SSEClient) {
        _model = State(initialValue: ThreadViewModel(threadId: threadId, initialRunId: initialRunId, api: api, sse: sse))
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    if model.isLoading && model.messages.isEmpty {
                        ProgressView().tint(Theme.gold).frame(maxWidth: .infinity).padding(.top, 80)
                    }

                    ForEach(model.messages) { message in
                        MessageRow(message: message, outputs: message.outputIds.compactMap { model.outputsById[$0] })
                            .id(message.id)
                    }

                    if model.activeRunId != nil {
                        RunPanelView(model: model) {
                            Task { await model.cancel() }
                        }
                        .id("run-panel")
                    }

                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.messages.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: model.steps.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: model.liveOutputIds.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: model.isLoading) { _, loading in
                if !loading { scrollToBottom(proxy, animated: false) }
            }
        }
        .screenBackground()
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if model.needsInput {
                    HStack(spacing: 8) {
                        Image(systemName: "questionmark.bubble.fill").foregroundStyle(Theme.gold)
                        Text("XS Studio needs a detail from you — reply below.")
                            .font(.footnote)
                            .foregroundStyle(Theme.text)
                        Spacer()
                    }
                    .padding(12)
                    .background(Theme.gold.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.horizontal, 14)
                }
                if let error = model.errorMessage {
                    ErrorBanner(message: error) { model.errorMessage = nil }
                        .padding(.horizontal, 14)
                }
                ComposerView(text: $draft, attachments: $attachments,
                             placeholder: model.needsInput ? "Answer here…" : "Refine it — \"make the date bigger\", \"try a gold version\"…",
                             isBusy: model.isSending,
                             isEnabled: model.canCompose,
                             onSend: { Task { await send() } })
            }
        }
        .navigationTitle(model.thread?.title ?? "Session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if model.isRunActive {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.cancel() }
                    } label: {
                        Image(systemName: "stop.circle")
                    }
                    .tint(Theme.danger)
                }
            }
        }
        .task { await model.load() }
        .onDisappear { model.stop() }
        .sensoryFeedback(.success, trigger: model.completionCount)
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        if animated {
            withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
        } else {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }

    @MainActor
    private func send() async {
        let text = draft
        let ids = attachments.map(\.id)
        let previousAttachments = attachments
        draft = ""
        attachments = []
        let ok = await model.send(text: text, attachmentAssetIds: ids)
        if !ok {
            draft = text
            attachments = previousAttachments
        }
    }
}

private struct MessageRow: View {
    let message: ChatMessage
    let outputs: [Output]

    var body: some View {
        if message.isUser {
            HStack {
                Spacer(minLength: 48)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(message.text)
                        .font(.callout)
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.gold.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .textSelection(.enabled)
                    if !message.attachmentAssetIds.isEmpty {
                        Label("\(message.attachmentAssetIds.count) attached", systemImage: "paperclip")
                            .font(.caption2)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text("XS")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.5)
                        .foregroundStyle(Color.black)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Theme.goldGradient))
                    SectionLabel("Studio", color: Theme.textMuted)
                }
                if !message.text.isEmpty {
                    MarkdownText(message.text)
                }
                ForEach(outputs) { output in
                    NavigationLink(value: StudioRoute.output(output)) {
                        OutputCardView(output: output)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
