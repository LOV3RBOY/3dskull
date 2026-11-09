import SwiftUI

/// Renders inline Markdown (bold, italics, links, code) while preserving line breaks.
struct MarkdownText: View {
    let text: String
    var font: Font = .callout
    var color: Color = Theme.text

    init(_ text: String, font: Font = .callout, color: Color = Theme.text) {
        self.text = text
        self.font = font
        self.color = color
    }

    var body: some View {
        Text(MarkdownText.attributed(text))
            .font(font)
            .foregroundStyle(color)
            .tint(Theme.goldLight)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    static func attributed(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: false,
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}

/// Block-level Markdown renderer (headings, bullets, paragraphs) for longer documents like Brand DNA.
struct MarkdownDocument: View {
    let markdown: String

    private enum Block: Hashable {
        case heading(level: Int, text: String)
        case bullet(String)
        case numbered(String, String)
        case quote(String)
        case rule
        case paragraph(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case .heading(let level, let text):
            if level <= 1 {
                Text(MarkdownText.attributed(text))
                    .font(.system(size: 22, weight: .light))
                    .tracking(1)
                    .foregroundStyle(Theme.goldLight)
                    .padding(.top, 10)
            } else if level == 2 {
                Text(text.uppercased())
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(2.2)
                    .foregroundStyle(Theme.gold)
                    .padding(.top, 14)
            } else {
                Text(MarkdownText.attributed(text))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .padding(.top, 6)
            }
        case .bullet(let text):
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Circle().fill(Theme.gold).frame(width: 4, height: 4).offset(y: -3)
                MarkdownText(text, font: .callout, color: Theme.text.opacity(0.9))
            }
        case .numbered(let number, let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(number).font(.callout.monospacedDigit()).foregroundStyle(Theme.gold)
                MarkdownText(text, font: .callout, color: Theme.text.opacity(0.9))
            }
        case .quote(let text):
            HStack(spacing: 10) {
                Rectangle().fill(Theme.gold).frame(width: 2)
                MarkdownText(text, font: .callout.italic(), color: Theme.textMuted)
            }
        case .rule:
            Hairline().padding(.vertical, 6)
        case .paragraph(let text):
            MarkdownText(text, font: .callout, color: Theme.text.opacity(0.88))
        }
    }

    private var blocks: [Block] {
        var result: [Block] = []
        var paragraph: [String] = []

        func flush() {
            if !paragraph.isEmpty {
                result.append(.paragraph(paragraph.joined(separator: "\n")))
                paragraph = []
            }
        }

        for rawLine in markdown.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("#") {
                flush()
                let level = line.prefix(while: { $0 == "#" }).count
                let text = line.dropFirst(level).trimmingCharacters(in: .whitespaces)
                result.append(.heading(level: level, text: text))
            } else if line == "---" || line == "***" {
                flush()
                result.append(.rule)
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("• ") {
                flush()
                result.append(.bullet(String(line.dropFirst(2))))
            } else if line.hasPrefix("> ") {
                flush()
                result.append(.quote(String(line.dropFirst(2))))
            } else if let dot = line.firstIndex(of: "."), line[line.startIndex..<dot].allSatisfy(\.isNumber),
                      !line[line.startIndex..<dot].isEmpty, line.index(after: dot) < line.endIndex,
                      line[line.index(after: dot)] == " " {
                flush()
                let number = String(line[line.startIndex...dot])
                let text = String(line[line.index(dot, offsetBy: 2)...])
                result.append(.numbered(number, text))
            } else {
                paragraph.append(line)
            }
        }
        flush()
        return result
    }
}
