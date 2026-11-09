import SwiftUI
import PhotosUI
import UIKit

struct BrandView: View {
    @Environment(AppState.self) private var app

    @State private var profile: [String: JSONValue] = [:]
    @State private var dna: String?
    @State private var dnaUpdatedAt: Date?
    @State private var referenceCount = 0
    @State private var isLoading = false
    @State private var isRebuilding = false
    @State private var errorMessage: String?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var uploadProgress: (done: Int, total: Int)?
    @State private var editingKey: String?
    @State private var showSettings = false
    @State private var dnaExpanded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    hero

                    if let errorMessage {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                    }

                    referencesCard
                    dnaCard
                    profileCard
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle("Brand")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel("Settings")
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: pickerItems) { _, items in
                guard !items.isEmpty else { return }
                let batch = items
                pickerItems = []
                Task { await uploadReferences(batch) }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .sheet(item: Binding(
                get: { editingKey.map { EditingKey(id: $0) } },
                set: { editingKey = $0?.id }
            )) { item in
                ProfileValueEditor(key: item.id, value: profile[item.id] ?? .string("")) { newValue in
                    Task { await saveProfile(key: item.id, value: newValue) }
                }
            }
        }
    }

    private struct EditingKey: Identifiable {
        let id: String
    }

    // MARK: Sections

    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("XS Nightclub · Wynn Las Vegas")
            Text("Brand system")
                .font(.system(size: 30, weight: .ultraLight))
                .foregroundStyle(Theme.text)
            Text("Everything the agents follow: the house style learned from real XS posts, plus the facts the team controls (URLs, phone, legal lines, hashtags).")
                .font(.footnote)
                .foregroundStyle(Theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var referencesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    SectionLabel("Reference posts", color: Theme.textMuted)
                    Text("\(referenceCount)")
                        .font(.system(size: 40, weight: .ultraLight).monospacedDigit())
                        .foregroundStyle(Theme.goldGradient)
                }
                Spacer()
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 50, matching: .images) {
                    Label("Add posts", systemImage: "plus")
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(uploadProgress != nil)
            }
            Text("Upload screenshots or exports of real @xslasvegas flyers and posts. Claude studies each one (layout, type, color, copy) and the Brand DNA is rebuilt from them.")
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let progress = uploadProgress {
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: Double(progress.done), total: Double(max(progress.total, 1)))
                        .tint(Theme.gold)
                    Text("Uploading \(progress.done) of \(progress.total)…")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }
            }
        }
        .padding(16)
        .card()
    }

    private var dnaCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel("Brand DNA", color: Theme.textMuted)
                Spacer()
                Button {
                    Task { await rebuild() }
                } label: {
                    HStack(spacing: 6) {
                        if isRebuilding { ProgressView().controlSize(.small).tint(Theme.gold) }
                        Text(isRebuilding ? "Rebuilding" : "Rebuild")
                    }
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(isRebuilding || referenceCount == 0)
            }

            if let dnaUpdatedAt {
                Text("Updated \(dnaUpdatedAt.formatted(.relative(presentation: .named)))")
                    .font(.caption2)
                    .foregroundStyle(Theme.textFaint)
            }

            if let dna, !dna.isEmpty {
                MarkdownDocument(markdown: dna)
                    .frame(maxHeight: dnaExpanded ? nil : 360, alignment: .top)
                    .clipped()
                    .overlay(alignment: .bottom) {
                        if !dnaExpanded {
                            LinearGradient(colors: [Theme.surface.opacity(0), Theme.surface], startPoint: .top, endPoint: .bottom)
                                .frame(height: 80)
                                .allowsHitTesting(false)
                        }
                    }
                Button(dnaExpanded ? "Show less" : "Read full DNA") {
                    withAnimation(.easeInOut) { dnaExpanded.toggle() }
                }
                .font(.caption.weight(.semibold))
                .tint(Theme.gold)
            } else if isLoading {
                ProgressView().tint(Theme.gold)
            } else {
                Text("No Brand DNA yet. Add reference posts, then tap Rebuild.")
                    .font(.footnote)
                    .foregroundStyle(Theme.textFaint)
            }
        }
        .padding(16)
        .card()
    }

    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Team-controlled facts", color: Theme.textMuted)
            if profile.isEmpty {
                Text(isLoading ? "Loading…" : "No profile fields.")
                    .font(.footnote)
                    .foregroundStyle(Theme.textFaint)
            } else {
                VStack(spacing: 0) {
                    let keys = profile.keys.sorted()
                    ForEach(keys, id: \.self) { key in
                        Button {
                            editingKey = key
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Text(humanize(key))
                                    .font(.caption)
                                    .foregroundStyle(Theme.textMuted)
                                    .frame(width: 120, alignment: .leading)
                                Text(profile[key]?.preview ?? "")
                                    .font(.footnote)
                                    .foregroundStyle(Theme.text)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Image(systemName: "pencil")
                                    .font(.caption)
                                    .foregroundStyle(Theme.textFaint)
                            }
                            .padding(.vertical, 11)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!(app.user?.canEdit ?? false))
                        if key != keys.last { Hairline() }
                    }
                }
            }
        }
        .padding(16)
        .card()
    }

    private func humanize(_ key: String) -> String {
        var result = ""
        for character in key {
            if character == "_" || character == "-" {
                result.append(" ")
            } else if character.isUppercase, !result.isEmpty, result.last != " " {
                result.append(" ")
                result.append(character)
            } else {
                result.append(character)
            }
        }
        return result.prefix(1).uppercased() + result.dropFirst().lowercased()
    }

    // MARK: Actions

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let brand = try await app.api.brand()
            profile = brand.profile
            dna = brand.dna
            dnaUpdatedAt = brand.dnaUpdatedAt
            referenceCount = brand.referenceCount
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func rebuild() async {
        isRebuilding = true
        defer { isRebuilding = false }
        do {
            dna = try await app.api.rebuildDNA()
            dnaUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func uploadReferences(_ items: [PhotosPickerItem]) async {
        uploadProgress = (0, items.count)
        defer { uploadProgress = nil }
        var failures = 0
        for (index, item) in items.enumerated() {
            do {
                guard let data = try await item.loadTransferable(type: Data.self),
                      let prepared = ImagePrep.prepare(data) else {
                    failures += 1
                    continue
                }
                _ = try await app.api.uploadBrandReference(data: prepared.data, filename: prepared.filename, mimeType: prepared.mimeType)
                referenceCount += 1
            } catch {
                failures += 1
                errorMessage = error.localizedDescription
            }
            uploadProgress = (index + 1, items.count)
        }
        if failures > 0 && errorMessage == nil {
            errorMessage = "\(failures) image\(failures == 1 ? "" : "s") couldn't be uploaded."
        }
    }

    @MainActor
    private func saveProfile(key: String, value: JSONValue) async {
        do {
            profile = try await app.api.updateBrandProfile([key: value])
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Type-aware editor for a single brand-profile value.
struct ProfileValueEditor: View {
    let key: String
    let value: JSONValue
    let onSave: (JSONValue) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var bool = false
    @State private var error: String?
    @State private var didLoad = false

    private enum Mode { case string, number, bool, list, json }

    private var mode: Mode {
        switch value {
        case .string, .null: return .string
        case .number: return .number
        case .bool: return .bool
        case .array: return value.stringArray != nil ? .list : .json
        case .object: return .json
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    switch mode {
                    case .string:
                        TextField("Value", text: $text, axis: .vertical).lineLimit(1...10)
                    case .number:
                        TextField("Number", text: $text).keyboardType(.decimalPad)
                    case .bool:
                        Toggle("Enabled", isOn: $bool)
                    case .list:
                        TextEditor(text: $text)
                            .frame(minHeight: 180)
                            .scrollContentBackground(.hidden)
                    case .json:
                        TextEditor(text: $text)
                            .font(.system(.footnote, design: .monospaced))
                            .frame(minHeight: 260)
                            .scrollContentBackground(.hidden)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                } footer: {
                    switch mode {
                    case .list: Text("One item per line.")
                    case .json: Text("Structured value — edit as JSON.")
                    default: EmptyView()
                    }
                }
                .listRowBackground(Theme.surface)

                if let error {
                    Section { ErrorBanner(message: error) }.listRowBackground(Color.clear)
                }
            }
            .blackList()
            .navigationTitle(key)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.fontWeight(.semibold)
                }
            }
            .onAppear(perform: populate)
        }
    }

    private func populate() {
        guard !didLoad else { return }
        didLoad = true
        switch value {
        case .string(let string): text = string
        case .null: text = ""
        case .number: text = value.preview
        case .bool(let flag): bool = flag
        case .array:
            if let list = value.stringArray { text = list.joined(separator: "\n") } else { text = value.prettyJSON }
        case .object: text = value.prettyJSON
        }
    }

    private func save() {
        let newValue: JSONValue
        switch mode {
        case .string:
            newValue = .string(text)
        case .number:
            guard let number = Double(text.replacingOccurrences(of: ",", with: ".")) else { error = "Enter a valid number."; return }
            newValue = .number(number)
        case .bool:
            newValue = .bool(bool)
        case .list:
            let items = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            newValue = .array(items.map { .string($0) })
        case .json:
            guard let parsed = JSONValue.parse(json: text) else { error = "That isn't valid JSON."; return }
            newValue = parsed
        }
        onSave(newValue)
        dismiss()
    }
}
