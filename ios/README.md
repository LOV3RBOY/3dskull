# XS Studio — iOS app

Native SwiftUI app (iOS 17+, no third-party dependencies) for the XS Studio backend. It's the phone front end for the content agent. You can create flyers, stories, lineups and captions; review and approve them; manage the event calendar, artist assets and the brand system.

## Requirements

- macOS with **Xcode 15.4+** (Xcode 16 recommended)
- An Apple Developer account (for running on device / TestFlight)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) — the `.xcodeproj` is generated from `project.yml`
- A running XS Studio backend (see `../backend/README.md`) reachable from your phone over **HTTPS** (plain `http://` only works for local-network/dev addresses)

## 1. Generate & open the project

```bash
brew install xcodegen
cd ios
xcodegen generate
open XSStudio.xcodeproj
```

Re-run `xcodegen generate` whenever you add/remove files or pull changes that touch `project.yml`.

## 2. Signing

1. In Xcode select the **XSStudio** project → **XSStudio** target → **Signing & Capabilities**.
2. Tick **Automatically manage signing** and pick your **Team**.
3. If `com.xsstudio.app` is taken, change the bundle id. Edit `XS_BUNDLE_ID` in `project.yml` (and optionally `DEVELOPMENT_TEAM`) and regenerate. Or change it directly in Xcode (it will be overwritten on the next `xcodegen generate`).

## 3. Run on your iPhone

1. Plug in the phone (or pair it over Wi‑Fi), select it as the run destination.
2. **⌘R**. First launch on a device: approve the developer certificate in *Settings → General → VPN & Device Management*.
3. On the login screen enter your server address (e.g. `studio.yourdomain.com`; `https://` is added automatically) and the account an admin created for you.

> Subject lifting (artist cut-outs) uses Apple Vision on-device and needs a real iPhone (A12 or newer). It does not run in the Simulator.

## 4. TestFlight

1. In `project.yml` bump `MARKETING_VERSION` (e.g. `1.0.1`) and/or `CURRENT_PROJECT_VERSION` (build number must increase on every upload), then `xcodegen generate`.
2. Select **Any iOS Device (arm64)** as the destination.
3. **Product → Archive**.
4. In the Organizer: **Distribute App → App Store Connect → Upload**.
5. In [App Store Connect](https://appstoreconnect.apple.com) → your app → **TestFlight**. Once processing finishes, add the build to an **Internal Testing** group (your marketing/social team's Apple IDs). Internal testers need no Beta App Review.

The first time, create the app record in App Store Connect (**My Apps → +**) with the same bundle id. `ITSAppUsesNonExemptEncryption` is already set to `false` (the app only uses standard HTTPS), so no export-compliance prompt per build.

## 5. Tests

**⌘U** in Xcode, or:

```bash
xcodebuild test -project XSStudio.xcodeproj -scheme XSStudio -destination 'platform=iOS Simulator,name=iPhone 15'
```

Tests cover model decoding (outputs, events, threads, brand profile round-trip, error envelope) and the SSE parser.

## App structure

```
XSStudio/
  App/            XSStudioApp (entry + UIKit appearance), AppState (session, routing), RootView/MainTabView
  Core/           APIClient (REST + multipart), SSEClient (agent run stream), Models, JSONValue,
                  JSONCoding (tolerant dates), Keychain, ImageCache (+ RemoteImage), LasVegas (time zone helpers)
  Components/     Theme (black + gold design system), MarkdownText / MarkdownDocument
  Features/
    Auth/         LoginView
    Studio/       StudioView (home + quick actions + sessions), ThreadDetailView, ThreadViewModel (live run),
                  RunPanelView (animated step checklist), ComposerView, OutputCardView, AssetPickerSheet
    Library/      LibraryView (grid + filters + paging), OutputDetailView (save/share/approve/format switch/zoom),
                  EditOutputSheet (deterministic text edits → re-render)
    Calendar/     CalendarView (weeks in Las Vegas time, "Make flyer"), EventFormView, PasteLineupView (AI parse)
    Assets/       AssetsView, UploadAssetsSheet (HEIC→JPEG/PNG, optional on-device cut-out), AssetDetailView,
                  ImageProcessing (normalisation + Vision subject lift)
    Brand/        BrandView (reference posts, Brand DNA, team-controlled profile facts), ProfileValueEditor
    Settings/     SettingsView (server/system status, sign out), UsersView (admin)
XSStudioTests/    ModelDecodingTests, SSEParserTests
```

### How it talks to the backend

- Every request sends `Authorization: Bearer <token>`. The token lives in the Keychain and the server URL in `UserDefaults`.
- A `401` anywhere signs the user out.
- Agent runs stream over SSE (`GET /runs/:id/events`). The server replays the full run on connect, so leaving and re-opening a thread (or a dropped connection, retried up to 4×) picks up where it left off.
- To reconnect to a run that's still in flight, the app uses `thread.lastRunId` when the server provides it.
- Image URLs are signed and expire. The in-memory cache keys on the URL **without** the query string, so re-signed URLs still hit the cache.
