import Foundation

enum JSONCoding {
    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let sqlDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()

    private static let dayOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = LasVegas.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// Tolerant date parsing: ISO-8601 with or without fractional seconds, SQL datetime, or a plain day.
    static func parseDate(_ string: String) -> Date? {
        if let date = isoFractional.date(from: string) { return date }
        if let date = isoPlain.date(from: string) { return date }
        if let date = sqlDateTime.date(from: string) { return date }
        if let date = dayOnly.date(from: string) { return date }
        return nil
    }

    static func isoString(_ date: Date) -> String {
        isoFractional.string(from: date)
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let seconds = try? container.decode(Double.self) {
                // Accept epoch milliseconds or seconds.
                return Date(timeIntervalSince1970: seconds > 10_000_000_000 ? seconds / 1000 : seconds)
            }
            let string = try container.decode(String.self)
            if let date = JSONCoding.parseDate(string) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognised date: \(string)")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(JSONCoding.isoString(date))
        }
        return encoder
    }()
}

extension KeyedDecodingContainer {
    /// Decodes a value if present and well-typed, otherwise returns the fallback.
    func value<T: Decodable>(_ key: Key, or fallback: T) -> T {
        (try? decodeIfPresent(T.self, forKey: key)) ?? fallback
    }

    /// Decodes an optional value, treating type mismatches as nil.
    func optional<T: Decodable>(_ key: Key) -> T? {
        let decoded: T? = try? decodeIfPresent(T.self, forKey: key)
        return decoded
    }
}
