import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "xs-unit-"));
});

describe("dates", () => {
  it("formats XS date treatments with the right weekday", async () => {
    const { dateTreatments } = await import("../src/util/time.js");
    const d = dateTreatments("2026-11-05");
    expect(d.dowShort).toBe("THU");
    expect(d.dotted).toBe("11.5");
    expect(d.dottedPadded).toBe("11.05");
    expect(d.long).toBe("THURSDAY, NOVEMBER 5");
    expect(dateTreatments("2026-11-28").medium).toBe("SAT NOV 28");
  });

  it("treats 2am as the previous club night", async () => {
    const { temporalContext } = await import("../src/util/time.js");
    const { DateTime } = await import("luxon");
    const t = temporalContext(DateTime.fromISO("2026-11-14T02:30", { zone: "America/Los_Angeles" }));
    expect(t.clubNightDate).toBe("2026-11-13");
    expect(t.next21Days[0]).toEqual({ label: "Friday", date: "2026-11-13" });
  });
});

describe("brand", () => {
  it("applies canonical artist styling regardless of case/accents", async () => {
    const { canonicalArtist } = await import("../src/brand/profile.js");
    expect(canonicalArtist("rufus du sol")).toBe("RÜFÜS DU SOL");
    expect(canonicalArtist("Deadmau5")).toBe("deadmau5");
    expect(canonicalArtist("its murph")).toBe("it's murph");
    expect(canonicalArtist("Bunt")).toBe("BUNT.");
    expect(canonicalArtist("Someone New")).toBe("Someone New");
  });

  it("persists profile overrides while keeping defaults", async () => {
    const { getProfile, updateProfile } = await import("../src/brand/profile.js");
    updateProfile({ tablesPhone: "702-555-0100", palette: { gold: "#B08D57" } as Record<string, string> });
    const p = getProfile();
    expect(p.tablesPhone).toBe("702-555-0100");
    expect(p.palette.gold).toBe("#B08D57");
    expect(p.palette.black).toBe("#0D0403");
  });
});

describe("events", () => {
  it("validates and filters by artist accent-insensitively", async () => {
    const { createEvent, listEvents } = await import("../src/events.js");
    createEvent({ artist: "RÜFÜS DU SOL [DJ SET]", date: "2026-11-22", venue: "XS" });
    expect(() => createEvent({ artist: "X", date: "11/22/2026" })).toThrow(/YYYY-MM-DD/);
    expect(listEvents({ artist: "rufus" }).length).toBe(1);
  });
});

describe("auth", () => {
  it("hashes passwords and signs/verifies tokens", async () => {
    const { hashPassword, verifyPassword, signToken, verifyToken } = await import("../src/auth.js");
    const h = hashPassword("correct horse");
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    const t = signToken({ id: "usr_1", email: "a@b.c", name: "A", role: "editor", createdAt: "" });
    expect(verifyToken(t)?.sub).toBe("usr_1");
    expect(verifyToken(t.slice(0, -2) + "xx")).toBeNull();
  });
});
