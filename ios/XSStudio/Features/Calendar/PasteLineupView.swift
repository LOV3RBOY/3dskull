import SwiftUI
import UIKit

/// Paste an email / calendar export → Claude parses it → pick which events to save.
struct PasteLineupView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    let onSaved: ([Event]) -> Void

    @State private var text = ""
    @State private var parsed: [EventInput] = []
    @State private var selected: Set<Int> = []
    @State private var isParsing = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Paste the lineup — e.g. \"Fri 11/14 Diplo, Sat 11/15 Kaskade w/ special guest…\"", text: $text, axis: .vertical)
                        .lineLimit(6...16)
                        .font(.callout)
                    HStack {
                        Button {
                            if let clip = UIPasteboard.general.string { text = clip }
                        } label: {
                            Label("Paste", systemImage: "doc.on.clipboard")
                        }
                        .buttonStyle(.borderless)
                        Spacer()
                        Button {
                            Task { await parse() }
                        } label: {
                            if isParsing {
                                ProgressView().tint(Theme.gold)
                            } else {
                                Label("Parse with AI", systemImage: "sparkles")
                            }
                        }
                        .buttonStyle(.borderless)
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isParsing)
                    }
                    .font(.footnote.weight(.semibold))
                } footer: {
                    Text("Nothing is saved until you review it. Dates are interpreted in Las Vegas time.")
                }
                .listRowBackground(Theme.surface)

                if !parsed.isEmpty {
                    Section("Found \(parsed.count)") {
                        ForEach(Array(parsed.enumerated()), id: \.offset) { index, event in
                            Button {
                                if selected.contains(index) { selected.remove(index) } else { selected.insert(index) }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: selected.contains(index) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(index) ? Theme.gold : Theme.textFaint)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(event.artist.uppercased())
                                            .font(.subheadline.weight(.semibold))
                                            .tracking(1)
                                            .foregroundStyle(Theme.text)
                                        Text("\(LasVegas.long(event.date)) · \(event.venue)\(event.status == "tentative" ? " · Tentative" : "")")
                                            .font(.caption)
                                            .foregroundStyle(Theme.textMuted)
                                        if let acts = event.supportingActs, !acts.isEmpty {
                                            Text("w/ " + acts.joined(separator: ", "))
                                                .font(.caption2)
                                                .foregroundStyle(Theme.textFaint)
                                        }
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .listRowBackground(Theme.surface)
                }

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
                    }
                }
            }
            .blackList()
            .navigationTitle("Paste lineup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(Theme.gold)
                    } else {
                        Button(selected.isEmpty ? "Save" : "Save \(selected.count)") {
                            Task { await save() }
                        }
                        .fontWeight(.semibold)
                        .disabled(selected.isEmpty)
                    }
                }
            }
        }
    }

    @MainActor
    private func parse() async {
        isParsing = true
        errorMessage = nil
        defer { isParsing = false }
        do {
            parsed = try await app.api.parseEvents(text: text)
            selected = Set(parsed.indices)
            if parsed.isEmpty { errorMessage = "No events found in that text." }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var saved: [Event] = []
        var failures = 0
        for index in selected.sorted() where parsed.indices.contains(index) {
            do {
                saved.append(try await app.api.createEvent(parsed[index]))
            } catch {
                failures += 1
                errorMessage = error.localizedDescription
            }
        }
        onSaved(saved)
        if failures == 0 { dismiss() }
    }
}
