import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(process.env.DB_PATH_OVERRIDE ?? config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const migrations: string[] = [
  /* 1 */ `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    text TEXT NOT NULL,
    attachment_asset_ids TEXT NOT NULL DEFAULT '[]',
    output_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
  -- Full Claude API transcript per thread (append-only), so follow-ups keep context.
  CREATE TABLE transcripts (
    thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
    json TEXT NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    error TEXT,
    events TEXT NOT NULL DEFAULT '[]',
    usage TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX idx_runs_thread ON runs(thread_id, created_at);
  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    file_key TEXT NOT NULL,
    thumb_key TEXT NOT NULL,
    mime TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    has_alpha INTEGER NOT NULL DEFAULT 0,
    analysis TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_assets_kind ON assets(kind);
  CREATE INDEX idx_assets_artist ON assets(artist COLLATE NOCASE);
  CREATE TABLE outputs (
    id TEXT PRIMARY KEY,
    thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
    run_id TEXT,
    parent_id TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    format TEXT,
    template TEXT,
    fields TEXT,
    spec TEXT,
    image_key TEXT,
    thumb_key TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    favorite INTEGER NOT NULL DEFAULT 0,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_outputs_created ON outputs(created_at);
  CREATE INDEX idx_outputs_thread ON outputs(thread_id);
  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    artist TEXT NOT NULL,
    date TEXT NOT NULL,
    venue TEXT NOT NULL,
    event_type TEXT NOT NULL,
    supporting_acts TEXT NOT NULL DEFAULT '[]',
    doors_time TEXT,
    ticket_url TEXT,
    tables_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_date ON events(date);
  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

function migrate() {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}
migrate();

export const json = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
};

export function kvGet<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? json.parse(row.value, fallback) : fallback;
}

export function kvGetWithTime(key: string): { value: string; updatedAt: string } | undefined {
  const row = db.prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(key) as
    | { value: string; updated_at: string }
    | undefined;
  return row ? { value: row.value, updatedAt: row.updated_at } : undefined;
}

export function kvSet(key: string, value: unknown) {
  db.prepare(
    "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(key, JSON.stringify(value), new Date().toISOString());
}
