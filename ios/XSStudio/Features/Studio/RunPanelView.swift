import SwiftUI

/// Live view of an agent run: animated step checklist, streamed prose and new deliverables.
struct RunPanelView: View {
    let model: ThreadViewModel
    var onCancel: () -> Void

    @State private var expanded = true

    private var isActive: Bool { model.isRunActive }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if expanded || isActive {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(model.steps) { step in
                        StepRow(step: step)
                            .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
                    }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: model.steps)
            }

            if !model.streamingText.isEmpty {
                Hairline()
                MarkdownText(model.streamingText, font: .callout)
            }

            let liveOutputs = model.unattachedLiveOutputs
            if !liveOutputs.isEmpty {
                VStack(spacing: 12) {
                    ForEach(liveOutputs) { output in
                        NavigationLink(value: StudioRoute.output(output)) {
                            OutputCardView(output: output)
                        }
                        .buttonStyle(.plain)
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: liveOutputs.map(\.id))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .fill(Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .stroke(isActive ? Theme.gold.opacity(0.35) : Theme.hairline, lineWidth: 0.8)
        )
        .onChange(of: model.runState) { _, newValue in
            if newValue?.isActive == false, model.steps.count > 4 {
                withAnimation { expanded = false }
            } else if newValue?.isActive == true {
                expanded = true
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            if isActive {
                PulsingDot()
            } else {
                Image(systemName: icon)
                    .foregroundStyle(iconColor)
            }
            SectionLabel(title, color: isActive ? Theme.gold : Theme.textMuted)
            Spacer()
            if isActive {
                Button("Stop", role: .destructive) { onCancel() }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.danger)
            } else if !model.steps.isEmpty {
                Button {
                    withAnimation { expanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text("\(model.steps.count) steps")
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                }
            }
        }
    }

    private var title: String {
        switch model.runState {
        case .queued: return "Queued"
        case .running: return "Creating"
        case .needsInput: return "Waiting on you"
        case .completed: return "Complete"
        case .failed: return "Run failed"
        case .cancelled: return "Stopped"
        default: return "Run"
        }
    }

    private var icon: String {
        switch model.runState {
        case .completed: return "checkmark.seal.fill"
        case .needsInput: return "questionmark.bubble.fill"
        case .failed: return "exclamationmark.octagon.fill"
        case .cancelled: return "stop.circle.fill"
        default: return "circle"
        }
    }

    private var iconColor: Color {
        switch model.runState {
        case .completed, .needsInput: return Theme.gold
        case .failed: return Theme.danger
        default: return Theme.textMuted
        }
    }
}

private struct StepRow: View {
    let step: ThreadViewModel.Step

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            ZStack {
                switch step.state {
                case .running:
                    ProgressView().controlSize(.mini).tint(Theme.gold)
                case .done:
                    Image(systemName: step.kind == .tool ? "checkmark.circle.fill" : "checkmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.gold)
                case .failed:
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.danger)
                }
            }
            .frame(width: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(step.label)
                    .font(step.kind == .tool ? .footnote.weight(.medium) : .footnote)
                    .foregroundStyle(step.state == .running ? Theme.text : Theme.text.opacity(0.7))
                if let detail = step.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

private struct PulsingDot: View {
    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(Theme.gold)
            .frame(width: 8, height: 8)
            .overlay(
                Circle()
                    .stroke(Theme.gold.opacity(0.6), lineWidth: 1)
                    .scaleEffect(pulse ? 2.4 : 1)
                    .opacity(pulse ? 0 : 1)
            )
            .onAppear {
                withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) { pulse = true }
            }
    }
}
