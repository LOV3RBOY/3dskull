import SwiftUI

struct EventFormView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    let event: Event?
    let onSaved: (Event) -> Void

    @State private var input = EventInput()
    @State private var date = Date()
    @State private var supportingText = ""
    @State private var hasDoorsTime = false
    @State private var doorsTime = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var didLoad = false

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = LasVegas.timeZone
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    var body: some View {
        NavigationStack {
            Form {
                Section("Artist") {
                    TextField("Headliner (as billed)", text: $input.artist)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                    TextField("Supporting acts (comma separated)", text: $supportingText)
                        .autocorrectionDisabled()
                }
                .listRowBackground(Theme.surface)

                Section("When & where") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                        .environment(\.timeZone, LasVegas.timeZone)
                    Toggle("Doors time", isOn: $hasDoorsTime.animation())
                    if hasDoorsTime {
                        DatePicker("Doors", selection: $doorsTime, displayedComponents: .hourAndMinute)
                            .environment(\.timeZone, LasVegas.timeZone)
                    }
                    Picker("Venue", selection: $input.venue) {
                        ForEach(EventVenue.allCases) { Text($0.rawValue).tag($0.rawValue) }
                    }
                    Picker("Type", selection: $input.eventType) {
                        ForEach(EventType.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                    Picker("Status", selection: $input.status) {
                        ForEach(EventStatus.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                }
                .listRowBackground(Theme.surface)

                Section("Links") {
                    TextField("Tickets URL", text: optionalBinding(\.ticketUrl))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Tables URL", text: optionalBinding(\.tablesUrl))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .listRowBackground(Theme.surface)

                Section("Notes for the creative") {
                    TextField("e.g. Halloween theme, b2b set, special guest TBA", text: optionalBinding(\.notes), axis: .vertical)
                        .lineLimit(2...6)
                }
                .listRowBackground(Theme.surface)

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
                    }
                }
            }
            .blackList()
            .navigationTitle(event == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(Theme.gold)
                    } else {
                        Button("Save") { Task { await save() } }
                            .fontWeight(.semibold)
                            .disabled(input.artist.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .onAppear(perform: populate)
        }
    }

    private func optionalBinding(_ keyPath: WritableKeyPath<EventInput, String?>) -> Binding<String> {
        Binding(
            get: { input[keyPath: keyPath] ?? "" },
            set: { input[keyPath: keyPath] = $0.isEmpty ? nil : $0 }
        )
    }

    private func populate() {
        guard !didLoad else { return }
        didLoad = true
        guard let event else { return }
        input = event.input
        date = LasVegas.date(fromDay: event.date) ?? Date()
        supportingText = event.supportingActs.joined(separator: ", ")
        if let doors = event.doorsTime, let parsed = EventFormView.timeFormatter.date(from: doors) {
            hasDoorsTime = true
            // Anchor the parsed time-of-day onto the event date for the picker.
            let time = LasVegas.calendar.dateComponents([.hour, .minute], from: parsed)
            doorsTime = LasVegas.calendar.date(bySettingHour: time.hour ?? 22, minute: time.minute ?? 30, second: 0, of: date) ?? parsed
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var payload = input
        payload.artist = payload.artist.trimmingCharacters(in: .whitespacesAndNewlines)
        payload.date = LasVegas.dayString(from: date)
        let acts = supportingText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        payload.supportingActs = acts.isEmpty ? nil : acts
        payload.doorsTime = hasDoorsTime ? EventFormView.timeFormatter.string(from: doorsTime) : nil
        do {
            let saved: Event
            if let event {
                saved = try await app.api.updateEvent(event.id, payload)
            } else {
                saved = try await app.api.createEvent(payload)
            }
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
