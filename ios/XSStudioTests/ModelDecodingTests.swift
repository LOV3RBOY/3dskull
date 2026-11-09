import XCTest
@testable import XSStudio

final class ModelDecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONCoding.decoder.decode(T.self, from: Data(json.utf8))
    }

    func testOutputDecodesFullPayload() throws {
        let json = """
        {
          "id": "out_1", "threadId": "thr_1", "runId": "run_1", "kind": "flyer",
          "title": "DIPLO — FRI 11.14", "template": "headliner-gold",
          "format": { "id": "feed_4x5", "label": "Feed 4:5", "width": 1080, "height": 1350 },
          "fields": { "artist": "DIPLO", "date": "FRIDAY NOVEMBER 14" },
          "editableFields": [ { "key": "artist", "label": "Artist", "multiline": false } ],
          "imageUrl": "https://studio.example.com/files/a.png?exp=1&sig=x",
          "thumbUrl": "https://studio.example.com/files/a_thumb.jpg?exp=1&sig=x",
          "text": null, "status": "approved", "favorite": true, "parentId": null,
          "createdAt": "2026-11-09T03:12:44.123Z", "meta": { "eventId": "evt_1", "score": 9.5 }
        }
        """
        let output = try decode(Output.self, json)
        XCTAssertEqual(output.id, "out_1")
        XCTAssertEqual(output.kind, .flyer)
        XCTAssertEqual(output.status, .approved)
        XCTAssertTrue(output.favorite)
        XCTAssertEqual(output.format?.id, "feed_4x5")
        XCTAssertEqual(output.aspectRatio, 1080.0 / 1350.0, accuracy: 0.0001)
        XCTAssertEqual(output.fields?["artist"], "DIPLO")
        XCTAssertEqual(output.editableFields?.first?.key, "artist")
        XCTAssertTrue(output.isRenderable)
        XCTAssertEqual(output.meta, .object(["eventId": .string("evt_1"), "score": .number(9.5)]))
    }

    func testOutputToleratesMissingAndUnknownValues() throws {
        let json = """
        { "id": "out_2", "kind": "brand_new_kind", "title": "Caption pack", "text": "Tonight. XS.", "status": "weird",
          "createdAt": "2026-11-09T03:12:44Z" }
        """
        let output = try decode(Output.self, json)
        XCTAssertEqual(output.kind, .unknown)
        XCTAssertEqual(output.status, .unknown)
        XCTAssertFalse(output.favorite)
        XCTAssertFalse(output.hasImage)
        XCTAssertEqual(output.text, "Tonight. XS.")
    }

    func testEventDecoding() throws {
        let json = """
        { "id": "evt_1", "artist": "Diplo", "date": "2026-11-14", "venue": "XS", "eventType": "residency",
          "supportingActs": ["Special Guest"], "doorsTime": "22:30", "status": "confirmed",
          "createdAt": "2026-11-01T10:00:00.000Z", "updatedAt": "2026-11-01T10:00:00.000Z" }
        """
        let event = try decode(Event.self, json)
        XCTAssertEqual(event.artist, "Diplo")
        XCTAssertEqual(event.supportingActs, ["Special Guest"])
        XCTAssertEqual(event.input.doorsTime, "22:30")
        let chip = LasVegas.chip(event.date)
        XCTAssertEqual(chip.weekday, "SAT")
        XCTAssertEqual(chip.date, "11.14")
    }

    func testEventInputEncodingOmitsNils() throws {
        let input = EventInput(artist: "Kaskade", date: "2026-11-15")
        let data = try JSONCoding.encoder.encode(input)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["artist"] as? String, "Kaskade")
        XCTAssertNil(object["ticketUrl"])
        XCTAssertEqual(object["venue"] as? String, "XS")
    }

    func testThreadDecoding() throws {
        let json = """
        [{ "id": "thr_1", "title": "Diplo weekend", "createdAt": "2026-11-09T03:00:00.000Z",
           "updatedAt": "2026-11-09T03:05:00.000Z", "lastRunState": "needs_input", "lastRunId": "run_9" },
         { "id": "thr_2", "title": "Lineup", "createdAt": "2026-11-08 20:00:00", "updatedAt": 1762650000000 }]
        """
        let threads = try decode([StudioThread].self, json)
        XCTAssertEqual(threads.count, 2)
        XCTAssertEqual(threads[0].lastRunState, .needsInput)
        XCTAssertEqual(threads[0].lastRunId, "run_9")
        XCTAssertNil(threads[1].lastRunState)
    }

    func testBrandProfileRoundTrips() throws {
        let json = """
        { "profile": { "phone": "702.770.0097", "hashtags": ["#XSLasVegas", "#WynnNightlife"], "showAge": true, "nested": { "a": 1 } },
          "dna": "# XS\\n- Gold", "referenceCount": 12 }
        """
        let brand = try decode(BrandResponse.self, json)
        XCTAssertEqual(brand.referenceCount, 12)
        XCTAssertEqual(brand.profile["hashtags"]?.stringArray, ["#XSLasVegas", "#WynnNightlife"])
        XCTAssertEqual(brand.profile["showAge"], .bool(true))
        let reencoded = try JSONCoding.encoder.encode(brand.profile)
        let again = try JSONCoding.decoder.decode([String: JSONValue].self, from: reencoded)
        XCTAssertEqual(again, brand.profile)
    }

    func testErrorEnvelope() throws {
        let envelope = try decode(APIErrorEnvelope.self, #"{"error":{"code":"not_found","message":"Thread not found"}}"#)
        XCTAssertEqual(envelope.error.code, "not_found")
        XCTAssertEqual(envelope.error.message, "Thread not found")
    }
}
