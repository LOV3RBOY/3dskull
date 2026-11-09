import XCTest
@testable import XSStudio

final class SSEParserTests: XCTestCase {
    func testParsesMultiEventChunk() {
        let chunk = """
        : keep-alive

        event: status
        data: {"state":"running"}

        event: progress
        data: {"text":"Checking the XS calendar for this weekend…"}

        event: tool
        data: {"id":"tu_1","name":"find_events","label":"Looking up events","phase":"start"}

        event: tool
        data: {"id":"tu_1","name":"find_events","label":"Looking up events","phase":"end","ok":true,"detail":"2 events"}

        event: delta
        data: {"text":"Here is "}

        event: output
        data: {"output":{"id":"out_1","kind":"flyer","title":"DIPLO","status":"draft","favorite":false,"createdAt":"2026-11-09T03:12:44.123Z","format":{"id":"story_9x16","label":"Story","width":1080,"height":1920}}}

        event: message
        data: {"message":{"id":"msg_2","threadId":"thr_1","role":"assistant","text":"Done.","attachmentAssetIds":[],"outputIds":["out_1"],"createdAt":"2026-11-09T03:13:00Z"}}

        event: done
        data: {"state":"completed"}

        """
        let raw = SSEParser.parse(chunk)
        XCTAssertEqual(raw.map(\.event), ["status", "progress", "tool", "tool", "delta", "output", "message", "done"])

        let events = raw.map { RunEvent(raw: $0) }

        guard case .status(let state) = events[0] else { return XCTFail("expected status") }
        XCTAssertEqual(state, .running)

        guard case .progress(let text) = events[1] else { return XCTFail("expected progress") }
        XCTAssertTrue(text.hasPrefix("Checking"))

        guard case .tool(let start) = events[2] else { return XCTFail("expected tool start") }
        XCTAssertEqual(start.phase, "start")
        XCTAssertNil(start.ok)

        guard case .tool(let end) = events[3] else { return XCTFail("expected tool end") }
        XCTAssertEqual(end.ok, true)
        XCTAssertEqual(end.detail, "2 events")

        guard case .delta(let delta) = events[4] else { return XCTFail("expected delta") }
        XCTAssertEqual(delta, "Here is ")

        guard case .output(let output) = events[5] else { return XCTFail("expected output") }
        XCTAssertEqual(output.format?.id, "story_9x16")

        guard case .message(let message) = events[6] else { return XCTFail("expected message") }
        XCTAssertEqual(message.outputIds, ["out_1"])
        XCTAssertFalse(message.isUser)

        guard case .done(let final) = events[7] else { return XCTFail("expected done") }
        XCTAssertEqual(final, .completed)
    }

    func testMultiLineDataAndCRLF() {
        var parser = SSEParser()
        XCTAssertNil(parser.feed(line: "event: delta\r"))
        XCTAssertNil(parser.feed(line: "data: line one\r"))
        XCTAssertNil(parser.feed(line: "data: line two\r"))
        let event = parser.feed(line: "\r")
        XCTAssertEqual(event, RawSSEEvent(event: "delta", data: "line one\nline two"))
    }

    func testUnknownEventIsTolerated() {
        let events = SSEParser.parse("event: shiny_new_thing\ndata: {}\n\n").map { RunEvent(raw: $0) }
        guard case .unknown(let name) = events.first else { return XCTFail("expected unknown") }
        XCTAssertEqual(name, "shiny_new_thing")
    }
}
