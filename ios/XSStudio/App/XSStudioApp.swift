import SwiftUI
import UIKit

@main
struct XSStudioApp: App {
    @State private var app = AppState()

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .preferredColorScheme(.dark)
                .tint(Theme.gold)
        }
    }

    private func configureAppearance() {
        let navigation = UINavigationBarAppearance()
        navigation.configureWithOpaqueBackground()
        navigation.backgroundColor = .black
        navigation.shadowColor = UIColor.white.withAlphaComponent(0.08)
        navigation.titleTextAttributes = [
            .foregroundColor: UIColor(Theme.text),
            .font: UIFont.systemFont(ofSize: 15, weight: .semibold),
            .kern: 2.0,
        ]
        navigation.largeTitleTextAttributes = [
            .foregroundColor: UIColor(Theme.text),
            .font: UIFont.systemFont(ofSize: 32, weight: .light),
            .kern: 1.0,
        ]
        UINavigationBar.appearance().standardAppearance = navigation
        UINavigationBar.appearance().scrollEdgeAppearance = navigation
        UINavigationBar.appearance().compactAppearance = navigation

        let tabBar = UITabBarAppearance()
        tabBar.configureWithOpaqueBackground()
        tabBar.backgroundColor = .black
        tabBar.shadowColor = UIColor.white.withAlphaComponent(0.08)
        UITabBar.appearance().standardAppearance = tabBar
        UITabBar.appearance().scrollEdgeAppearance = tabBar
    }
}
