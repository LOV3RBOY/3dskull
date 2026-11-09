import SwiftUI

struct LibraryView: View {
    @Environment(AppState.self) private var app

    @State private var outputs: [Output] = []
    @State private var kind: OutputKind?
    @State private var status: OutputStatus?
    @State private var favoritesOnly = false
    @State private var search = ""
    @State private var isLoading = false
    @State private var canLoadMore = true
    @State private var errorMessage: String?

    private let pageSize = 40
    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    private var visible: [Output] {
        favoritesOnly ? outputs.filter(\.favorite) : outputs
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    filters

                    if let errorMessage {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                            .padding(.horizontal, 16)
                    }

                    if visible.isEmpty && !isLoading {
                        ContentUnavailableView("No content yet", systemImage: "square.grid.2x2",
                                               description: Text("Everything you create in Studio lands here."))
                            .padding(.top, 60)
                    } else {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(visible) { output in
                                NavigationLink(value: output) {
                                    LibraryCell(output: output)
                                }
                                .buttonStyle(.plain)
                                .onAppear {
                                    if output.id == outputs.last?.id { Task { await loadMore() } }
                                }
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
            .searchable(text: $search, prompt: "Search titles, artists, captions")
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Output.self) { output in
                OutputDetailView(output: output,
                                 onChange: { updated in replace(updated) },
                                 onCreate: { created in outputs.insert(created, at: 0) },
                                 onDelete: { id in outputs.removeAll { $0.id == id } })
            }
            .refreshable { await reload() }
            .task(id: FilterKey(kind: kind, status: status, search: search, version: app.libraryVersion)) {
                if !search.isEmpty { try? await Task.sleep(nanoseconds: 350_000_000) }
                if Task.isCancelled { return }
                await reload()
            }
        }
    }

    private struct FilterKey: Equatable {
        let kind: OutputKind?
        let status: OutputStatus?
        let search: String
        let version: Int
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button { kind = nil } label: { Chip(title: "All", selected: kind == nil) }
                    ForEach(OutputKind.filterable) { option in
                        Button { kind = option } label: { Chip(title: option.label, selected: kind == option) }
                    }
                }
                .padding(.horizontal, 16)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button { favoritesOnly.toggle() } label: {
                        Chip(title: "Favorites", systemImage: favoritesOnly ? "star.fill" : "star", selected: favoritesOnly)
                    }
                    Button { status = nil } label: { Chip(title: "Any status", selected: status == nil) }
                    ForEach(OutputStatus.filterable) { option in
                        Button { status = option } label: { Chip(title: option.label, selected: status == option) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .buttonStyle(.plain)
    }

    private func replace(_ output: Output) {
        if let index = outputs.firstIndex(where: { $0.id == output.id }) {
            outputs[index] = output
        }
    }

    @MainActor
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await app.api.outputs(kind: kind, status: status, query: search, limit: pageSize)
            outputs = page
            canLoadMore = page.count >= pageSize
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func loadMore() async {
        guard canLoadMore, !isLoading, let last = outputs.last else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await app.api.outputs(kind: kind, status: status, query: search, limit: pageSize, before: last.createdAt)
            let existing = Set(outputs.map(\.id))
            outputs.append(contentsOf: page.filter { !existing.contains($0.id) })
            canLoadMore = page.count >= pageSize
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct LibraryCell: View {
    let output: Output

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                Color.clear
                    .aspectRatio(4.0 / 5.0, contentMode: .fit)
                    .overlay {
                        if output.hasImage {
                            RemoteImage(url: output.thumbURL, contentMode: .fill)
                        } else {
                            ZStack {
                                Theme.surface2
                                Text(output.text ?? output.title)
                                    .font(.caption)
                                    .foregroundStyle(Theme.text.opacity(0.75))
                                    .lineLimit(9)
                                    .padding(12)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairline, lineWidth: 0.6))

                HStack(spacing: 4) {
                    if output.status == .approved {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.success)
                    }
                    if output.favorite {
                        Image(systemName: "star.fill").foregroundStyle(Theme.gold)
                    }
                }
                .font(.caption)
                .padding(8)
                .shadow(color: .black.opacity(0.6), radius: 4)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(output.title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(output.kind.label.uppercased())
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Theme.gold)
                    if let format = output.format {
                        Text(format.label).font(.system(size: 10)).foregroundStyle(Theme.textMuted)
                    }
                }
            }
        }
    }
}
