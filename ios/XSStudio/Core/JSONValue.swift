import Foundation

/// A loss-less JSON value so arbitrary server objects (brand profile, output meta) round-trip.
enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var stringArray: [String]? {
        guard case .array(let items) = self else { return nil }
        var out: [String] = []
        for item in items {
            guard case .string(let value) = item else { return nil }
            out.append(value)
        }
        return out
    }

    /// One-line human preview used in lists.
    var preview: String {
        switch self {
        case .string(let value): return value
        case .number(let value):
            return value.rounded() == value && abs(value) < 1e15 ? String(Int(value)) : String(value)
        case .bool(let value): return value ? "Yes" : "No"
        case .array(let items):
            if let strings = stringArray { return strings.joined(separator: ", ") }
            return "\(items.count) items"
        case .object(let dict): return "\(dict.count) fields"
        case .null: return "—"
        }
    }

    /// Pretty-printed JSON text (used for editing complex values).
    var prettyJSON: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(self), let text = String(data: data, encoding: .utf8) else { return "" }
        return text
    }

    static func parse(json text: String) -> JSONValue? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }
}
