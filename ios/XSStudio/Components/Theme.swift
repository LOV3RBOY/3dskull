import SwiftUI
import UIKit

enum Theme {
    static let background = Color.black
    static let surface = Color(red: 0.055, green: 0.051, blue: 0.047)
    static let surface2 = Color(red: 0.094, green: 0.086, blue: 0.078)
    static let surface3 = Color(red: 0.14, green: 0.13, blue: 0.118)
    static let hairline = Color.white.opacity(0.09)

    static let gold = Color(red: 0.788, green: 0.663, blue: 0.431)       // #C9A96E
    static let goldLight = Color(red: 0.910, green: 0.827, blue: 0.635)  // #E8D3A2
    static let goldDeep = Color(red: 0.62, green: 0.49, blue: 0.29)

    static let text = Color(red: 0.965, green: 0.953, blue: 0.929)
    static let textMuted = Color.white.opacity(0.58)
    static let textFaint = Color.white.opacity(0.32)

    static let success = Color(red: 0.55, green: 0.80, blue: 0.60)
    static let danger = Color(red: 0.92, green: 0.42, blue: 0.40)

    static let goldGradient = LinearGradient(colors: [goldLight, gold, goldDeep], startPoint: .topLeading, endPoint: .bottomTrailing)

    static let cornerRadius: CGFloat = 14
}

// MARK: - Typography helpers

struct SectionLabel: View {
    let text: String
    var color: Color = Theme.gold

    init(_ text: String, color: Color = Theme.gold) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(2.4)
            .foregroundStyle(color)
    }
}

struct Wordmark: View {
    var size: CGFloat = 44

    var body: some View {
        VStack(spacing: size * 0.12) {
            Text("XS")
                .font(.system(size: size, weight: .ultraLight, design: .default))
                .tracking(size * 0.18)
                .foregroundStyle(Theme.goldGradient)
            Text("STUDIO")
                .font(.system(size: max(10, size * 0.22), weight: .light))
                .tracking(size * 0.16)
                .foregroundStyle(Theme.gold)
        }
    }
}

// MARK: - Buttons

struct GoldButtonStyle: ButtonStyle {
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(Color.black)
            .padding(.vertical, 15)
            .padding(.horizontal, 22)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(Theme.goldGradient)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .tracking(1.2)
            .foregroundStyle(Theme.goldLight)
            .padding(.vertical, 11)
            .padding(.horizontal, 16)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(Theme.gold.opacity(0.45), lineWidth: 0.8)
            )
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

// MARK: - Containers

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                    .stroke(Theme.hairline, lineWidth: 0.6)
            )
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }

    /// Standard black screen chrome for every root screen.
    func screenBackground() -> some View {
        background(Theme.background.ignoresSafeArea())
    }

    /// Black styling for Forms / Lists.
    func blackList() -> some View {
        scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
    }
}

struct Chip: View {
    let title: String
    var systemImage: String?
    var selected: Bool = false

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage { Image(systemName: systemImage).font(.system(size: 11, weight: .semibold)) }
            Text(title).font(.system(size: 13, weight: .medium))
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 8)
        .foregroundStyle(selected ? Color.black : Theme.text)
        .background(
            Capsule().fill(selected ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(Theme.surface2))
        )
        .overlay(Capsule().stroke(selected ? Color.clear : Theme.hairline, lineWidth: 0.6))
    }
}

struct Badge: View {
    let text: String
    var color: Color = Theme.gold

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 9, weight: .bold))
            .tracking(1.4)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .foregroundStyle(color)
            .background(Capsule().fill(color.opacity(0.14)))
    }
}

struct Hairline: View {
    var body: some View {
        Rectangle().fill(Theme.hairline).frame(height: 0.6)
    }
}

struct ErrorBanner: View {
    let message: String
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
            Text(message).font(.footnote).foregroundStyle(Theme.text).frame(maxWidth: .infinity, alignment: .leading)
            if let onDismiss {
                Button { onDismiss() } label: { Image(systemName: "xmark").font(.footnote) }
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(12)
        .background(Theme.danger.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// Transparent-image backdrop so cut-outs read clearly.
struct CheckerboardBackground: View {
    var body: some View {
        Canvas { context, size in
            let tile: CGFloat = 10
            let columns = Int(ceil(size.width / tile))
            let rows = Int(ceil(size.height / tile))
            for row in 0..<rows {
                for column in 0..<columns where (row + column) % 2 == 0 {
                    let rect = CGRect(x: CGFloat(column) * tile, y: CGFloat(row) * tile, width: tile, height: tile)
                    context.fill(Path(rect), with: .color(Color.white.opacity(0.05)))
                }
            }
        }
        .background(Theme.surface2)
    }
}

enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
