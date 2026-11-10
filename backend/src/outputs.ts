import sharp from "sharp";
import { findAsset, assetPath, primaryLogo, wynnLogo, artistLogo } from "./assets.js";
import { getProfile } from "./brand/profile.js";
import { db, json } from "./db.js";
import { FORMATS, type FormatId, publicFormat } from "./render/formats.js";
import { renderHtml } from "./render/renderer.js";
import type { TemplateStyle } from "./render/templates/base.js";
import { getTemplate } from "./render/templates/xs.js";
import { deleteFile, makeThumb, putFile, signedUrl } from "./storage.js";
import { badRequest, notFound } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";

export const OUTPUT_KINDS = ["flyer", "story", "lineup", "announcement", "caption", "copy", "recap"] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

/** Everything needed to deterministically re-render a visual. */
export interface RenderSpec {
  template: string;
  format: FormatId;
  fields: Record<string, string>;
  images: { artistAssetId?: string; backgroundAssetId?: string; logoAssetId?: string | null; artistLogoAssetId?: string | null };
  style: TemplateStyle;
}

interface OutputRow {
  id: string;
  thread_id: string | null;
  run_id: string | null;
  parent_id: string | null;
  kind: OutputKind;
  title: string;
  format: string | null;
  template: string | null;
  fields: string | null;
  spec: string | null;
  image_key: string | null;
  thumb_key: string | null;
  text: string | null;
  status: "draft" | "approved" | "rejected";
  favorite: number;
  meta: string;
  created_at: string;
}

export function outputToApi(r: OutputRow) {
  const tpl = r.template ? getTemplate(r.template) : undefined;
  const fmt = r.format ? FORMATS[r.format as FormatId] : undefined;
  return {
    id: r.id,
    threadId: r.thread_id ?? undefined,
    runId: r.run_id ?? undefined,
    parentId: r.parent_id ?? undefined,
    kind: r.kind,
    title: r.title,
    format: fmt ? publicFormat(fmt) : undefined,
    template: r.template ?? undefined,
    fields: r.fields ? json.parse<Record<string, string>>(r.fields, {}) : undefined,
    editableFields: tpl?.fields.map((f) => ({ key: f.key, label: f.label, multiline: f.multiline })),
    imageUrl: signedUrl(r.image_key),
    thumbUrl: signedUrl(r.thumb_key),
    text: r.text ?? undefined,
    status: r.status,
    favorite: !!r.favorite,
    createdAt: r.created_at,
    meta: json.parse<Record<string, unknown>>(r.meta, {}),
  };
}
export type ApiOutput = ReturnType<typeof outputToApi>;

export function getOutputRow(id: string): OutputRow {
  const r = db.prepare("SELECT * FROM outputs WHERE id = ?").get(id) as OutputRow | undefined;
  if (!r) throw notFound("Output");
  return r;
}

export function getOutput(id: string) {
  return outputToApi(getOutputRow(id));
}

export function getSpec(id: string): RenderSpec | null {
  return json.parse<RenderSpec | null>(getOutputRow(id).spec, null);
}

export function listOutputs(f: { kind?: string; status?: string; q?: string; limit?: number; before?: string; threadId?: string; favorite?: boolean }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.kind) (where.push("kind = ?"), params.push(f.kind));
  if (f.status) (where.push("status = ?"), params.push(f.status));
  if (f.threadId) (where.push("thread_id = ?"), params.push(f.threadId));
  if (f.favorite) where.push("favorite = 1");
  if (f.before) (where.push("created_at < ?"), params.push(f.before));
  if (f.q) (where.push("(title LIKE ? OR text LIKE ? OR fields LIKE ?)"), params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`));
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = db
    .prepare(`SELECT * FROM outputs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at ${f.threadId ? "ASC" : "DESC"} LIMIT ?`)
    .all(...params, limit) as OutputRow[];
  return rows.map(outputToApi);
}

export function patchOutput(id: string, p: { status?: string; favorite?: boolean; title?: string; text?: string }) {
  const r = getOutputRow(id);
  if (p.status && !["draft", "approved", "rejected"].includes(p.status)) throw badRequest("Invalid status");
  db.prepare("UPDATE outputs SET status=?, favorite=?, title=?, text=? WHERE id=?").run(
    p.status ?? r.status,
    p.favorite === undefined ? r.favorite : p.favorite ? 1 : 0,
    p.title ?? r.title,
    p.text ?? r.text,
    id,
  );
  return getOutput(id);
}

export async function deleteOutput(id: string) {
  const r = getOutputRow(id);
  db.prepare("DELETE FROM outputs WHERE id = ?").run(id);
  await deleteFile(r.image_key);
  await deleteFile(r.thumb_key);
}

/** Resolve a spec to template input, render to PNG. Returns PNG + layout diagnostics. */
export async function renderSpec(spec: RenderSpec) {
  const tpl = getTemplate(spec.template);
  if (!tpl) throw badRequest(`Unknown template ${spec.template}`);
  const format = FORMATS[spec.format];
  if (!format) throw badRequest(`Unknown format ${spec.format}`);
  const artist = spec.images.artistAssetId ? findAsset(spec.images.artistAssetId) : undefined;
  const background = spec.images.backgroundAssetId ? findAsset(spec.images.backgroundAssetId) : undefined;
  if (spec.images.artistAssetId && !artist) throw badRequest(`Artist asset ${spec.images.artistAssetId} not found`);
  if (spec.images.backgroundAssetId && !background) throw badRequest(`Background asset ${spec.images.backgroundAssetId} not found`);
  if (tpl.images.artist === "required" && !artist && !background) throw badRequest(`Template ${tpl.id} needs an artist photo`);
  if (tpl.images.background === "required" && !background) throw badRequest(`Template ${tpl.id} needs a background photo`);
  const logo = spec.images.logoAssetId === null ? undefined : spec.images.logoAssetId ? findAsset(spec.images.logoAssetId) : primaryLogo();
  const wynn = wynnLogo();
  // Artist logotype: explicit id, or auto-pick by artist name unless explicitly disabled (null).
  const artLogo =
    spec.images.artistLogoAssetId === null
      ? undefined
      : spec.images.artistLogoAssetId
        ? findAsset(spec.images.artistLogoAssetId)
        : spec.fields.artist && tpl.supportsArtistLogo
          ? artistLogo(spec.fields.artist.replace(/\s*[\[(].*$/, ""))
          : undefined;
  const profile = getProfile();
  const html = tpl.render({
    format,
    fields: spec.fields,
    images: {
      artist: artist ? assetPath(artist) : undefined,
      artistIsCutout: !!artist?.has_alpha,
      background: background ? assetPath(background) : undefined,
      logo: logo ? assetPath(logo) : undefined,
      wynnLogo: wynn ? assetPath(wynn) : undefined,
      artistLogo: artLogo ? assetPath(artLogo) : undefined,
    },
    style: spec.style ?? {},
    profile,
  });
  const { png, diagnostics } = await renderHtml(html, format);
  if (!logo) diagnostics.push("No official XS logo uploaded — a typeset placeholder was used. Upload it in Assets (kind: logo, tag: xs).");
  if (!wynn && tpl.usesWynnLogo) diagnostics.push("No Wynn Nightlife logo uploaded — a typeset placeholder was used. Upload it in Assets (kind: logo, tag: wynn).");
  if (tpl.images.prefersCutout && artist && !artist.has_alpha) diagnostics.push("This layout expects a transparent cut-out; the artist photo has no alpha channel.");
  return { png, diagnostics, usedLogo: !!logo, usedArtistLogo: !!artLogo };
}

export async function createVisualOutput(args: {
  spec: RenderSpec;
  kind: OutputKind;
  title: string;
  threadId?: string;
  runId?: string;
  parentId?: string;
  meta?: Record<string, unknown>;
  rendered?: { png: Buffer; diagnostics: string[] };
}) {
  const r = args.rendered ?? (await renderSpec(args.spec));
  const id = newId("out");
  // Print gets a lossless PNG; social formats ship as high-quality JPEG (what Instagram re-encodes from anyway).
  const isPrint = args.spec.format === "print_18x24";
  const data = isPrint
    ? await sharp(r.png).withMetadata({ density: 300 }).png({ compressionLevel: 9 }).toBuffer()
    : await sharp(r.png).jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  const imageKey = await putFile(`outputs/${id}.${isPrint ? "png" : "jpg"}`, data);
  const thumbKey = await putFile(`outputs/${id}_thumb.webp`, await makeThumb(r.png, 720));
  const row: OutputRow = {
    id,
    thread_id: args.threadId ?? null,
    run_id: args.runId ?? null,
    parent_id: args.parentId ?? null,
    kind: args.kind,
    title: args.title,
    format: args.spec.format,
    template: args.spec.template,
    fields: JSON.stringify(args.spec.fields),
    spec: JSON.stringify(args.spec),
    image_key: imageKey,
    thumb_key: thumbKey,
    text: null,
    status: "draft",
    favorite: 0,
    meta: JSON.stringify({ ...(args.meta ?? {}), diagnostics: r.diagnostics }),
    created_at: nowIso(),
  };
  insertRow(row);
  return outputToApi(row);
}

export function createTextOutput(args: { kind: "caption" | "copy"; title: string; text: string; threadId?: string; runId?: string; meta?: Record<string, unknown> }) {
  const row: OutputRow = {
    id: newId("out"),
    thread_id: args.threadId ?? null,
    run_id: args.runId ?? null,
    parent_id: null,
    kind: args.kind,
    title: args.title,
    format: null,
    template: null,
    fields: null,
    spec: null,
    image_key: null,
    thumb_key: null,
    text: args.text,
    status: "draft",
    favorite: 0,
    meta: JSON.stringify(args.meta ?? {}),
    created_at: nowIso(),
  };
  insertRow(row);
  return outputToApi(row);
}

function insertRow(row: OutputRow) {
  db.prepare(
    `INSERT INTO outputs (id, thread_id, run_id, parent_id, kind, title, format, template, fields, spec, image_key, thumb_key, text, status, favorite, meta, created_at)
     VALUES (@id, @thread_id, @run_id, @parent_id, @kind, @title, @format, @template, @fields, @spec, @image_key, @thumb_key, @text, @status, @favorite, @meta, @created_at)`,
  ).run(row);
}

/** Deterministic re-render from the editor (no AI): field edits, other format, other template. */
export async function rerenderOutput(id: string, p: { fields?: Record<string, string>; format?: FormatId; template?: string }) {
  const row = getOutputRow(id);
  const spec = json.parse<RenderSpec | null>(row.spec, null);
  if (!spec) throw badRequest("This output is not a rendered visual");
  if (p.format && !FORMATS[p.format]) throw badRequest("Unknown format");
  if (p.template && !getTemplate(p.template)) throw badRequest("Unknown template");
  const next: RenderSpec = {
    ...spec,
    template: p.template ?? spec.template,
    format: p.format ?? spec.format,
    fields: { ...spec.fields, ...(p.fields ?? {}) },
  };
  const kind: OutputKind = next.format === "story_9x16" && row.kind === "flyer" ? "story" : row.kind;
  return createVisualOutput({
    spec: next,
    kind,
    title: row.title,
    threadId: row.thread_id ?? undefined,
    parentId: row.id,
    meta: { ...json.parse<Record<string, unknown>>(row.meta, {}), rerenderOf: row.id },
  });
}
