import SwiftUI

/// Multi-select picker over the team's asset library (for attaching to prompts).
struct AssetPickerSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    let initialSelection: [Asset]
    let onDone: ([Asset]) -> Void

    @State private var assets: [Asset] = []
    @State private var selectedIds: [String] = []
    @State private var kind: AssetKind?
    @State private var search = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button { kind = nil } label: { Chip(title: "All", selected: kind == nil) }
                            ForEach(AssetKind.uploadable) { option in
                                Button { kind = option } label: { Chip(title: option.label, selected: kind == option) }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .buttonStyle(.plain)

                    if let errorMessage {
                        ErrorBanner(message: errorMessage).padding(.horizontal, 16)
                    }

                    if isLoading && assets.isEmpty {
                        ProgressView().tint(Theme.gold).frame(maxWidth: .infinity).padding(.top, 60)
                    } else if assets.isEmpty {
                        ContentUnavailableView("No assets", systemImage: "photo.stack", description: Text("Upload artist photos, logos and venue shots in the Assets tab."))
                            .padding(.top, 40)
                    } else {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(assets) { asset in
                                let isSelected = selectedIds.contains(asset.id)
                                Button {
                                    toggle(asset)
                                } label: {
                                    ZStack(alignment: .topTrailing) {
                                        Color.clear
                                            .aspectRatio(1, contentMode: .fit)
                                            .overlay(RemoteImage(url: asset.thumbURL, contentMode: asset.hasAlpha ? .fit : .fill))
                                            .background(asset.hasAlpha ? AnyView(CheckerboardBackground()) : AnyView(Theme.surface2))
                                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    .stroke(isSelected ? Theme.gold : Color.clear, lineWidth: 2)
                                            )
                                        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                            .font(.system(size: 20))
                                            .foregroundStyle(isSelected ? Theme.gold : Color.white.opacity(0.7))
                                            .padding(6)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.vertical, 12)
            }
            .screenBackground()
            .searchable(text: $search, prompt: "Search artist, title, tag")
            .navigationTitle("Attach assets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(selectedIds.isEmpty ? "Done" : "Attach \(selectedIds.count)") {
                        let lookup = Dictionary((assets + initialSelection).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
                        onDone(selectedIds.compactMap { lookup[$0] })
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .task(id: TaskKey(kind: kind, search: search)) {
                if !search.isEmpty { try? await Task.sleep(nanoseconds: 300_000_000) }
                await load()
            }
            .onAppear {
                if selectedIds.isEmpty { selectedIds = initialSelection.map(\.id) }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private struct TaskKey: Equatable {
        let kind: AssetKind?
        let search: String
    }

    private func toggle(_ asset: Asset) {
        if let index = selectedIds.firstIndex(of: asset.id) {
            selectedIds.remove(at: index)
        } else {
            selectedIds.append(asset.id)
        }
        Haptics.tap()
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            assets = try await app.api.assets(kind: kind, query: search)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
