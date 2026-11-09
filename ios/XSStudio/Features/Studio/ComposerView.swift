import SwiftUI

/// Prompt composer used on the Studio home screen and inside threads.
struct ComposerView: View {
    @Binding var text: String
    @Binding var attachments: [Asset]
    var placeholder: String = "Describe what you need…"
    var isBusy: Bool = false
    var isEnabled: Bool = true
    var onSend: () -> Void

    @State private var showAssetPicker = false
    @FocusState private var isFocused: Bool

    init(text: Binding<String>, attachments: Binding<[Asset]>, placeholder: String = "Describe what you need…",
         isBusy: Bool = false, isEnabled: Bool = true, onSend: @escaping () -> Void) {
        _text = text
        _attachments = attachments
        self.placeholder = placeholder
        self.isBusy = isBusy
        self.isEnabled = isEnabled
        self.onSend = onSend
    }

    private var canSend: Bool {
        isEnabled && !isBusy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 8) {
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { asset in
                            ZStack(alignment: .topTrailing) {
                                RemoteImage(url: asset.thumbURL)
                                    .frame(width: 54, height: 54)
                                    .background(asset.hasAlpha ? AnyView(CheckerboardBackground()) : AnyView(Theme.surface2))
                                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                                Button {
                                    attachments.removeAll { $0.id == asset.id }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 16))
                                        .foregroundStyle(Color.white, Color.black.opacity(0.7))
                                }
                                .offset(x: 5, y: -5)
                            }
                        }
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 6)
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    showAssetPicker = true
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(attachments.isEmpty ? Theme.textMuted : Theme.gold)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Attach assets")

                TextField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.textFaint), axis: .vertical)
                    .lineLimit(1...6)
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .focused($isFocused)
                    .padding(.vertical, 8)

                Button {
                    guard canSend else { return }
                    isFocused = false
                    onSend()
                } label: {
                    ZStack {
                        Circle()
                            .fill(canSend ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(Theme.surface3))
                        if isBusy {
                            ProgressView().tint(.black).controlSize(.small)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(canSend ? Color.black : Theme.textFaint)
                        }
                    }
                    .frame(width: 36, height: 36)
                }
                .disabled(!canSend)
                .accessibilityLabel("Send")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(isFocused ? Theme.gold.opacity(0.5) : Theme.hairline, lineWidth: 0.8)
            )
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(
            LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.92), Color.black], startPoint: .top, endPoint: .center)
                .ignoresSafeArea(edges: .bottom)
        )
        .sheet(isPresented: $showAssetPicker) {
            AssetPickerSheet(initialSelection: attachments) { picked in
                attachments = picked
            }
        }
    }
}
