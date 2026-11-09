import SwiftUI

struct CalendarView: View {
    @Environment(AppState.self) private var app

    private enum TimeRange: String, CaseIterable, Identifiable {
        case upcoming = "Upcoming"
        case past = "Past"
        var id: String { rawValue }
    }

    private struct WeekGroup: Identifiable {
        let start: Date
        let events: [Event]
        var id: Date { start }
    }

    @State private var range: TimeRange = .upcoming
    @State private var events: [Event] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var editing: Event?
    @State private var showNew = false
    @State private var showPaste = false
    @State private var creatingFor: String?

    private var groups: [WeekGroup] {
        let sorted = events.sorted { range == .upcoming ? $0.date < $1.date : $0.date > $1.date }
        var buckets: [Date: [Event]] = [:]
        var order: [Date] = []
        for event in sorted {
            guard let start = LasVegas.weekStart(event.date) else { continue }
            if buckets[start] == nil { order.append(start) }
            buckets[start, default: []].append(event)
        }
        return order.map { WeekGroup(start: $0, events: buckets[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Range", selection: $range) {
                        ForEach(TimeRange.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage) { self.errorMessage = nil }
                            .listRowBackground(Color.clear)
                    }
                }

                if events.isEmpty && !isLoading {
                    Section {
                        ContentUnavailableView {
                            Label("No events", systemImage: "calendar")
                        } description: {
                            Text("The calendar is the source of truth for dates on every flyer. Add events or paste a lineup.")
                        } actions: {
                            Button("Paste lineup") { showPaste = true }
                                .buttonStyle(GhostButtonStyle())
                        }
                        .listRowBackground(Color.clear)
                    }
                }

                ForEach(groups) { group in
                    Section {
                        ForEach(group.events) { event in
                            EventRow(event: event, isCreating: creatingFor == event.id) {
                                Task { await makeFlyer(for: event) }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { editing = event }
                            .listRowBackground(Theme.surface)
                            .listRowSeparatorTint(Theme.hairline)
                        }
                        .onDelete { offsets in
                            let toDelete = offsets.map { group.events[$0] }
                            Task { await delete(toDelete) }
                        }
                    } header: {
                        SectionLabel(LasVegas.weekHeader(group.start), color: Theme.gold)
                            .padding(.top, 6)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .blackList()
            .overlay {
                if isLoading && events.isEmpty { ProgressView().tint(Theme.gold) }
            }
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showPaste = true } label: { Image(systemName: "doc.on.clipboard") }
                        .accessibilityLabel("Paste lineup")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNew = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add event")
                }
            }
            .refreshable { await load() }
            .task(id: range) { await load() }
            .sheet(isPresented: $showNew) {
                EventFormView(event: nil) { saved in upsert(saved) }
            }
            .sheet(item: $editing) { event in
                EventFormView(event: event) { saved in upsert(saved) }
            }
            .sheet(isPresented: $showPaste) {
                PasteLineupView { saved in
                    for event in saved { upsert(event) }
                }
            }
        }
    }

    private func upsert(_ event: Event) {
        if let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index] = event
        } else {
            events.append(event)
        }
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let today = LasVegas.today
        let from = range == .upcoming ? LasVegas.adding(days: -1, to: today) : LasVegas.adding(days: -120, to: today)
        let to = range == .upcoming ? LasVegas.adding(days: 180, to: today) : LasVegas.adding(days: -1, to: today)
        do {
            events = try await app.api.events(from: from, to: to)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete(_ toDelete: [Event]) async {
        for event in toDelete {
            do {
                try await app.api.deleteEvent(event.id)
                events.removeAll { $0.id == event.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    @MainActor
    private func makeFlyer(for event: Event) async {
        creatingFor = event.id
        defer { creatingFor = nil }
        let prompt = "Make the flyer set for \(event.artist) on \(LasVegas.long(event.date)) (\(event.date)) at \(event.venue) — event id \(event.id). Feed, story and square, plus the caption."
        do {
            try await app.startCreation(prompt: prompt)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EventRow: View {
    let event: Event
    let isCreating: Bool
    let onMakeFlyer: () -> Void

    var body: some View {
        let chip = LasVegas.chip(event.date)
        HStack(spacing: 14) {
            VStack(spacing: 2) {
                Text(chip.weekday)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.5)
                    .foregroundStyle(Theme.gold)
                Text(chip.date)
                    .font(.system(size: 15, weight: .light).monospacedDigit())
                    .foregroundStyle(Theme.text)
            }
            .frame(width: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text(event.artist.uppercased())
                    .font(.system(size: 15, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(event.status == EventStatus.cancelled.rawValue ? Theme.textFaint : Theme.text)
                    .strikethrough(event.status == EventStatus.cancelled.rawValue)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(event.venue)
                    if event.eventType != EventType.regular.rawValue {
                        Text("·")
                        Text(event.eventType.capitalized)
                    }
                    if event.status == EventStatus.tentative.rawValue {
                        Badge(text: "Tentative", color: Theme.goldLight)
                    }
                }
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
                if !event.supportingActs.isEmpty {
                    Text("w/ " + event.supportingActs.joined(separator: ", "))
                        .font(.caption2)
                        .foregroundStyle(Theme.textFaint)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)

            Button(action: onMakeFlyer) {
                Group {
                    if isCreating {
                        ProgressView().controlSize(.small).tint(.black)
                    } else {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
                .foregroundStyle(Color.black)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Theme.goldGradient))
            }
            .buttonStyle(.borderless)
            .disabled(isCreating || event.status == EventStatus.cancelled.rawValue)
            .accessibilityLabel("Make flyer")
        }
        .padding(.vertical, 6)
    }
}
