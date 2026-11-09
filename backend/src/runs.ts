import { EventEmitter } from "node:events";
import { db, json } from "./db.js";
import { notFound } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";

export type RunState = "queued" | "running" | "needs_input" | "completed" | "failed" | "cancelled";
export interface RunEvent {
  seq: number;
  type: "status" | "progress" | "tool" | "delta" | "output" | "message" | "error" | "done";
  data: Record<string, unknown>;
}

interface RunRow {
  id: string;
  thread_id: string;
  state: RunState;
  error: string | null;
  events: string;
  usage: string | null;
  created_at: string;
  finished_at: string | null;
}

interface LiveRun {
  events: RunEvent[];
  bus: EventEmitter;
  abort: AbortController;
  lastPersist: number;
}

const live = new Map<string, LiveRun>();
const TERMINAL: RunState[] = ["completed", "failed", "cancelled", "needs_input"];

export function runToApi(r: RunRow) {
  return { id: r.id, threadId: r.thread_id, state: r.state, error: r.error ?? undefined, createdAt: r.created_at, finishedAt: r.finished_at ?? undefined };
}

export function getRunRow(id: string): RunRow {
  const r = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!r) throw notFound("Run");
  return r;
}

export function latestRunForThread(threadId: string): RunRow | undefined {
  return db.prepare("SELECT * FROM runs WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1").get(threadId) as RunRow | undefined;
}

export function createRun(threadId: string): string {
  const id = newId("run");
  db.prepare("INSERT INTO runs (id, thread_id, state, created_at) VALUES (?, ?, 'queued', ?)").run(id, threadId, nowIso());
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  live.set(id, { events: [], bus, abort: new AbortController(), lastPersist: 0 });
  emit(id, "status", { state: "queued" });
  return id;
}

function persist(id: string, force = false) {
  const lr = live.get(id);
  if (!lr) return;
  const now = Date.now();
  if (!force && now - lr.lastPersist < 1500) return;
  lr.lastPersist = now;
  // Deltas are only useful live; the final message carries the full text.
  const durable = lr.events.filter((e) => e.type !== "delta");
  db.prepare("UPDATE runs SET events = ? WHERE id = ?").run(JSON.stringify(durable), id);
}

export function emit(id: string, type: RunEvent["type"], data: Record<string, unknown>) {
  const lr = live.get(id);
  if (!lr) return;
  const ev: RunEvent = { seq: lr.events.length, type, data };
  lr.events.push(ev);
  lr.bus.emit("event", ev);
  if (type !== "delta") persist(id, type === "output" || type === "done");
}

export function setState(id: string, state: RunState, error?: string) {
  const finished = TERMINAL.includes(state) ? nowIso() : null;
  db.prepare("UPDATE runs SET state = ?, error = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?").run(state, error ?? null, finished, id);
  emit(id, "status", { state });
  if (TERMINAL.includes(state)) {
    if (error) emit(id, "error", { message: error });
    emit(id, "done", { state });
    persist(id, true);
    const lr = live.get(id);
    // Keep the live buffer briefly so late SSE subscribers replay from memory, then drop it.
    setTimeout(() => {
      lr?.bus.removeAllListeners();
      live.delete(id);
    }, 60_000).unref();
  }
}

export function setUsage(id: string, usage: unknown) {
  db.prepare("UPDATE runs SET usage = ? WHERE id = ?").run(JSON.stringify(usage), id);
}

export function abortSignal(id: string): AbortSignal | undefined {
  return live.get(id)?.abort.signal;
}

export function cancelRun(id: string) {
  const r = getRunRow(id);
  if (TERMINAL.includes(r.state)) return runToApi(r);
  live.get(id)?.abort.abort();
  setState(id, "cancelled");
  return runToApi(getRunRow(id));
}

/**
 * Subscribe to a run: replays every event so far, then streams live ones.
 * Returns an unsubscribe function. `onEvent` receives `done` last.
 */
export function subscribe(id: string, onEvent: (e: RunEvent) => void): () => void {
  const lr = live.get(id);
  if (!lr) {
    const r = getRunRow(id);
    for (const e of json.parse<RunEvent[]>(r.events, [])) onEvent(e);
    const events = json.parse<RunEvent[]>(r.events, []);
    if (!events.some((e) => e.type === "done")) {
      // Process restarted mid-run: report it honestly.
      if (!TERMINAL.includes(r.state)) {
        db.prepare("UPDATE runs SET state = 'failed', error = 'Server restarted during this run' WHERE id = ?").run(id);
      }
      onEvent({ seq: events.length, type: "done", data: { state: TERMINAL.includes(r.state) ? r.state : "failed" } });
    }
    return () => {};
  }
  for (const e of lr.events) onEvent(e);
  const handler = (e: RunEvent) => onEvent(e);
  lr.bus.on("event", handler);
  return () => lr.bus.off("event", handler);
}

// ── simple concurrency-limited queue ──
const MAX_CONCURRENT = Number(process.env.AGENT_CONCURRENCY ?? 3);
let running = 0;
const queue: (() => Promise<void>)[] = [];

export function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()!;
    running++;
    job()
      .catch((err) => console.error("[runs] job crashed", err))
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** Mark runs that were in flight when the process died. */
export function recoverInterruptedRuns() {
  db.prepare("UPDATE runs SET state = 'failed', error = 'Server restarted during this run', finished_at = ? WHERE state IN ('queued','running')").run(nowIso());
}
