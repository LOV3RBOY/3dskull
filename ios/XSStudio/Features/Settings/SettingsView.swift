import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var status: SystemStatus?
    @State private var statusError: String?
    @State private var confirmSignOut = false

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = app.user {
                        LabeledContent("Name", value: user.name)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.role.capitalized)
                    }
                }
                .listRowBackground(Theme.surface)

                Section("Server") {
                    LabeledContent("Address") {
                        Text(app.serverURLString)
                            .font(.footnote)
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    if let status {
                        StatusRow(title: "Claude agent", ok: status.anthropic, detail: status.model)
                        StatusRow(title: "Image generation", ok: status.imageProvider != nil, detail: status.imageProvider ?? "Not configured")
                        StatusRow(title: "Cut-out service", ok: status.cutoutProvider != nil, detail: status.cutoutProvider ?? "On-device only")
                        StatusRow(title: "Poster renderer", ok: status.renderer, detail: status.renderer ? "Ready" : "Unavailable")
                    } else if let statusError {
                        Text(statusError).font(.footnote).foregroundStyle(Theme.danger)
                    } else {
                        ProgressView().tint(Theme.gold)
                    }
                }
                .listRowBackground(Theme.surface)

                if app.user?.isAdmin == true {
                    Section("Team") {
                        NavigationLink {
                            UsersView()
                        } label: {
                            Label("Manage users", systemImage: "person.2")
                        }
                    }
                    .listRowBackground(Theme.surface)
                }

                Section {
                    Button("Sign out", role: .destructive) { confirmSignOut = true }
                } footer: {
                    Text("XS Studio \(appVersion)")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)
                }
                .listRowBackground(Theme.surface)
            }
            .blackList()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Sign out of XS Studio?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    dismiss()
                    app.signOut()
                }
            }
            .task { await loadStatus() }
        }
    }

    @MainActor
    private func loadStatus() async {
        do {
            status = try await app.api.systemStatus()
        } catch is CancellationError {
        } catch {
            statusError = error.localizedDescription
        }
    }
}

private struct StatusRow: View {
    let title: String
    let ok: Bool
    let detail: String?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.circle")
                .foregroundStyle(ok ? Theme.success : Theme.danger)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline)
                if let detail, !detail.isEmpty {
                    Text(detail).font(.caption).foregroundStyle(Theme.textMuted)
                }
            }
        }
    }
}

struct UsersView: View {
    @Environment(AppState.self) private var app

    @State private var users: [User] = []
    @State private var errorMessage: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if let errorMessage {
                Section { ErrorBanner(message: errorMessage) { self.errorMessage = nil } }
                    .listRowBackground(Color.clear)
            }
            Section {
                ForEach(users) { user in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(user.name).font(.subheadline.weight(.medium))
                            Spacer()
                            Badge(text: user.role, color: user.isAdmin ? Theme.gold : Theme.textMuted)
                        }
                        Text(user.email).font(.caption).foregroundStyle(Theme.textMuted)
                    }
                    .padding(.vertical, 4)
                    .deleteDisabled(user.id == app.user?.id)
                }
                .onDelete { offsets in
                    let targets = offsets.map { users[$0] }
                    Task { await delete(targets) }
                }
            }
            .listRowBackground(Theme.surface)
        }
        .blackList()
        .navigationTitle("Users")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "person.badge.plus") }
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateUserSheet { user in users.append(user) }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        do {
            users = try await app.api.users()
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete(_ targets: [User]) async {
        for user in targets where user.id != app.user?.id {
            do {
                try await app.api.deleteUser(user.id)
                users.removeAll { $0.id == user.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct CreateUserSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onCreated: (User) -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var role = "editor"
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Full name", text: $name)
                        .textContentType(.name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Temporary password (8+ characters)", text: $password)
                    Picker("Role", selection: $role) {
                        Text("Admin").tag("admin")
                        Text("Editor").tag("editor")
                        Text("Viewer").tag("viewer")
                    }
                } footer: {
                    Text("Editors can create and edit content. Viewers can browse and download. Admins also manage users.")
                }
                .listRowBackground(Theme.surface)

                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }.listRowBackground(Color.clear)
                }
            }
            .blackList()
            .navigationTitle("New user")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(Theme.gold)
                    } else {
                        Button("Create") { Task { await create() } }
                            .fontWeight(.semibold)
                            .disabled(name.isEmpty || !email.contains("@") || password.count < 8)
                    }
                }
            }
        }
    }

    @MainActor
    private func create() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let user = try await app.api.createUser(email: email.trimmingCharacters(in: .whitespaces),
                                                    name: name.trimmingCharacters(in: .whitespaces),
                                                    password: password, role: role)
            onCreated(user)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
