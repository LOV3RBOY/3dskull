import { db, json } from "./db.js";
import { latestRunForThread } from "./runs.js";
import { notFound } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";
import { signedUrl } from "./storage.js";
import type Anthropic from "@anthropic-ai/sdk";

interface ThreadRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  text: string;
  attachment_asset_ids: string;
  output_ids: string;
  created_at: string;
}

export function threadToApi(r: ThreadRow) {
  const run = latestRunForThread(r.id);
  const cover = db.prepare("SELECT thumb_key FROM outputs WHERE thread_id = ? AND thumb_key IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(r.id) as { thumb_key: string } | undefined;
  const coverUrl = signedUrl(cover?.thumb_key);
  return { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, lastRunState: run?.state, lastRunId: run?.id, coverUrl };
}

export function messageToApi(r: MessageRow) {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    text: r.text,
    attachmentAssetIds: json.parse<string[]>(r.attachment_asset_ids, []),
    outputIds: json.parse<string[]>(r.output_ids, []),
    createdAt: r.created_at,
  };
}

export function createThread(userId: string, title: string) {
  const now = nowIso();
  const id = newId("thr");
  db.prepare("INSERT INTO threads (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, title.slice(0, 120) || "New request", now, now);
  return getThreadRow(id);
}

export function getThreadRow(id: string): ThreadRow {
  const r = db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | undefined;
  if (!r) throw notFound("Thread");
  return r;
}

export function listThreads() {
  return (db.prepare("SELECT * FROM threads ORDER BY updated_at DESC LIMIT 200").all() as ThreadRow[]).map(threadToApi);
}

export function touchThread(id: string, title?: string) {
  if (title) db.prepare("UPDATE threads SET updated_at = ?, title = ? WHERE id = ?").run(nowIso(), title.slice(0, 120), id);
  else db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(nowIso(), id);
}

export function deleteThread(id: string) {
  getThreadRow(id);
  db.prepare("DELETE FROM threads WHERE id = ?").run(id);
}

export function addMessage(threadId: string, role: "user" | "assistant", text: string, attachmentAssetIds: string[] = [], outputIds: string[] = []) {
  const id = newId("msg");
  db.prepare("INSERT INTO messages (id, thread_id, role, text, attachment_asset_ids, output_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id,
    threadId,
    role,
    text,
    JSON.stringify(attachmentAssetIds),
    JSON.stringify(outputIds),
    nowIso(),
  );
  touchThread(threadId);
  return messageToApi(db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow);
}

export function listMessages(threadId: string) {
  return (db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at, rowid").all(threadId) as MessageRow[]).map(messageToApi);
}

// Append-only Claude transcript per thread (thinking blocks are passed back unchanged).
export function loadTranscript(threadId: string): Anthropic.Beta.Messages.BetaMessageParam[] {
  const r = db.prepare("SELECT json FROM transcripts WHERE thread_id = ?").get(threadId) as { json: string } | undefined;
  return r ? json.parse(r.json, []) : [];
}

export function saveTranscript(threadId: string, messages: Anthropic.Beta.Messages.BetaMessageParam[]) {
  db.prepare("INSERT INTO transcripts (thread_id, json) VALUES (?, ?) ON CONFLICT(thread_id) DO UPDATE SET json = excluded.json").run(threadId, JSON.stringify(messages));
}
