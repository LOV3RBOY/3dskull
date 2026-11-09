import SwiftUI
import PhotosUI

struct AssetsView: View {
    @Environment(AppState.self) private var app

    @State private var assets: [Asset] = []
    @State private var kind: AssetKind?
    @State private var artist: String?
    @State private var search = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var pendingItems: [PhotosPickerItem] = []
    @State private var showUpload = false
    @State private var knownArtists: [String] = []

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    filterBar

                    if let errorMessage {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                            .padding(.horizontal, 16)
                    }

                    if assets.isEmpty && !isLoading {
                        ContentUnavailableView {
                            Label("No assets", systemImage: "photo.stack")
                        } description: {
                            Text("Upload official artist press photos, logos and venue shots. The agent only uses real assets for artist likeness — it never invents faces.")
                        } actions: {
                            PhotosPicker(selection: $pickerItems, maxSelectionCount: 30, matching: .images) {
                                Text("Upload photos")
                            }
                            .buttonStyle(GhostButtonStyle())
                        }
                        .padding(.top, 40)
                    } else {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(assets) { asset in
                                NavigationLink(value: asset) {
                                    AssetCell(asset: asset)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    if isLoading {
                        ProgressView().tint(Theme.gold).frame(maxWidth: .infinity).padding()
                    }
                }
                .padding(.vertical, 12)
            }
            .screenBackground()
            .searchable(text: $search, prompt: "Search title, artist or tag")
            .navigationTitle("Assets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    PhotosPicker(selection: $pickerItems, maxSelectionCount: 30, matching: .images) {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Upload")
                }
            }
            .navigationDestination(for: Asset.self) { asset in
                AssetDetailView(asset: asset,
                                onChange: { updated in replace(updated) },
                                onCreate: { created in assets.insert(created, at: 0) },
                                onDelete: { id in assets.removeAll { $0.id == id } })
            }
            .onChange(of: pickerItems) { _, items in
                guard !items.isEmpty else { return }
                pendingItems = items
                pickerItems = []
                showUpload = true
            }
            .sheet(isPresented: $showUpload) {
                UploadAssetsSheet(items: pendingItems, defaultKind: kind ?? .artistPhoto, defaultArtist: artist ?? "") { uploaded in
                    assets.insert(contentsOf: uploaded, at: 0)
                    rememberArtists(uploaded)
                }
            }
            .refreshable { await load() }
            .task(id: FilterKey(kind: kind, artist: artist, search: search)) {
                if !search.isEmpty { try? await Task.sleep(nanoseconds: 300_000_000) }
                if Task.isCancelled { return }
                await load()
            }
        }
    }

    private struct FilterKey: Equatable {
        let kind: AssetKind?
        let artist: String?
        let search: String
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Menu {
                    Button("All artists") { artist = nil }
                    ForEach(knownArtists, id: \.self) { name in
                        Button(name) { artist = name }
                    }
                } label: {
                    Chip(title: artist ?? "Artist", systemImage: "person.crop.square", selected: artist != nil)
                }
                Button { kind = nil } label: { Chip(title: "All", selected: kind == nil) }
                ForEach(AssetKind.uploadable) { option in
                    Button { kind = option } label: { Chip(title: option.label, selected: kind == option) }
                }
            }
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    private func replace(_ asset: Asset) {
        if let index = assets.firstIndex(where: { $0.id == asset.id }) { assets[index] = asset }
        rememberArtists([asset])
    }

    private func rememberArtists(_ list: [Asset]) {
        var set = Set(knownArtists)
        for asset in list {
            if let name = asset.artist?.trimmingCharacters(in: .whitespaces), !name.isEmpty { set.insert(name) }
        }
        knownArtists = set.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            assets = try await app.api.assets(kind: kind, artist: artist, query: search)
            rememberArtists(assets)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct AssetCell: View {
    let asset: Asset

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay(RemoteImage(url: asset.thumbURL, contentMode: asset.hasAlpha ? .fit : .fill))
                .background(asset.hasAlpha ? AnyView(CheckerboardBackground()) : AnyView(Theme.surface2))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    if asset.kind == .artistCutout {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.caption2)
                            .foregroundStyle(Theme.gold)
                            .padding(6)
                    }
                }
            Text(asset.artist ?? asset.title)
                .font(.caption2.weight(.medium))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
            Text(asset.kind.label.uppercased())
                .font(.system(size: 8, weight: .semibold))
                .tracking(1)
                .foregroundStyle(Theme.textMuted)
        }
    }
}
