/**
 * Seeds the calendar with the publicly listed upcoming XS dates found during research
 * (Nov 2026). They are marked TENTATIVE: confirm each against the internal booking
 * calendar in the app before publishing. Safe to run repeatedly (skips duplicates).
 */
import { createEvent, listEvents } from "../events.js";

const ROWS: { date: string; artist: string; supportingActs?: string[]; notes?: string }[] = [
  { date: "2026-11-13", artist: "KASKADE" },
  { date: "2026-11-14", artist: "MARSHMELLO" },
  { date: "2026-11-18", artist: "FRANKY RIZARDO" },
  { date: "2026-11-19", artist: "HUGEL", notes: "Billed 'Hugel with special guests'" },
  { date: "2026-11-20", artist: "THE CHAINSMOKERS" },
  { date: "2026-11-21", artist: "CALVIN HARRIS" },
  { date: "2026-11-22", artist: "RÜFÜS DU SOL [DJ SET]" },
  { date: "2026-11-27", artist: "LOUD LUXURY" },
  { date: "2026-11-28", artist: "DIPLO" },
  { date: "2026-12-04", artist: "KASKADE" },
  { date: "2026-12-05", artist: "DIPLO" },
  { date: "2026-12-11", artist: "MARSHMELLO" },
  { date: "2026-12-12", artist: "DIPLO" },
];

const existing = listEvents({});
let added = 0;
for (const r of ROWS) {
  if (existing.some((e) => e.date === r.date && e.artist === r.artist)) continue;
  createEvent({
    artist: r.artist,
    date: r.date,
    venue: "XS",
    eventType: "residency",
    supportingActs: r.supportingActs ?? [],
    notes: `${r.notes ? r.notes + ". " : ""}Seeded from public listings (Nov 2026) — verify against the internal calendar.`,
    status: "tentative",
  });
  added++;
}
console.log(`Seeded ${added} tentative events (${ROWS.length - added} already present).`);
