import SwiftUI
import UIKit

/// In-memory image cache keyed by URL *without* the query string, so re-signed URLs
/// (`?exp=..&sig=..`) for the same file still hit the cache.
final class ImageCache {
    static let shared = ImageCache()

    private let cache = NSCache<NSString, UIImage>()
    private let session: URLSession

    private init() {
        cache.totalCostLimit = 200 * 1024 * 1024
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.urlCache = URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024)
        session = URLSession(configuration: configuration)
    }

    static func key(for url: URL) -> String {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url.absoluteString }
        components.query = nil
        return components.string ?? url.absoluteString
    }

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: ImageCache.key(for: url) as NSString)
    }

    func image(for url: URL) async throws -> UIImage {
        if let hit = cached(url) { return hit }
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.http(http.statusCode)
        }
        guard let image = UIImage(data: data) else { throw APIError.decoding("Not an image") }
        let prepared = await image.byPreparingForDisplay() ?? image
        cache.setObject(prepared, forKey: ImageCache.key(for: url) as NSString, cost: data.count)
        return prepared
    }

    func remove(_ url: URL) {
        cache.removeObject(forKey: ImageCache.key(for: url) as NSString)
    }
}

/// Cached remote image with a dark shimmer placeholder.
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else if failed {
                Theme.surface2
                    .overlay(Image(systemName: "photo").foregroundStyle(Theme.textFaint))
            } else {
                ShimmerView()
            }
        }
        .task(id: url) {
            guard let url else { failed = true; return }
            if let hit = ImageCache.shared.cached(url) {
                image = hit
                return
            }
            image = nil
            failed = false
            do {
                let loaded = try await ImageCache.shared.image(for: url)
                withAnimation(.easeOut(duration: 0.25)) { image = loaded }
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
    }
}

struct ShimmerView: View {
    @State private var phase: CGFloat = -1

    var body: some View {
        GeometryReader { proxy in
            Theme.surface2
                .overlay(
                    LinearGradient(colors: [.clear, Color.white.opacity(0.06), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: proxy.size.width * 0.6)
                        .offset(x: phase * proxy.size.width)
                )
                .clipped()
        }
        .onAppear {
            withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1.4 }
        }
    }
}
