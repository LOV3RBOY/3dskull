import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var app

    @State private var server = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @FocusState private var focus: Field?

    private enum Field { case server, email, password }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            RadialGradient(colors: [Theme.gold.opacity(0.16), .clear], center: .top, startRadius: 10, endRadius: 420)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 36) {
                    Wordmark(size: 64)
                        .padding(.top, 72)

                    Text("Content engine for the XS marketing & social team.")
                        .font(.footnote)
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.center)

                    VStack(spacing: 14) {
                        field("Server", systemImage: "server.rack") {
                            TextField("", text: $server, prompt: Text("studio.yourdomain.com").foregroundColor(Theme.textFaint))
                                .keyboardType(.URL)
                                .textContentType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .server)
                                .submitLabel(.next)
                                .onSubmit { focus = .email }
                        }
                        field("Email", systemImage: "envelope") {
                            TextField("", text: $email, prompt: Text("you@wynnlasvegas.com").foregroundColor(Theme.textFaint))
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focus = .password }
                        }
                        field("Password", systemImage: "lock") {
                            SecureField("", text: $password, prompt: Text("••••••••").foregroundColor(Theme.textFaint))
                                .textContentType(.password)
                                .focused($focus, equals: .password)
                                .submitLabel(.go)
                                .onSubmit { Task { await signIn() } }
                        }
                    }

                    if let errorMessage {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        HStack(spacing: 10) {
                            if isWorking { ProgressView().tint(.black) }
                            Text(isWorking ? "Connecting" : "Sign in")
                        }
                    }
                    .buttonStyle(GoldButtonStyle())
                    .disabled(isWorking || server.isEmpty || email.isEmpty || password.isEmpty)
                    .opacity(server.isEmpty || email.isEmpty || password.isEmpty ? 0.5 : 1)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            if server.isEmpty { server = app.serverURLString }
        }
    }

    @ViewBuilder
    private func field<Content: View>(_ label: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(label, color: Theme.textMuted)
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .foregroundStyle(Theme.gold)
                    .frame(width: 18)
                content()
                    .foregroundStyle(Theme.text)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairline, lineWidth: 0.6))
        }
    }

    @MainActor
    private func signIn() async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await app.signIn(server: server, email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
