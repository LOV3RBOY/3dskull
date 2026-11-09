import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        Group {
            if app.isRestoring {
                SplashView()
            } else if app.isSignedIn {
                MainTabView()
                    .transition(.opacity)
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: app.isSignedIn)
        .animation(.easeInOut(duration: 0.3), value: app.isRestoring)
        .task { await app.restore() }
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            VStack(spacing: 28) {
                Wordmark(size: 56)
                ProgressView().tint(Theme.gold)
            }
        }
    }
}

struct MainTabView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.selectedTab) {
            StudioView()
                .tabItem { Label("Studio", systemImage: "sparkles") }
                .tag(AppTab.studio)
            LibraryView()
                .tabItem { Label("Library", systemImage: "square.grid.2x2") }
                .tag(AppTab.library)
            CalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }
                .tag(AppTab.calendar)
            AssetsView()
                .tabItem { Label("Assets", systemImage: "photo.stack") }
                .tag(AppTab.assets)
            BrandView()
                .tabItem { Label("Brand", systemImage: "crown") }
                .tag(AppTab.brand)
        }
        .tint(Theme.gold)
    }
}
