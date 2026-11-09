import SwiftUI
import Photos
import UIKit

struct OutputDetailView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var output: Output
    var onChange: ((Output) -> Void)?
    var onCreate: ((Output) -> Void)?
    var onDelete: ((String) -> Void)?

    @State private var isWorking = false
    @State private var workingLabel = ""
    @State private var errorMessage: String?
    @State private var toast: String?
    @State private var showEditor = false
    @State private var confirmDelete = false
    @State private var shareURL: URL?
    @State private var showFullscreen = false

    init(output: Output,
         onChange: ((Output) -> Void)? = nil,
         onCreate: ((Output) -> Void)? = nil,
         onDelete: ((String) -> Void)? = nil) {
        _output = State(initialValue: output)
        self.onChange = onChange
        self.onCreate = onCreate
        self.onDelete = onDelete
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if output.hasImage {
                    Button { showFullscreen = true } label: {
                        Color.clear
                            .aspectRatio(output.aspectRatio, contentMode: .fit)
                            .overlay(RemoteImage(url: output.imageURL, contentMode: .fit))
                            .background(Theme.surface2)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(alignment: .bottomTrailing) {
                                Image(systemName: "arrow.up.left.and.arrow.down.right")
                                    .font(.caption.weight(.semibold))
                                    .padding(8)
                                    .background(.ultraThinMaterial, in: Circle())
                                    .padding(10)
                            }
                    }
                    .buttonStyle(.plain)
                }

                titleBlock

                if let errorMessage {
                    ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                }

                actionRow

                if output.isRenderable {
                    formatSwitcher
                }

                if let text = output.text, !text.isEmpty {
                    captionBlock(text)
                }

                if let fields = output.fields, !fields.isEmpty {
                    fieldsBlock(fields)
                }

                reviewBlock
            }
            .padding(16)
        }
        .screenBackground()
        .overlay {
            if isWorking {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                    VStack(spacing: 14) {
                        ProgressView().tint(Theme.gold).controlSize(.large)
                        Text(workingLabel).font(.footnote).foregroundStyle(Theme.text)
                    }
                    .padding(28)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
        }
        .overlay(alignment: .top) {
            if let toast {
                Text(toast)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Theme.goldGradient))
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle(output.kind.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Image(systemName: output.favorite ? "star.fill" : "star")
                }
                Menu {
                    if output.isRenderable && !(output.editableFields ?? []).isEmpty {
                        Button { showEditor = true } label: { Label("Edit text", systemImage: "character.cursor.ibeam") }
                    }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showEditor) {
            EditOutputSheet(output: output) { fields in
                Task { await rerender(fields: fields, format: nil, label: "Re-rendering…") }
            }
        }
        .fullScreenCover(isPresented: $showFullscreen) {
            ZoomableImageView(url: output.imageURL)
        }
        .confirmationDialog("Delete this \(output.kind.label.lowercased())?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
        }
        .task(id: output.id) { await prepareShareFile() }
    }

    // MARK: Sections

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Badge(text: output.kind.label)
                if let format = output.format {
                    Text("\(format.label) · \(Int(format.width))×\(Int(format.height))")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
                statusBadge
            }
            Text(output.title)
                .font(.system(size: 22, weight: .light))
                .foregroundStyle(Theme.text)
            Text(output.createdAt, format: .dateTime.month().day().hour().minute())
                .font(.caption)
                .foregroundStyle(Theme.textFaint)
        }
    }

    @ViewBuilder
    private var statusBadge: some View {
        switch output.status {
        case .approved: Badge(text: "Approved", color: Theme.success)
        case .rejected: Badge(text: "Rejected", color: Theme.danger)
        default: Badge(text: "Draft", color: Theme.textMuted)
        }
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            if output.hasImage {
                Button {
                    Task { await saveToPhotos() }
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(GoldButtonStyle())
            }

            if let shareURL {
                ShareLink(item: shareURL) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
            } else if let text = output.text, !text.isEmpty, !output.hasImage {
                ShareLink(item: text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
            }
        }
    }

    private var formatSwitcher: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Formats", color: Theme.textMuted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(FormatOption.allCases) { option in
                        let isCurrent = output.format?.id == option.rawValue
                        Button {
                            guard !isCurrent else { return }
                            Task { await rerender(fields: nil, format: option.rawValue, label: "Rendering \(option.label)…") }
                        } label: {
                            Chip(title: option.label, selected: isCurrent)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Text("Re-renders the same design into another size — creates a new version, the original stays in the Library.")
                .font(.caption2)
                .foregroundStyle(Theme.textFaint)
        }
    }

    private func captionBlock(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel(output.hasImage ? "Caption" : "Copy", color: Theme.textMuted)
                Spacer()
                Button {
                    UIPasteboard.general.string = text
                    showToast("Copied")
                } label: {
                    Label("Copy", systemImage: "doc.on.doc").font(.caption.weight(.semibold))
                }
                .tint(Theme.gold)
            }
            Text(text)
                .font(.callout)
                .foregroundStyle(Theme.text.opacity(0.9))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .card()
        }
    }

    private func fieldsBlock(_ fields: [String: String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel("Design text", color: Theme.textMuted)
                Spacer()
                if output.isRenderable && !(output.editableFields ?? []).isEmpty {
                    Button("Edit") { showEditor = true }
                        .font(.caption.weight(.semibold))
                        .tint(Theme.gold)
                }
            }
            VStack(spacing: 0) {
                ForEach(orderedFieldKeys(fields), id: \.self) { key in
                    HStack(alignment: .firstTextBaseline) {
                        Text(label(for: key))
                            .font(.caption)
                            .foregroundStyle(Theme.textMuted)
                            .frame(width: 110, alignment: .leading)
                        Text(fields[key] ?? "")
                            .font(.footnote)
                            .foregroundStyle(Theme.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 9)
                    .padding(.horizontal, 14)
                    if key != orderedFieldKeys(fields).last { Hairline() }
                }
            }
            .card()
        }
    }

    private var reviewBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Review", color: Theme.textMuted)
            HStack(spacing: 10) {
                Button {
                    Task { await setStatus(.approved) }
                } label: {
                    Label("Approve", systemImage: "checkmark.seal")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
                .opacity(output.status == .approved ? 0.45 : 1)
                .disabled(output.status == .approved)

                Button {
                    Task { await setStatus(.rejected) }
                } label: {
                    Label("Reject", systemImage: "xmark.seal")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
                .opacity(output.status == .rejected ? 0.45 : 1)
                .disabled(output.status == .rejected)
            }
        }
    }

    // MARK: Helpers

    private func orderedFieldKeys(_ fields: [String: String]) -> [String] {
        let preferred = (output.editableFields ?? []).map(\.key)
        let rest = fields.keys.filter { !preferred.contains($0) }.sorted()
        return preferred.filter { fields[$0] != nil } + rest
    }

    private func label(for key: String) -> String {
        output.editableFields?.first(where: { $0.key == key })?.label ?? key.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func showToast(_ message: String) {
        Haptics.tap()
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            withAnimation { toast = nil }
        }
    }

    // MARK: Actions

    @MainActor
    private func prepareShareFile() async {
        guard let url = output.imageURL else { shareURL = nil; return }
        do {
            let data = try await app.api.downloadData(url)
            let ext = url.pathExtension.isEmpty ? "png" : url.pathExtension
            let safeTitle = output.title
                .components(separatedBy: CharacterSet.alphanumerics.union(.whitespaces).inverted)
                .joined()
                .trimmingCharacters(in: .whitespaces)
                .replacingOccurrences(of: " ", with: "-")
            let name = (safeTitle.isEmpty ? "XS-\(output.id)" : "XS-\(safeTitle)") + "." + ext
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(output.id)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let fileURL = directory.appendingPathComponent(name)
            try data.write(to: fileURL, options: .atomic)
            shareURL = fileURL
        } catch {
            shareURL = nil
        }
    }

    @MainActor
    private func saveToPhotos() async {
        guard let url = output.imageURL else { return }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            errorMessage = "Allow XS Studio to add photos in Settings → Privacy → Photos."
            return
        }
        isWorking = true
        workingLabel = "Saving full resolution…"
        defer { isWorking = false }
        do {
            let data = try await app.api.downloadData(url)
            try await PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            }
            showToast("Saved to Photos")
        } catch {
            errorMessage = "Couldn't save: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func rerender(fields: [String: String]?, format: String?, label: String) async {
        isWorking = true
        workingLabel = label
        defer { isWorking = false }
        do {
            let created = try await app.api.rerender(output.id, fields: fields, format: format)
            output = created
            onCreate?(created)
            app.libraryVersion += 1
            showToast("New version created")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func setStatus(_ status: OutputStatus) async {
        do {
            let updated = try await app.api.patchOutput(output.id, OutputPatch(status: status.rawValue))
            output = updated
            onChange?(updated)
            showToast(status == .approved ? "Approved" : "Marked rejected")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func toggleFavorite() async {
        do {
            let updated = try await app.api.patchOutput(output.id, OutputPatch(favorite: !output.favorite))
            output = updated
            onChange?(updated)
            Haptics.tap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete() async {
        do {
            try await app.api.deleteOutput(output.id)
            onDelete?(output.id)
            app.libraryVersion += 1
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Full-screen pinch-to-zoom viewer.
struct ZoomableImageView: View {
    let url: URL?
    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            RemoteImage(url: url, contentMode: .fit)
                .scaleEffect(scale)
                .offset(offset)
                .gesture(
                    MagnifyGesture()
                        .onChanged { value in
                            scale = min(max(lastScale * value.magnification, 1), 6)
                        }
                        .onEnded { _ in
                            lastScale = scale
                            if scale <= 1 { withAnimation { offset = .zero; lastOffset = .zero } }
                        }
                        .simultaneously(with:
                            DragGesture()
                                .onChanged { value in
                                    guard scale > 1 else { return }
                                    offset = CGSize(width: lastOffset.width + value.translation.width,
                                                    height: lastOffset.height + value.translation.height)
                                }
                                .onEnded { _ in lastOffset = offset }
                        )
                )
                .onTapGesture(count: 2) {
                    withAnimation(.spring()) {
                        if scale > 1 {
                            scale = 1; lastScale = 1; offset = .zero; lastOffset = .zero
                        } else {
                            scale = 2.5; lastScale = 2.5
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .padding(12)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(16)
        }
        .statusBarHidden()
    }
}
