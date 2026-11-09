import { z } from "zod";
import { db, json } from "./db.js";
import { badRequest, notFound } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";
import { dateTreatments } from "./util/time.js";

export const EventInputSchema = z.object({
  artist: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  venue: z.enum(["XS", "XS Nightswim", "Encore Beach Club", "EBC at Night", "Other"]).default("XS"),
  eventType: z.enum(["regular", "residency", "special", "holiday"]).default("regular"),
  supportingActs: z.array(z.string().trim().min(1)).max(20).default([]),
  doorsTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "doorsTime must be HH:MM (24h)")
    .optional()
    .nullable(),
  ticketUrl: z.string().url().optional().nullable(),
  tablesUrl: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
});
export type EventInput = z.infer<typeof EventInputSchema>;

interface EventRow {
  id: string;
  artist: string;
  date: string;
  venue: string;
  event_type: string;
  supporting_acts: string;
  doors_time: string | null;
  ticket_url: string | null;
  tables_url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function eventToApi(r: EventRow) {
  return {
    id: r.id,
    artist: r.artist,
    date: r.date,
    venue: r.venue,
    eventType: r.event_type,
    supportingActs: json.parse<string[]>(r.supporting_acts, []),
    doorsTime: r.doors_time ?? undefined,
    ticketUrl: r.ticket_url ?? undefined,
    tablesUrl: r.tables_url ?? undefined,
    notes: r.notes ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listEvents(f: { from?: string; to?: string; artist?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.from) (where.push("date >= ?"), params.push(f.from));
  if (f.to) (where.push("date <= ?"), params.push(f.to));
  const rows = db.prepare(`SELECT * FROM events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY date, artist`).all(...params) as EventRow[];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filtered = f.artist ? rows.filter((r) => norm(r.artist).includes(norm(f.artist!)) || json.parse<string[]>(r.supporting_acts, []).some((s) => norm(s).includes(norm(f.artist!)))) : rows;
  return filtered.map(eventToApi);
}

export function getEvent(id: string) {
  const r = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
  if (!r) throw notFound("Event");
  return eventToApi(r);
}

export function createEvent(input: unknown) {
  const parsed = EventInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const e = parsed.data;
  const now = nowIso();
  const id = newId("evt");
  db.prepare(
    `INSERT INTO events (id, artist, date, venue, event_type, supporting_acts, doors_time, ticket_url, tables_url, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, e.artist, e.date, e.venue, e.eventType, JSON.stringify(e.supportingActs), e.doorsTime ?? null, e.ticketUrl ?? null, e.tablesUrl ?? null, e.notes ?? null, e.status, now, now);
  return getEvent(id);
}

export function updateEvent(id: string, patch: unknown) {
  const current = getEvent(id);
  const merged = { ...current, ...(patch as object) };
  const parsed = EventInputSchema.safeParse(merged);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const e = parsed.data;
  db.prepare(
    `UPDATE events SET artist=?, date=?, venue=?, event_type=?, supporting_acts=?, doors_time=?, ticket_url=?, tables_url=?, notes=?, status=?, updated_at=? WHERE id=?`,
  ).run(e.artist, e.date, e.venue, e.eventType, JSON.stringify(e.supportingActs), e.doorsTime ?? null, e.ticketUrl ?? null, e.tablesUrl ?? null, e.notes ?? null, e.status, nowIso(), id);
  return getEvent(id);
}

export function deleteEvent(id: string) {
  getEvent(id);
  db.prepare("DELETE FROM events WHERE id = ?").run(id);
}

/** Agent-facing view: adds every date treatment so the agent never formats dates by hand. */
export function eventsForAgent(f: { from?: string; to?: string; artist?: string }) {
  return listEvents(f).map((e) => ({ ...e, dateFormats: dateTreatments(e.date), doors12h: e.doorsTime ? to12h(e.doorsTime) : undefined }));
}

export function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}
