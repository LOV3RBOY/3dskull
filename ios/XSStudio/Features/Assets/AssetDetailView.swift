import SwiftUI
import UIKit

struct AssetDetailView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var asset: Asset
    var onChange: ((Asset) -> Void)?
    var onCreate: ((Asset) -> Void)?
    var onDelete: ((String) -> Void)?

    @State private var title: String
    @State private var artist: String
    @State private var tags: String
    @State private var kind: AssetKind
    @State private var isSaving = false
    @State private var isLifting = false
    @State private var errorMessage: String?
    @State private var info: String?
    @State private var confirmDelete = false

    init(asset: Asset,
         onChange: ((Asset) -> Void)? = nil,
         onCreate: ((Asset) -> Void)? = nil,
         onDelete: ((String) -> Void)? = nil) {
        _asset = State(initialValue: asset)
        _title = State(initialValue: asset.title)
        _artist = State(initialValue: asset.artist ?? "")
        _tags = State(initialValue: asset.tags.joined(separator: ", "))
        _kind = State(initialValue: asset.kind)
        self.onChange = onChange
        self.onCreate = onCreate
        self.onDelete = onDelete
    }

    private var isDirty: Bool {
        title != asset.title || artist != (asset.artist ?? "") || tags != asset.tags.joined(separator: ", ") || kind != asset.kind
    }

    var body: some View {
        Form {
            Section {
                Color.clear
                    .aspectRatio(asset.aspectRatio, contentMode: .fit)
                    .overlay(RemoteImage(url: asset.fullURL, contentMode: .fit))
                    .background(asset.hasAlpha ? AnyView(CheckerboardBackground()) : AnyView(Theme.surface2))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .frame(maxHeight: 420)
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                HStack {
                    Text("\(Int(asset.width)) × \(Int(asset.height)) px")
                    Spacer()
                    if asset.hasAlpha { Badge(text: "Transparent") }
                }
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
            }
            .listRowBackground(Theme.surface)

            Section("Details") {
                Picker("Type", selection: $kind) {
                    ForEach(AssetKind.uploadable) { Text($0.label).tag($0) }
                    if asset.kind == .unknown { Text("Other").tag(AssetKind.unknown) }
                }
                TextField("Artist", text: $artist)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                TextField("Title", text: $title)
                TextField("Tags (comma separated)", text: $tags)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .listRowBackground(Theme.surface)

            if !asset.hasAlpha && (asset.kind == .artistPhoto || asset.kind == .crowdPhoto || asset.kind == .venuePhoto) {
                Section {
                    Button {
                        Task { await liftSubject() }
                    } label: {
                        HStack {
                            if isLifting { ProgressView().tint(Theme.gold) } else { Image(systemName: "person.crop.rectangle.badge.plus") }
                            Text(isLifting ? "Lifting subject…" : "Lift subject → cut-out")
                        }
                    }
                    .disabled(isLifting)
                } footer: {
                    Text("Creates a transparent PNG with Apple Vision on this iPhone and saves it as an artist cut-out.")
                }
                .listRowBackground(Theme.surface)
            }

            if let analysis = asset.analysis, !analysis.isEmpty {
                Section("AI notes") {
                    Text(analysis)
                        .font(.footnote)
                        .foregroundStyle(Theme.text.opacity(0.85))
                        .textSelection(.enabled)
                }
                .listRowBackground(Theme.surface)
            }

            if let info {
                Section { Text(info).font(.footnote).foregroundStyle(Theme.gold) }
                    .listRowBackground(Theme.surface)
            }

            if let errorMessage {
                Section { ErrorBanner(message: errorMessage) { self.errorMessage = nil } }
                    .listRowBackground(Color.clear)
            }

            Section {
                Button("Delete asset", role: .destructive) { confirmDelete = true }
            }
            .listRowBackground(Theme.surface)
        }
        .blackList()
        .navigationTitle(asset.artist ?? asset.kind.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isSaving {
                    ProgressView().tint(Theme.gold)
                } else {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(!isDirty)
                }
            }
        }
        .confirmationDialog("Delete this asset?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Outputs already rendered with it are not affected.")
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let tagList = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let patch = AssetPatch(title: title, artist: artist.trimmingCharacters(in: .whitespaces), tags: tagList, kind: kind.rawValue)
        do {
            let updated = try await app.api.patchAsset(asset.id, patch)
            asset = updated
            onChange?(updated)
            info = "Saved."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func liftSubject() async {
        guard let url = asset.fullURL else { return }
        isLifting = true
        defer { isLifting = false }
        do {
            let data = try await app.api.downloadData(url)
            guard let image = UIImage(data: data) else { throw SubjectLifter.LiftError.failed }
            let png = try await SubjectLifter.lift(image)
            let created = try await app.api.uploadAsset(data: png, filename: "cutout-\(asset.id).png", mimeType: "image/png",
                                                        kind: .artistCutout, artist: asset.artist,
                                                        title: asset.title.isEmpty ? "" : "\(asset.title) (cut-out)",
                                                        tags: asset.tags + ["cutout"])
            onCreate?(created)
            info = "Cut-out saved to Assets."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete() async {
        do {
            try await app.api.deleteAsset(asset.id)
            onDelete?(asset.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
