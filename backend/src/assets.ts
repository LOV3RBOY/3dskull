import sharp from "sharp";
import { db, json } from "./db.js";
import { deleteFile, filePath, makeThumb, putFile, signedUrl } from "./storage.js";
import { badRequest, notFound } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";

export const ASSET_KINDS = ["artist_photo", "artist_cutout", "artist_logo", "logo", "venue_photo", "crowd_photo", "texture", "brand_reference"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export interface AssetRow {
  id: string;
  kind: AssetKind;
  title: string;
  artist: string | null;
  tags: string;
  file_key: string;
  thumb_key: string;
  mime: string;
  width: number;
  height: number;
  has_alpha: number;
  analysis: string | null;
  created_by: string | null;
  created_at: string;
}

export function assetToApi(r: AssetRow) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    artist: r.artist ?? undefined,
    tags: json.parse<string[]>(r.tags, []),
    url: signedUrl(r.file_key)!,
    thumbUrl: signedUrl(r.thumb_key)!,
    width: r.width,
    height: r.height,
    hasAlpha: !!r.has_alpha,
    analysis: r.analysis ?? undefined,
    createdAt: r.created_at,
  };
}
export type ApiAsset = ReturnType<typeof assetToApi>;

const MAX_PIXELS = 12000 * 12000;

export async function createAsset(input: {
  data: Buffer;
  kind: AssetKind;
  title?: string;
  artist?: string;
  tags?: string[];
  userId?: string;
}): Promise<AssetRow> {
  if (!ASSET_KINDS.includes(input.kind)) throw badRequest(`Unknown asset kind ${input.kind}`);
  let img = sharp(input.data, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate();
  const meta = await img.metadata().catch(() => {
    throw badRequest("File is not a supported image");
  });
  // Normalise: keep alpha as PNG, everything else high-quality JPEG; cap the long edge at 6000px.
  const hasAlpha = !!meta.hasAlpha && (await sharp(input.data).stats()).isOpaque === false;
  img = img.resize({ width: 6000, height: 6000, fit: "inside", withoutEnlargement: true });
  const out = hasAlpha ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();
  const outMeta = await sharp(out).metadata();
  const id = newId("ast");
  const ext = hasAlpha ? "png" : "jpg";
  const fileKey = await putFile(`assets/${id}.${ext}`, out);
  const thumbKey = await putFile(`assets/${id}_thumb.webp`, await makeThumb(out));
  const row: AssetRow = {
    id,
    kind: input.kind,
    title: input.title?.trim() || input.artist?.trim() || input.kind.replace("_", " "),
    artist: input.artist?.trim() || null,
    tags: JSON.stringify((input.tags ?? []).map((t) => t.trim()).filter(Boolean)),
    file_key: fileKey,
    thumb_key: thumbKey,
    mime: hasAlpha ? "image/png" : "image/jpeg",
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    has_alpha: hasAlpha ? 1 : 0,
    analysis: null,
    created_by: input.userId ?? null,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO assets (id, kind, title, artist, tags, file_key, thumb_key, mime, width, height, has_alpha, analysis, created_by, created_at)
     VALUES (@id, @kind, @title, @artist, @tags, @file_key, @thumb_key, @mime, @width, @height, @has_alpha, @analysis, @created_by, @created_at)`,
  ).run(row);
  return row;
}

export function getAsset(id: string): AssetRow {
  const r = db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined;
  if (!r) throw notFound("Asset");
  return r;
}

export function findAsset(id: string): AssetRow | undefined {
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined;
}

export function assetPath(r: AssetRow) {
  return filePath(r.file_key);
}

const normalise = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function listAssets(filter: { kind?: string; artist?: string; q?: string; limit?: number } = {}): AssetRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    where.push("kind = ?");
    params.push(filter.kind);
  }
  if (filter.q) {
    where.push("(title LIKE ? OR artist LIKE ? OR tags LIKE ? OR analysis LIKE ?)");
    const like = `%${filter.q}%`;
    params.push(like, like, like, like);
  }
  let rows = db
    .prepare(`SELECT * FROM assets ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, filter.artist ? 2000 : (filter.limit ?? 500)) as AssetRow[];
  if (filter.artist) {
    // Accent/case/punctuation-insensitive artist match (RÜFÜS DU SOL == Rufus Du Sol).
    const target = normalise(filter.artist);
    rows = rows.filter((r) => r.artist && (normalise(r.artist) === target || normalise(r.artist).includes(target) || target.includes(normalise(r.artist))));
    rows = rows.slice(0, filter.limit ?? 500);
  }
  return rows;
}

export function updateAsset(id: string, patch: { title?: string; artist?: string | null; tags?: string[]; kind?: AssetKind; analysis?: string }) {
  const r = getAsset(id);
  if (patch.kind && !ASSET_KINDS.includes(patch.kind)) throw badRequest("Unknown asset kind");
  const next = {
    ...r,
    title: patch.title ?? r.title,
    artist: patch.artist === undefined ? r.artist : patch.artist,
    tags: patch.tags ? JSON.stringify(patch.tags) : r.tags,
    kind: patch.kind ?? r.kind,
    analysis: patch.analysis ?? r.analysis,
  };
  db.prepare("UPDATE assets SET title=@title, artist=@artist, tags=@tags, kind=@kind, analysis=@analysis WHERE id=@id").run(next);
  return getAsset(id);
}

export async function deleteAsset(id: string) {
  const r = getAsset(id);
  db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  await deleteFile(r.file_key);
  await deleteFile(r.thumb_key);
}

const hasTag = (a: AssetRow, tag: string) => json.parse<string[]>(a.tags, []).some((t) => t.toLowerCase() === tag);

/** XS logo: kind logo tagged "xs" (or "primary"); falls back to the newest logo not tagged "wynn". */
export function primaryLogo(): AssetRow | undefined {
  const logos = listAssets({ kind: "logo", limit: 50 });
  return logos.find((l) => hasTag(l, "xs") || hasTag(l, "primary")) ?? logos.find((l) => !hasTag(l, "wynn"));
}

/** Wynn Nightlife Las Vegas logo: kind logo tagged "wynn". */
export function wynnLogo(): AssetRow | undefined {
  return listAssets({ kind: "logo", limit: 50 }).find((l) => hasTag(l, "wynn"));
}

/** The artist's own logotype (e.g. Kaskade, RÜFÜS DU SOL), if the team uploaded one. */
export function artistLogo(artist: string): AssetRow | undefined {
  return listAssets({ kind: "artist_logo", artist, limit: 5 })[0];
}
