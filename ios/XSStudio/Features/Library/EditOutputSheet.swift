import SwiftUI

/// Deterministic text editor for a rendered design (no AI — the server re-renders the template).
struct EditOutputSheet: View {
    let output: Output
    let onSave: ([String: String]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: String] = [:]

    private var fields: [EditableField] { output.editableFields ?? [] }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(fields) { field in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(field.label.uppercased())
                                .font(.system(size: 10, weight: .semibold))
                                .tracking(1.6)
                                .foregroundStyle(Theme.gold)
                            if field.multiline {
                                TextField(field.label, text: binding(for: field.key), axis: .vertical)
                                    .lineLimit(2...8)
                            } else {
                                TextField(field.label, text: binding(for: field.key))
                            }
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Theme.surface)
                    }
                } footer: {
                    Text("Exact text is typeset by the XS template engine — spelling, dates and times render exactly as entered.")
                        .font(.caption2)
                }
            }
            .blackList()
            .navigationTitle("Edit design text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Render") {
                        let original = output.fields ?? [:]
                        let changed = values.filter { original[$0.key] != $0.value }
                        onSave(changed.isEmpty ? values : changed)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                if values.isEmpty {
                    var initial: [String: String] = [:]
                    for field in fields { initial[field.key] = output.fields?[field.key] ?? "" }
                    values = initial
                }
            }
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { values[key] ?? "" },
            set: { values[key] = $0 }
        )
    }
}
