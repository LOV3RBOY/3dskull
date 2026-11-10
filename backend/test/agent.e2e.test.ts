/**
 * End-to-end test of the agent loop against a scripted mock of the Anthropic Messages API
 * (streaming SSE). Exercises: per-turn context, parallel tool calls, calendar lookup, asset
 * search, real Chromium renders, preview → deliver, caption delivery, SSE replay, transcript.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xs-test-"));
let mock: http.Server;
const requests: any[] = [];

function sse(res: http.ServerResponse, content: any[], stopReason: string) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("message_start", {
    type: "message_start",
    message: { id: "msg_" + Math.random().toString(36).slice(2), type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } },
  });
  content.forEach((block, index) => {
    if (block.type === "text") {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else if (block.type === "thinking") {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig" } });
    } else {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    send("content_block_stop", { type: "content_block_stop", index });
  });
  send("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 50 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}

/** Scripted director: decides its next move from the transcript it receives. */
function script(body: any, res: http.ServerResponse) {
  const msgs = body.messages as any[];
  const last = msgs[msgs.length - 1];
  const results = Array.isArray(last.content) ? last.content.filter((b: any) => b.type === "tool_result") : [];
  const text = (r: any) => (typeof r.content === "string" ? r.content : r.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n"));
  const all = results.map(text).join("\n");

  if (!results.length) {
    return sse(
      res,
      [
        { type: "thinking", thinking: "Checking the calendar and photos for Diplo." },
        { type: "tool_use", id: "tu_cal", name: "lookup_calendar", input: { artist: "Diplo" } },
        { type: "tool_use", id: "tu_assets", name: "find_assets", input: { artist: "diplo", kind: "artist_photo" } },
      ],
      "tool_use",
    );
  }
  if (all.includes('"events"')) {
    const assetId = /"id":"(ast_[a-z0-9]+)"/.exec(all)?.[1];
    const date = /"xsHeadliner":"([^"]+)"/.exec(all);
    const fields = { artist: "Diplo", venueLine: "XS LAS VEGAS", dateLine: date?.[1] ?? "?", ctaLabel: "TICKETS:", ctaUrl: "WYNNNIGHTLIFE.COM", year: "2026" };
    return sse(
      res,
      [
        { type: "tool_use", id: "tu_r1", name: "render_visual", input: { template: "xs26_headliner", format: "feed_4x5", fields, artist_asset_id: assetId, style: { seed: 3 } } },
        { type: "tool_use", id: "tu_r2", name: "render_visual", input: { template: "xs26_headliner", format: "story_9x16", fields, artist_asset_id: assetId, style: { seed: 3 } } },
      ],
      "tool_use",
    );
  }
  const previews = [...all.matchAll(/preview_id: (pv_[a-z0-9]+)/g)].map((m) => m[1]);
  if (previews.length) {
    return sse(
      res,
      [
        {
          type: "tool_use",
          id: "tu_del",
          name: "deliver",
          input: { items: previews.map((p, i) => ({ preview_id: p, kind: i === 0 ? "flyer" : "story", title: `DIPLO · ${i === 0 ? "Feed" : "Story"}` })) },
        },
        { type: "tool_use", id: "tu_cap", name: "deliver_copy", input: { kind: "caption", title: "DIPLO caption", text: "Option A\nDiplo. Saturday.\n#XSLasVegas #WynnNightlife" } },
      ],
      "tool_use",
    );
  }
  return sse(res, [{ type: "text", text: "Delivered the Diplo feed + story and a caption. Date is tentative on the calendar — please confirm." }], "end_turn");
}

let app: any;
let base = "";
let token = "";

beforeAll(async () => {
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push({ url: req.url, headers: req.headers, body });
      script(body, res);
    });
  });
  await new Promise<void>((r) => mock.listen(0, r));
  const port = (mock.address() as any).port;
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ADMIN_EMAIL: "t@xs.test",
    ADMIN_PASSWORD: "password123",
  });
  const { buildApp } = await import("../src/app.js");
  const { bootstrapAdmin } = await import("../src/auth.js");
  const { createEvent } = await import("../src/events.js");
  bootstrapAdmin();
  createEvent({ artist: "DIPLO", date: "2026-11-28", venue: "XS", eventType: "residency", status: "tentative" });
  app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "t@xs.test", password: "password123" }) });
  token = (await login.json()).token;
  // Upload a stand-in artist photo
  const photo = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: "#5a4a3a" } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("kind", "artist_photo");
  form.append("artist", "Diplo");
  form.append("file", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "diplo.jpg");
  const up = await fetch(`${base}/assets`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  expect(up.status).toBe(200);
}, 60_000);

afterAll(async () => {
  await app?.close();
  mock?.close();
  const { closeRenderer } = await import("../src/render/renderer.js");
  await closeRenderer();
});

describe("agent run", () => {
  it("briefs → calendar → renders → delivers, streaming events over SSE", async () => {
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const res = await fetch(`${base}/create`, { method: "POST", headers: auth, body: JSON.stringify({ prompt: "Make a poster for Diplo" }) });
    expect(res.status).toBe(200);
    const { thread, runId } = await res.json();

    const sseRes = await fetch(`${base}/runs/${runId}/events`, { headers: auth });
    const body = await sseRes.text();
    const events = body
      .split("\n\n")
      .filter((c) => c.includes("event: "))
      .map((c) => ({ type: /event: (\w+)/.exec(c)![1], data: JSON.parse(/data: (.*)/.exec(c)![1]) }));
    const types = events.map((e) => e.type);
    expect(types).toContain("progress");
    expect(types).toContain("tool");
    expect(types.filter((t) => t === "output").length).toBe(3);
    expect(events.at(-1)).toMatchObject({ type: "done", data: { state: "completed" } });

    // Request shape sent to the API
    const first = requests[0];
    expect(first.url).toContain("/v1/messages");
    expect(first.body.model).toBe("claude-opus-5-5");
    expect(first.body.fallbacks).toBe("default");
    expect(first.body.thinking).toMatchObject({ type: "adaptive", display: "updates" });
    expect(String(first.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(first.body.messages[0].content[0].text).toContain("<context>");
    expect(first.body.system[0].text).toContain("Creative Director");
    // Parallel tool results come back in ONE user message
    const second = requests[1].body.messages;
    expect(second.at(-1).content.filter((b: any) => b.type === "tool_result").length).toBe(2);
    // Day-of-week comes from the calendar, not the model
    const renderCall = requests[1] && requests[2].body.messages.at(-2).content.find((b: any) => b.type === "tool_use" && b.name === "render_visual");
    expect(renderCall.input.fields.dateLine).toBe("SAT. NOV 28");

    const detail = await (await fetch(`${base}/threads/${thread.id}`, { headers: auth })).json();
    expect(detail.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(detail.outputs.length).toBe(3);
    const flyer = detail.outputs.find((o: any) => o.kind === "flyer");
    expect(flyer.format).toMatchObject({ width: 1080, height: 1350 });
    expect(flyer.fields.artist).toBe("DIPLO"); // canonical styling applied
    const img = await fetch(flyer.imageUrl);
    expect(img.status).toBe(200);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);

    // Deterministic editor re-render: new format + edited field, no AI involved
    const rr = await fetch(`${base}/outputs/${flyer.id}/rerender`, { method: "POST", headers: auth, body: JSON.stringify({ format: "story_9x16", fields: { dateLine: "SUN. NOV 29" } }) });
    const re = await rr.json();
    expect(re.format).toMatchObject({ width: 1080, height: 1920 });
    expect(re.fields.dateLine).toBe("SUN. NOV 29");
    expect(re.parentId).toBe(flyer.id);

    // Follow-up in the same thread keeps the transcript (append-only)
    const follow = await fetch(`${base}/threads/${thread.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ text: "Now make one for Diplo again" }) });
    const { runId: run2 } = await follow.json();
    await (await fetch(`${base}/runs/${run2}/events`, { headers: auth })).text();
    const firstOfRun2 = requests.find((r, i) => i > 4 && r.body.messages.length > 6);
    expect(firstOfRun2).toBeTruthy();
  }, 120_000);
});
