import Foundation
import CoreGraphics

// MARK: - Open enums (tolerant of unknown server values)

enum RunState: String, Codable, Hashable {
    case queued, running, needsInput = "needs_input", completed, failed, cancelled, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = RunState(rawValue: raw) ?? .unknown
    }

    var isActive: Bool { self == .queued || self == .running }

    var label: String {
        switch self {
        case .queued: return "Queued"
        case .running: return "Working"
        case .needsInput: return "Needs input"
        case .completed: return "Done"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        case .unknown: return "—"
        }
    }
}

enum OutputKind: String, Codable, Hashable, CaseIterable, Identifiable {
    case flyer, story, lineup, announcement, caption, copy, recap, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OutputKind(rawValue: raw) ?? .unknown
    }

    var id: String { rawValue }
    static var filterable: [OutputKind] { [.flyer, .story, .lineup, .announcement, .recap, .caption, .copy] }

    var label: String {
        switch self {
        case .flyer: return "Flyer"
        case .story: return "Story"
        case .lineup: return "Lineup"
        case .announcement: return "Announcement"
        case .caption: return "Caption"
        case .copy: return "Copy"
        case .recap: return "Recap"
        case .unknown: return "Other"
        }
    }

    var isTextOnly: Bool { self == .caption || self == .copy }
}

enum OutputStatus: String, Codable, Hashable, CaseIterable, Identifiable {
    case draft, approved, rejected, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OutputStatus(rawValue: raw) ?? .unknown
    }

    var id: String { rawValue }
    static var filterable: [OutputStatus] { [.draft, .approved, .rejected] }
    var label: String { rawValue == "unknown" ? "—" : rawValue.capitalized }
}

enum AssetKind: String, Codable, Hashable, CaseIterable, Identifiable {
    case artistPhoto = "artist_photo"
    case artistCutout = "artist_cutout"
    case logo
    case venuePhoto = "venue_photo"
    case crowdPhoto = "crowd_photo"
    case texture
    case brandReference = "brand_reference"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AssetKind(rawValue: raw) ?? .unknown
    }

    var id: String { rawValue }
    static var uploadable: [AssetKind] { [.artistPhoto, .artistCutout, .logo, .venuePhoto, .crowdPhoto, .texture, .brandReference] }

    var label: String {
        switch self {
        case .artistPhoto: return "Artist photo"
        case .artistCutout: return "Artist cut-out"
        case .logo: return "Logo"
        case .venuePhoto: return "Venue"
        case .crowdPhoto: return "Crowd"
        case .texture: return "Texture"
        case .brandReference: return "Reference post"
        case .unknown: return "Other"
        }
    }
}

/// Output formats the renderer supports.
enum FormatOption: String, CaseIterable, Identifiable, Hashable {
    case feed = "feed_4x5"
    case story = "story_9x16"
    case square = "square_1x1"
    case landscape = "landscape_16x9"
    case print = "print_18x24"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .feed: return "Feed 4:5"
        case .story: return "Story 9:16"
        case .square: return "Square"
        case .landscape: return "16:9"
        case .print: return "Print 18×24"
        }
    }
}

// MARK: - Auth & users

struct User: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String
    let role: String
    let createdAt: Date?

    var isAdmin: Bool { role == "admin" }
    var canEdit: Bool { role == "admin" || role == "editor" }
}

struct AuthResponse: Codable {
    let token: String
    let user: User
}

struct HealthResponse: Codable {
    let ok: Bool
    let version: String?
}

struct SystemStatus: Codable, Hashable {
    let anthropic: Bool
    let imageProvider: String?
    let cutoutProvider: String?
    let renderer: Bool
    let model: String?
}

// MARK: - Studio

struct StudioThread: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    let createdAt: Date
    var updatedAt: Date
    var lastRunState: RunState?
    /// Not in the v1 contract table but used (if the server sends it) to reconnect to an in-flight run.
    var lastRunId: String?
    var coverUrl: String?

    var coverURL: URL? { coverUrl.flatMap(URL.init(string:)) }
}

struct ChatMessage: Codable, Identifiable, Hashable {
    let id: String
    let threadId: String
    let role: String
    var text: String
    var attachmentAssetIds: [String]
    var outputIds: [String]
    let createdAt: Date

    var isUser: Bool { role == "user" }

    enum CodingKeys: String, CodingKey {
        case id, threadId, role, text, attachmentAssetIds, outputIds, createdAt
    }

    init(id: String, threadId: String, role: String, text: String, attachmentAssetIds: [String] = [], outputIds: [String] = [], createdAt: Date = Date()) {
        self.id = id
        self.threadId = threadId
        self.role = role
        self.text = text
        self.attachmentAssetIds = attachmentAssetIds
        self.outputIds = outputIds
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        threadId = c.value(.threadId, or: "")
        role = c.value(.role, or: "assistant")
        text = c.value(.text, or: "")
        attachmentAssetIds = c.value(.attachmentAssetIds, or: [])
        outputIds = c.value(.outputIds, or: [])
        createdAt = c.value(.createdAt, or: Date())
    }
}

struct Run: Codable, Identifiable, Hashable {
    let id: String
    let threadId: String
    var state: RunState
    var error: String?
    let createdAt: Date?
    var finishedAt: Date?
}

struct ThreadDetail: Codable {
    let thread: StudioThread
    let messages: [ChatMessage]
    let outputs: [Output]
}

struct CreateResponse: Codable {
    let thread: StudioThread
    let runId: String
}

struct PostMessageResponse: Codable {
    let message: ChatMessage
    let runId: String
}

// MARK: - Outputs

struct OutputFormat: Codable, Hashable {
    let id: String
    let label: String
    let width: Double
    let height: Double

    var aspectRatio: CGFloat {
        guard width > 0, height > 0 else { return 4.0 / 5.0 }
        return CGFloat(width / height)
    }
}

struct EditableField: Codable, Hashable, Identifiable {
    let key: String
    let label: String
    let multiline: Bool

    var id: String { key }

    enum CodingKeys: String, CodingKey { case key, label, multiline }

    init(key: String, label: String, multiline: Bool) {
        self.key = key
        self.label = label
        self.multiline = multiline
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        label = c.value(.label, or: key)
        multiline = c.value(.multiline, or: false)
    }
}

struct Output: Codable, Identifiable, Hashable {
    let id: String
    let threadId: String?
    let runId: String?
    let kind: OutputKind
    var title: String
    let format: OutputFormat?
    let template: String?
    let fields: [String: String]?
    let editableFields: [EditableField]?
    let imageUrl: String?
    let thumbUrl: String?
    var text: String?
    var status: OutputStatus
    var favorite: Bool
    let parentId: String?
    let createdAt: Date
    let meta: JSONValue?

    var imageURL: URL? { imageUrl.flatMap(URL.init(string:)) }
    var thumbURL: URL? { (thumbUrl ?? imageUrl).flatMap(URL.init(string:)) }
    var hasImage: Bool { imageURL != nil }
    var aspectRatio: CGFloat { format?.aspectRatio ?? 4.0 / 5.0 }
    var isRenderable: Bool { template != nil && hasImage }

    enum CodingKeys: String, CodingKey {
        case id, threadId, runId, kind, title, format, template, fields, editableFields
        case imageUrl, thumbUrl, text, status, favorite, parentId, createdAt, meta
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        threadId = c.optional(.threadId)
        runId = c.optional(.runId)
        kind = c.value(.kind, or: .unknown)
        title = c.value(.title, or: "Untitled")
        format = c.optional(.format)
        template = c.optional(.template)
        fields = c.optional(.fields)
        editableFields = c.optional(.editableFields)
        imageUrl = c.optional(.imageUrl)
        thumbUrl = c.optional(.thumbUrl)
        text = c.optional(.text)
        status = c.value(.status, or: .draft)
        favorite = c.value(.favorite, or: false)
        parentId = c.optional(.parentId)
        createdAt = c.value(.createdAt, or: Date())
        meta = c.optional(.meta)
    }
}

// MARK: - Assets

struct Asset: Codable, Identifiable, Hashable {
    let id: String
    var kind: AssetKind
    var title: String
    var artist: String?
    var tags: [String]
    let url: String
    let thumbUrl: String?
    let width: Double
    let height: Double
    let hasAlpha: Bool
    let analysis: String?
    let createdAt: Date

    var fullURL: URL? { URL(string: url) }
    var thumbURL: URL? { URL(string: thumbUrl ?? url) }
    var aspectRatio: CGFloat { width > 0 && height > 0 ? CGFloat(width / height) : 1 }

    enum CodingKeys: String, CodingKey {
        case id, kind, title, artist, tags, url, thumbUrl, width, height, hasAlpha, analysis, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = c.value(.kind, or: .unknown)
        title = c.value(.title, or: "")
        artist = c.optional(.artist)
        tags = c.value(.tags, or: [])
        url = c.value(.url, or: "")
        thumbUrl = c.optional(.thumbUrl)
        width = c.value(.width, or: 0)
        height = c.value(.height, or: 0)
        hasAlpha = c.value(.hasAlpha, or: false)
        analysis = c.optional(.analysis)
        createdAt = c.value(.createdAt, or: Date())
    }
}

// MARK: - Events

enum EventVenue: String, CaseIterable, Identifiable {
    case xs = "XS"
    case nightswim = "XS Nightswim"
    case ebc = "Encore Beach Club"
    case ebcNight = "EBC at Night"
    case other = "Other"
    var id: String { rawValue }
}

enum EventType: String, CaseIterable, Identifiable {
    case regular, residency, special, holiday
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum EventStatus: String, CaseIterable, Identifiable {
    case confirmed, tentative, cancelled
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct EventInput: Codable, Hashable {
    var artist: String
    var date: String
    var venue: String
    var eventType: String
    var supportingActs: [String]?
    var doorsTime: String?
    var ticketUrl: String?
    var tablesUrl: String?
    var notes: String?
    var status: String

    init(artist: String = "", date: String = LasVegas.today, venue: String = EventVenue.xs.rawValue,
         eventType: String = EventType.regular.rawValue, supportingActs: [String]? = nil, doorsTime: String? = nil,
         ticketUrl: String? = nil, tablesUrl: String? = nil, notes: String? = nil, status: String = EventStatus.confirmed.rawValue) {
        self.artist = artist
        self.date = date
        self.venue = venue
        self.eventType = eventType
        self.supportingActs = supportingActs
        self.doorsTime = doorsTime
        self.ticketUrl = ticketUrl
        self.tablesUrl = tablesUrl
        self.notes = notes
        self.status = status
    }

    enum CodingKeys: String, CodingKey {
        case artist, date, venue, eventType, supportingActs, doorsTime, ticketUrl, tablesUrl, notes, status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        artist = c.value(.artist, or: "")
        date = c.value(.date, or: LasVegas.today)
        venue = c.value(.venue, or: EventVenue.xs.rawValue)
        eventType = c.value(.eventType, or: EventType.regular.rawValue)
        supportingActs = c.optional(.supportingActs)
        doorsTime = c.optional(.doorsTime)
        ticketUrl = c.optional(.ticketUrl)
        tablesUrl = c.optional(.tablesUrl)
        notes = c.optional(.notes)
        status = c.value(.status, or: EventStatus.confirmed.rawValue)
    }
}

struct Event: Codable, Identifiable, Hashable {
    let id: String
    var artist: String
    var date: String
    var venue: String
    var eventType: String
    var supportingActs: [String]
    var doorsTime: String?
    var ticketUrl: String?
    var tablesUrl: String?
    var notes: String?
    var status: String
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, artist, date, venue, eventType, supportingActs, doorsTime, ticketUrl, tablesUrl, notes, status, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        artist = c.value(.artist, or: "")
        date = c.value(.date, or: "")
        venue = c.value(.venue, or: EventVenue.xs.rawValue)
        eventType = c.value(.eventType, or: EventType.regular.rawValue)
        supportingActs = c.value(.supportingActs, or: [])
        doorsTime = c.optional(.doorsTime)
        ticketUrl = c.optional(.ticketUrl)
        tablesUrl = c.optional(.tablesUrl)
        notes = c.optional(.notes)
        status = c.value(.status, or: EventStatus.confirmed.rawValue)
        createdAt = c.optional(.createdAt)
        updatedAt = c.optional(.updatedAt)
    }

    var input: EventInput {
        EventInput(artist: artist, date: date, venue: venue, eventType: eventType,
                   supportingActs: supportingActs.isEmpty ? nil : supportingActs, doorsTime: doorsTime,
                   ticketUrl: ticketUrl, tablesUrl: tablesUrl, notes: notes, status: status)
    }
}

struct ParsedEventsResponse: Codable {
    let events: [EventInput]
}

// MARK: - Brand & templates

struct BrandResponse: Codable {
    let profile: [String: JSONValue]
    let dna: String?
    let dnaUpdatedAt: Date?
    let referenceCount: Int

    enum CodingKeys: String, CodingKey { case profile, dna, dnaUpdatedAt, referenceCount }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profile = c.value(.profile, or: [:])
        dna = c.optional(.dna)
        dnaUpdatedAt = c.optional(.dnaUpdatedAt)
        referenceCount = c.value(.referenceCount, or: 0)
    }
}

struct DNAResponse: Codable {
    let dna: String
}

struct TemplateInfo: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let kinds: [String]?
    let fields: [EditableField]?
    let previewUrl: String?
}

// MARK: - Errors

struct APIErrorEnvelope: Codable {
    struct Body: Codable {
        let code: String?
        let message: String?
    }
    let error: Body
}
