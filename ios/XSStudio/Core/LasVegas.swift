import Foundation

/// Calendar helpers pinned to Las Vegas local time (event dates are local `YYYY-MM-DD`).
enum LasVegas {
    static let timeZone: TimeZone = TimeZone(identifier: "America/Los_Angeles") ?? .current

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_US")
        calendar.firstWeekday = 2 // Monday
        return calendar
    }()

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }

    private static let dayFormatter = LasVegas.formatter("yyyy-MM-dd")
    private static let weekdayFormatter = LasVegas.formatter("EEE")
    private static let monthDayFormatter = LasVegas.formatter("MM.dd")
    private static let longFormatter = LasVegas.formatter("EEEE, MMMM d")
    private static let weekHeaderFormatter = LasVegas.formatter("MMM d")

    static func date(fromDay string: String) -> Date? {
        dayFormatter.date(from: string)
    }

    static func dayString(from date: Date) -> String {
        dayFormatter.string(from: date)
    }

    static var today: String { dayString(from: Date()) }

    /// "FRI 11.14" — the XS date-chip style.
    static func chip(_ day: String) -> (weekday: String, date: String) {
        guard let date = date(fromDay: day) else { return ("", day) }
        return (weekdayFormatter.string(from: date).uppercased(), monthDayFormatter.string(from: date))
    }

    static func long(_ day: String) -> String {
        guard let date = date(fromDay: day) else { return day }
        return longFormatter.string(from: date)
    }

    /// Monday that starts the week containing `day`.
    static func weekStart(_ day: String) -> Date? {
        guard let date = date(fromDay: day) else { return nil }
        return calendar.dateInterval(of: .weekOfYear, for: date)?.start
    }

    static func weekHeader(_ start: Date) -> String {
        let thisWeek = calendar.dateInterval(of: .weekOfYear, for: Date())?.start
        if let thisWeek, calendar.isDate(thisWeek, inSameDayAs: start) { return "THIS WEEK" }
        if let thisWeek,
           let next = calendar.date(byAdding: .weekOfYear, value: 1, to: thisWeek),
           calendar.isDate(next, inSameDayAs: start) { return "NEXT WEEK" }
        return "WEEK OF " + weekHeaderFormatter.string(from: start).uppercased()
    }

    static func adding(days: Int, to day: String) -> String {
        guard let date = date(fromDay: day),
              let shifted = calendar.date(byAdding: .day, value: days, to: date) else { return day }
        return dayString(from: shifted)
    }
}
