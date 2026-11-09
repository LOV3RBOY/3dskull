import SwiftUI
import UIKit

/// Inline deliverable card (poster / caption) shown in threads and run panels.
struct OutputCardView: View {
    let output: Output
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if output.hasImage {
                Color.clear
                    .aspectRatio(output.aspectRatio, contentMode: .fit)
                    .overlay(RemoteImage(url: output.thumbURL, contentMode: .fit))
                    .background(Theme.surface2)
                    .clipped()
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Badge(text: output.kind.label)
                    if let format = output.format {
                        Text(format.label)
                            .font(.caption2)
                            .foregroundStyle(Theme.textMuted)
                    }
                    Spacer()
                    if output.status == .approved {
                        Badge(text: "Approved", color: Theme.success)
                    } else if output.status == .rejected {
                        Badge(text: "Rejected", color: Theme.danger)
                    }
                    if output.favorite {
                        Image(systemName: "star.fill").font(.caption).foregroundStyle(Theme.gold)
                    }
                }

                Text(output.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)

                if let text = output.text, !text.isEmpty {
                    Text(text)
                        .font(.footnote)
                        .foregroundStyle(Theme.text.opacity(0.78))
                        .lineLimit(output.hasImage ? 4 : 14)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        UIPasteboard.general.string = text
                        copied = true
                        Haptics.tap()
                        Task {
                            try? await Task.sleep(nanoseconds: 1_600_000_000)
                            copied = false
                        }
                    } label: {
                        Label(copied ? "Copied" : "Copy text", systemImage: copied ? "checkmark" : "doc.on.doc")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(GhostButtonStyle())
                }
            }
            .padding(14)
        }
        .card()
        .contentShape(Rectangle())
    }
}
