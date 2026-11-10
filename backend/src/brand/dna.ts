import sharp from "sharp";
import { assetPath, findAsset, listAssets, updateAsset } from "../assets.js";
import { complete, imageBlock } from "../claude.js";
import { kvGet, kvGetWithTime, kvSet } from "../db.js";
import { readFile } from "node:fs/promises";
import { getProfile } from "./profile.js";
import { XS_DNA_2026 } from "./xs-dna.js";

const ANALYST_SYSTEM = `You are a senior art director reverse-engineering a nightlife brand's social creative so a design system can reproduce it exactly. You are looking at one real published post by XS Nightclub (Wynn Las Vegas). Be forensic and specific — measurements as % of canvas, hex colours sampled by eye, type classification (e.g. "geometric sans, Futura-like, ~600 weight, all caps, tracking ~+40"), exact copy transcribed verbatim with line breaks, layout grid and hierarchy, photo grading (contrast, black level, warmth, grain, halation), effects (glow, foil, gradients), logo size/placement, margins/safe areas. Note anything that makes it read as authentically XS and anything that would look off-brand if changed. Output concise markdown with these headings: Type of post · Layout · Typography · Colour · Imagery & grade · Copy (verbatim) · Logo & lockups · Signature details.`;

function recentCaptions(): string {
  const caps = kvGet<Record<string, { caption?: string; timestamp?: string }>>("ig.captions", {});
  return (
    Object.values(caps)
      .filter((c) => c.caption)
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
      .slice(0, 40)
      .map((c) => `- (${(c.timestamp ?? "").slice(0, 10)}) ${c.caption!.replace(/\s+/g, " ").slice(0, 400)}`)
      .join("\n") || "(none synced yet)"
  );
}

export async function analyzeReference(assetId: string): Promise<string> {
  const a = findAsset(assetId);
  if (!a) throw new Error("Reference not found");
  const raw = await readFile(assetPath(a));
  const img = await sharp(raw).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const text = await complete({
    system: ANALYST_SYSTEM,
    content: [imageBlock(img), { type: "text", text: `Canvas: ${a.width}×${a.height}px. Analyse this post.` }],
    effort: "medium",
    maxTokens: 8000,
  });
  updateAsset(assetId, { analysis: text });
  return text;
}

const SYNTH_SYSTEM = `You are the creative director who owns XS Nightclub's visual identity. From forensic analyses of many real XS posts, write the definitive "Brand DNA" that a generative design agent will follow. Prioritise patterns that recur across posts; call out variations by post type (artist flyer, lineup, residency, recap, story). Be prescriptive and measurable: hierarchy, sizes as % of canvas, type classes and tracking, palette hexes, grade recipe, copy patterns (date format, CTA wording, fine print, hashtags, emoji use), logo usage, and a "never do" list. Where analyses disagree, say which is most frequent. Markdown, max ~1,200 words.`;

export async function rebuildDna(): Promise<string> {
  const refs = listAssets({ kind: "brand_reference", limit: 300 });
  const pending = refs.filter((r) => !r.analysis);
  for (const r of pending.slice(0, 40)) {
    try {
      await analyzeReference(r.id);
    } catch (err) {
      console.warn("[dna] analysis failed for", r.id, (err as Error).message);
    }
  }
  const analysed = listAssets({ kind: "brand_reference", limit: 300 }).filter((r) => r.analysis);
  if (!analysed.length) throw new Error("Upload some real XS posts as brand references first.");
  const profile = getProfile();
  const corpus = analysed.map((r, i) => `### Reference ${i + 1} (${r.width}×${r.height})\n${r.analysis}`).join("\n\n");
  const dna = await complete({
    system: SYNTH_SYSTEM,
    content: [
      {
        type: "text",
        text: `Baseline DNA (from an earlier forensic pass — keep what still holds, update what the new references change):\n${XS_DNA_2026}\n\nRecent Instagram captions (voice reference):\n${recentCaptions()}\n\nCurrent brand profile (team-maintained facts, keep consistent):\n${JSON.stringify({ palette: profile.palette, typography: profile.typography, website: profile.website, hashtags: profile.hashtags }, null, 2)}\n\n${analysed.length} reference analyses:\n\n${corpus}`,
      },
    ],
    effort: "high",
    maxTokens: 12000,
  });
  kvSet("brand.dna", dna);
  return dna;
}

/** Team-built DNA if present, otherwise the built-in 2026 DNA from real posts. */
export function getDna(): { dna: string | null; updatedAt?: string; source: "team" | "builtin" } {
  const r = kvGetWithTime("brand.dna");
  return r ? { dna: JSON.parse(r.value) as string, updatedAt: r.updatedAt, source: "team" } : { dna: XS_DNA_2026, source: "builtin" };
}
