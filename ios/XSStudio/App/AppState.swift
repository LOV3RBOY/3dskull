import Foundation
import Observation

enum AppTab: Hashable {
    case studio, library, calendar, assets, brand
}

/// Navigation targets the Studio stack can be asked to open from elsewhere (e.g. Calendar → "Make flyer").
enum StudioRoute: Hashable {
    case thread(id: String, runId: String?)
    case output(Output)
}

@Observable
final class AppState {
    let api: APIClient
    let sse: SSEClient

    var user: User?
    var serverURLString: String
    var isRestoring = true
    var selectedTab: AppTab = .studio
    var pendingStudioRoute: StudioRoute?
    /// Bumped whenever outputs change so Library can refresh.
    var libraryVersion = 0

    private static let serverKey = "xs.serverURL"
    private static let tokenAccount = "session-token"

    init() {
        let client = APIClient()
        api = client
        sse = SSEClient(api: client)
        serverURLString = UserDefaults.standard.string(forKey: AppState.serverKey) ?? ""
        api.baseURL = APIClient.normalizedServerURL(serverURLString)
        api.token = Keychain.get(AppState.tokenAccount)
        api.onUnauthorized = { [weak self] in
            self?.signOut()
        }
    }

    var isSignedIn: Bool { user != nil }

    @MainActor
    func restore() async {
        defer { isRestoring = false }
        guard api.baseURL != nil, api.token != nil else { return }
        do {
            user = try await api.me()
        } catch APIError.unauthorized {
            signOut()
        } catch {
            // Offline or server down: keep the token, show login so the user can retry.
            user = nil
        }
    }

    @MainActor
    func signIn(server: String, email: String, password: String) async throws {
        guard let url = APIClient.normalizedServerURL(server) else { throw APIError.invalidServerURL }
        _ = try await api.health(base: url)
        api.baseURL = url
        api.token = nil
        let auth = try await api.login(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
        api.token = auth.token
        Keychain.set(auth.token, for: AppState.tokenAccount)
        serverURLString = url.absoluteString
        UserDefaults.standard.set(url.absoluteString, forKey: AppState.serverKey)
        user = auth.user
        selectedTab = .studio
    }

    @MainActor
    func signOut() {
        Keychain.delete(AppState.tokenAccount)
        api.token = nil
        user = nil
        pendingStudioRoute = nil
    }

    /// Starts a brand-new agent run and jumps to it in Studio.
    @MainActor
    func startCreation(prompt: String, attachmentAssetIds: [String] = []) async throws {
        let response = try await api.create(prompt: prompt, attachmentAssetIds: attachmentAssetIds)
        pendingStudioRoute = .thread(id: response.thread.id, runId: response.runId)
        selectedTab = .studio
    }
}
