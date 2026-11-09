import SwiftUI
import PhotosUI
import UIKit

struct UploadAssetsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    let items: [PhotosPickerItem]
    let defaultKind: AssetKind
    let defaultArtist: String
    let onUploaded: ([Asset]) -> Void

    @State private var kind: AssetKind = .artistPhoto
    @State private var artist = ""
    @State private var title = ""
    @State private var tags = ""
    @State private var liftSubjects = true
    @State private var loaded: [Data] = []
    @State private var previews: [UIImage] = []
    @State private var isLoadingItems = true
    @State private var isUploading = false
    @State private var completed = 0
    @State private var totalSteps = 0
    @State private var notes: [String] = []
    @State private var didSetDefaults = false

    private var needsArtist: Bool { kind == .artistPhoto || kind == .artistCutout }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if isLoadingItems {
                        HStack { Spacer(); ProgressView().tint(Theme.gold); Spacer() }
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(previews.enumerated()), id: \.offset) { _, image in
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 72, height: 90)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                            }
                        }
                    }
                } header: {
                    Text("\(items.count) photo\(items.count == 1 ? "" : "s")")
                }
                .listRowBackground(Theme.surface)

                Section("Details") {
                    Picker("Type", selection: $kind) {
                        ForEach(AssetKind.uploadable) { Text($0.label).tag($0) }
                    }
                    TextField(needsArtist ? "Artist (required, as billed)" : "Artist (optional)", text: $artist)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                    if items.count == 1 {
                        TextField("Title (optional)", text: $title)
                    }
                    TextField("Tags, comma separated (e.g. press 2026, b&w, official)", text: $tags)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .listRowBackground(Theme.surface)

                if kind == .artistPhoto {
                    Section {
                        Toggle("Also lift the subject (cut-out)", isOn: $liftSubjects)
                    } footer: {
                        Text("Runs on this iPhone with Apple Vision and uploads a transparent PNG cut-out alongside each photo — used for cut-out flyer layouts.")
                    }
                    .listRowBackground(Theme.surface)
                }

                if isUploading || !notes.isEmpty {
                    Section("Progress") {
                        if isUploading {
                            ProgressView(value: Double(completed), total: Double(max(totalSteps, 1)))
                                .tint(Theme.gold)
                        }
                        ForEach(Array(notes.enumerated()), id: \.offset) { _, note in
                            Text(note).font(.caption).foregroundStyle(Theme.textMuted)
                        }
                    }
                    .listRowBackground(Theme.surface)
                }
            }
            .blackList()
            .navigationTitle("Upload assets")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isUploading)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(isUploading)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isUploading {
                        ProgressView().tint(Theme.gold)
                    } else {
                        Button("Upload") { Task { await upload() } }
                            .fontWeight(.semibold)
                            .disabled(isLoadingItems || loaded.isEmpty || (needsArtist && artist.trimmingCharacters(in: .whitespaces).isEmpty))
                    }
                }
            }
            .task { await loadItems() }
            .onAppear {
                guard !didSetDefaults else { return }
                didSetDefaults = true
                kind = defaultKind == .unknown ? .artistPhoto : defaultKind
                artist = defaultArtist
            }
        }
    }

    @MainActor
    private func loadItems() async {
        guard loaded.isEmpty else { return }
        isLoadingItems = true
        defer { isLoadingItems = false }
        var datas: [Data] = []
        var thumbs: [UIImage] = []
        for item in items {
            do {
                if let data = try await item.loadTransferable(type: Data.self) {
                    datas.append(data)
                    if let image = UIImage(data: data),
                       let thumb = await image.byPreparingThumbnail(ofSize: CGSize(width: 216, height: 270)) {
                        thumbs.append(thumb)
                    }
                }
            } catch {
                notes.append("Couldn't read one photo: \(error.localizedDescription)")
            }
        }
        loaded = datas
        previews = thumbs
    }

    @MainActor
    private func upload() async {
        isUploading = true
        notes = []
        completed = 0
        let shouldLift = kind == .artistPhoto && liftSubjects
        totalSteps = loaded.count * (shouldLift ? 2 : 1)
        defer { isUploading = false }

        let tagList = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let artistName = artist.trimmingCharacters(in: .whitespacesAndNewlines)
        var uploaded: [Asset] = []
        var failures = 0

        for (index, data) in loaded.enumerated() {
            guard let prepared = ImagePrep.prepare(data) else {
                notes.append("Photo \(index + 1): unsupported image format.")
                failures += 1
                completed += shouldLift ? 2 : 1
                continue
            }
            do {
                let asset = try await app.api.uploadAsset(data: prepared.data, filename: prepared.filename, mimeType: prepared.mimeType,
                                                          kind: kind, artist: artistName, title: title, tags: tagList)
                uploaded.append(asset)
            } catch {
                failures += 1
                notes.append("Photo \(index + 1): \(error.localizedDescription)")
            }
            completed += 1

            if shouldLift {
                do {
                    let png = try await SubjectLifter.lift(prepared.image)
                    let cutout = try await app.api.uploadAsset(data: png, filename: "cutout-\(index + 1).png", mimeType: "image/png",
                                                               kind: .artistCutout, artist: artistName,
                                                               title: title.isEmpty ? "" : "\(title) (cut-out)",
                                                               tags: tagList + ["cutout"])
                    uploaded.append(cutout)
                } catch {
                    notes.append("Photo \(index + 1) cut-out: \(error.localizedDescription)")
                }
                completed += 1
            }
        }

        onUploaded(uploaded)
        if failures == 0 && notes.isEmpty {
            dismiss()
        } else {
            notes.append("Uploaded \(uploaded.count) file\(uploaded.count == 1 ? "" : "s").")
        }
    }
}
