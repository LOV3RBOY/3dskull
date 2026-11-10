import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: http.Server;
let jpg: Buffer;

beforeAll(async () => {
  jpg = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#b8391c" } }).jpeg().toBuffer();
  server = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    if (u.pathname === "/me") return res.end(JSON.stringify({ id: "1", username: "xslasvegas" }));
    if (u.pathname === "/me/media")
      return res.end(
        JSON.stringify({
          data: [
            { id: "p1", caption: "MARSHMELLO. Saturday.\n#XSLasVegas", media_type: "IMAGE", media_url: `${base}/img/1.jpg`, timestamp: "2026-11-09T18:00:00+0000" },
            { id: "p2", caption: "Opening weekend", media_type: "CAROUSEL_ALBUM", timestamp: "2026-11-01T18:00:00+0000", children: { data: [{ media_type: "IMAGE", media_url: `${base}/img/2.jpg` }, { media_type: "VIDEO", thumbnail_url: `${base}/img/3.jpg` }] } },
          ],
        }),
      );
    if (u.pathname.startsWith("/img/")) {
      res.setHeader("content-type", "image/jpeg");
      return res.end(jpg);
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, r));
  Object.assign(process.env, {
    DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "xs-ig-")),
    INSTAGRAM_API_BASE: `http://127.0.0.1:${(server.address() as any).port}`,
    INSTAGRAM_ACCESS_TOKEN: "test-token",
    ANTHROPIC_API_KEY: "",
  });
});

afterAll(() => server?.close());

describe("instagram sync", () => {
  it("imports posts, carousel slides and reel covers once, with captions", async () => {
    const { syncInstagram } = await import("../src/integrations/instagram.js");
    const { listAssets } = await import("../src/assets.js");
    const { kvGet } = await import("../src/db.js");
    const r1 = await syncInstagram();
    expect(r1.account).toBe("xslasvegas");
    expect(r1.imported).toBe(3);
    const refs = listAssets({ kind: "brand_reference" });
    expect(refs.length).toBe(3);
    expect(refs.some((a) => a.title.startsWith("MARSHMELLO"))).toBe(true);
    const caps = kvGet<Record<string, { caption?: string }>>("ig.captions", {});
    expect(caps.p1.caption).toContain("#XSLasVegas");
    const r2 = await syncInstagram();
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(3);
  });
});
