/**
 * Instagram sync via the official Instagram API (Instagram API with Instagram Login).
 * The @xslasvegas professional account authorises a Meta app once; the long-lived token
 * goes in INSTAGRAM_ACCESS_TOKEN. The server then pulls the account's own posts (images +
 * captions) into Brand → References, so the agent's Brand DNA always reflects the live grid.
 *
 * Endpoints used:
 *   GET https://graph.instagram.com/me?fields=id,username
 *   GET https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}
 *   GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…
 */
import { analyzeReference } from "../brand/dna.js";
import { anthropicConfigured } from "../claude.js";
import { createAsset, listAssets } from "../assets.js";
import { kvGet, kvSet } from "../db.js";

const BASE = process.env.INSTAGRAM_API_BASE ?? "https://graph.instagram.com";
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";

interface Media {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] };
}

export interface SyncResult {
  account?: string;
  scanned: number;
  imported: number;
  skipped: number;
  errors: string[];
}

function token(): string | undefined {
  return kvGet<{ token?: string }>("ig.auth", {}).token ?? process.env.INSTAGRAM_ACCESS_TOKEN;
}

export function instagramConfigured() {
  return !!token();
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram API ${res.status}: ${body?.error?.message ?? "request failed"}`);
  return body;
}

/** Long-lived tokens last 60 days; refresh when older than ~20 days. */
export async function refreshTokenIfNeeded(force = false) {
  const t = token();
  if (!t) return;
  const auth = kvGet<{ token?: string; refreshedAt?: string }>("ig.auth", {});
  const age = auth.refreshedAt ? Date.now() - Date.parse(auth.refreshedAt) : Infinity;
  if (!force && age < 20 * 86400_000) return;
  const j = await getJson(`${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t)}`);
  if (j.access_token) kvSet("ig.auth", { token: j.access_token, refreshedAt: new Date().toISOString() });
}

export async function syncInstagram(opts: { maxPosts?: number; userId?: string } = {}): Promise<SyncResult> {
  const t = token();
  if (!t) throw new Error("Instagram isn't connected. Set INSTAGRAM_ACCESS_TOKEN (see docs/INSTAGRAM.md).");
  await refreshTokenIfNeeded().catch(() => {});
  const result: SyncResult = { scanned: 0, imported: 0, skipped: 0, errors: [] };
  const me = await getJson(`${BASE}/me?fields=id,username&access_token=${encodeURIComponent(token()!)}`);
  result.account = me.username;

  const already = new Set(
    listAssets({ kind: "brand_reference", limit: 100000 })
      .flatMap((a) => JSON.parse(a.tags) as string[])
      .filter((t) => t.startsWith("ig:"))
      .map((t) => t.slice(3)),
  );
  const captions = kvGet<Record<string, { caption?: string; timestamp?: string; permalink?: string }>>("ig.captions", {});
  let url: string | undefined = `${BASE}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=50&access_token=${encodeURIComponent(token()!)}`;
  const max = opts.maxPosts ?? 120;

  while (url && result.scanned < max) {
    const page: { data: Media[]; paging?: { next?: string } } = await getJson(url);
    for (const m of page.data ?? []) {
      if (result.scanned >= max) break;
      result.scanned++;
      captions[m.id] = { caption: m.caption, timestamp: m.timestamp, permalink: m.permalink };
      // Images: the post itself; carousels: every image slide; videos/reels: the cover frame.
      const images: { key: string; url: string }[] =
        m.media_type === "CAROUSEL_ALBUM"
          ? (m.children?.data ?? []).map((c, i) => ({ key: `${m.id}_${i}`, url: (c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url) ?? "" }))
          : [{ key: m.id, url: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? "" }];
      for (const img of images) {
        if (!img.url) continue;
        if (already.has(img.key)) {
          result.skipped++;
          continue;
        }
        try {
          const res = await fetch(img.url, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok) throw new Error(`download ${res.status}`);
          const data = Buffer.from(await res.arrayBuffer());
          const title = (m.caption ?? "").split("\n")[0].slice(0, 100) || `@xslasvegas post ${m.timestamp?.slice(0, 10) ?? ""}`;
          const asset = await createAsset({
            data,
            kind: "brand_reference",
            title,
            tags: ["instagram", `ig:${img.key}`, `date:${m.timestamp?.slice(0, 10) ?? ""}`, m.media_type.toLowerCase()],
            userId: opts.userId,
          });
          already.add(img.key);
          result.imported++;
          if (anthropicConfigured()) await analyzeReference(asset.id).catch((e) => result.errors.push(`analysis ${asset.id}: ${(e as Error).message}`));
        } catch (e) {
          result.errors.push(`${img.key}: ${(e as Error).message}`);
        }
      }
    }
    url = page.paging?.next;
  }
  kvSet("ig.captions", captions);
  kvSet("ig.lastSync", { at: new Date().toISOString(), ...result });
  return result;
}

export function lastSync() {
  return kvGet<(SyncResult & { at: string }) | null>("ig.lastSync", null);
}

/** Background sync every N hours when a token is configured. */
export function startInstagramScheduler(hours = Number(process.env.INSTAGRAM_SYNC_HOURS ?? 6)) {
  if (!instagramConfigured() || hours <= 0) return;
  const run = () =>
    syncInstagram({ maxPosts: 60 })
      .then((r) => console.log(`[instagram] synced @${r.account}: +${r.imported} new, ${r.skipped} known`))
      .catch((e) => console.warn("[instagram] sync failed:", (e as Error).message));
  setTimeout(run, 30_000).unref();
  setInterval(run, hours * 3600_000).unref();
}
