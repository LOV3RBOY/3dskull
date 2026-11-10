import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { assetPath, assetToApi, createAsset, findAsset, listAssets, ASSET_KINDS } from "../assets.js";
import { canonicalArtist } from "../brand/profile.js";
import { imageBlock } from "../claude.js";
import { eventsForAgent } from "../events.js";
import { removeBackground } from "../imaging/cutout.js";
import { generatePlate } from "../imaging/plates.js";
import { createTextOutput, createVisualOutput, renderSpec, type RenderSpec, type ApiOutput } from "../outputs.js";
import { FORMAT_IDS } from "../render/formats.js";
import { getTemplate, TEMPLATES } from "../render/templates/xs.js";
import { newId } from "../util/ids.js";
import { vegasNow } from "../util/time.js";

type ToolResultContent = Anthropic.Beta.Messages.BetaToolResultBlockParam["content"];

export interface ToolContext {
  runId: string;
  threadId: string;
  userId: string;
  previews: Map<string, { spec: RenderSpec; png: Buffer; diagnostics: string[] }>;
  delivered: ApiOutput[];
  onOutput: (o: ApiOutput) => void;
  signal?: AbortSignal;
}

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  label: (input: z.infer<S>) => string;
  description: string;
  schema: S;
  jsonSchema: Record<string, unknown>;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResultContent>;
}

const define = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d;

async function previewImage(png: Buffer, width = 900) {
  return imageBlock(await sharp(png).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
}

const assetSummary = (a: ReturnType<typeof listAssets>[number]) => ({
  id: a.id,
  kind: a.kind,
  title: a.title,
  artist: a.artist ?? undefined,
  size: `${a.width}x${a.height}`,
  orientation: a.width > a.height * 1.1 ? "landscape" : a.height > a.width * 1.1 ? "portrait" : "square",
  transparent: !!a.has_alpha,
  notes: a.analysis ? a.analysis.slice(0, 300) : undefined,
  added: a.created_at.slice(0, 10),
});

// ─────────────────────────────────────────────────────────────────────────────

const lookupCalendar = define({
  name: "lookup_calendar",
  label: (i) => (i.artist ? `Checking the XS calendar for ${i.artist}` : "Checking the XS calendar"),
  description:
    "Look up XS / Wynn Nightlife bookings from the team calendar (the only source of truth for dates). Returns events with every pre-formatted date treatment (dowShort, dotted, long…). Search by date range and/or artist. Defaults to the next 60 days.",
  schema: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    artist: z.string().optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD inclusive" },
      to: { type: "string", description: "YYYY-MM-DD inclusive" },
      artist: { type: "string", description: "Artist name (accent/case-insensitive)" },
    },
  },
  async run(i) {
    const today = vegasNow().minus({ hours: 6 }).toISODate()!;
    const from = i.from ?? today;
    const to = i.to ?? vegasNow().plus({ days: 60 }).toISODate()!;
    const events = eventsForAgent({ from, to, artist: i.artist });
    let note = "";
    if (!events.length && i.artist) {
      const any = eventsForAgent({ from: today, artist: i.artist });
      note = any.length
        ? `No ${i.artist} date in ${from}..${to}. Next dates on the calendar: ${any.slice(0, 5).map((e) => `${e.dateFormats.medium} (${e.status})`).join(", ")}`
        : `${i.artist} has no upcoming dates on the XS calendar.`;
    }
    return JSON.stringify({ range: { from, to }, count: events.length, events, note: note || undefined });
  },
});

const findAssets = define({
  name: "find_assets",
  label: (i) => (i.artist ? `Finding approved photos of ${i.artist}` : `Searching the asset library${i.kind ? ` (${i.kind})` : ""}`),
  description: `Search the team's asset library. kinds: ${ASSET_KINDS.join(", ")}. Matching on artist is accent/case-insensitive. Returns metadata only — use view_assets to look at images.`,
  schema: z.object({ artist: z.string().optional(), kind: z.enum(ASSET_KINDS).optional(), query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
  jsonSchema: {
    type: "object",
    properties: {
      artist: { type: "string" },
      kind: { type: "string", enum: [...ASSET_KINDS] },
      query: { type: "string", description: "Free text over titles, tags, notes" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  async run(i) {
    const rows = listAssets({ artist: i.artist, kind: i.kind, q: i.query, limit: i.limit ?? 20 }).filter((a) => a.kind !== "brand_reference" || i.kind === "brand_reference");
    return JSON.stringify({ count: rows.length, assets: rows.map(assetSummary) });
  },
});

const viewAssets = define({
  name: "view_assets",
  label: (i) => `Reviewing ${i.asset_ids.length} image${i.asset_ids.length === 1 ? "" : "s"}`,
  description: "Look at up to 6 assets (returns the images) to judge quality, composition, expression and room for typography before choosing.",
  schema: z.object({ asset_ids: z.array(z.string()).min(1).max(6) }),
  jsonSchema: { type: "object", properties: { asset_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 } }, required: ["asset_ids"] },
  async run(i) {
    const blocks: Exclude<ToolResultContent, string | undefined> = [];
    for (const id of i.asset_ids) {
      const a = findAsset(id);
      if (!a) {
        blocks.push({ type: "text", text: `${id}: not found` });
        continue;
      }
      const img = await sharp(await readFile(assetPath(a)))
        .resize({ width: 640, height: 640, fit: "inside" })
        .flatten({ background: "#777777" })
        .jpeg({ quality: 80 })
        .toBuffer();
      blocks.push({ type: "text", text: `${a.id} — ${a.kind}${a.artist ? ` · ${a.artist}` : ""} · ${a.width}x${a.height}${a.has_alpha ? " · transparent (shown on grey)" : ""}` });
      blocks.push(imageBlock(img));
    }
    return blocks;
  },
});

const viewReferences = define({
  name: "view_brand_references",
  label: () => "Studying real XS posts for reference",
  description: "Look at real published XS posts the team uploaded as brand references (newest first, optional text filter on their analyses, e.g. 'lineup', 'residency', 'story'). Use to match the house style precisely.",
  schema: z.object({ query: z.string().optional(), count: z.number().int().min(1).max(6).optional() }),
  jsonSchema: { type: "object", properties: { query: { type: "string" }, count: { type: "integer", minimum: 1, maximum: 6 } } },
  async run(i) {
    const refs = listAssets({ kind: "brand_reference", q: i.query, limit: i.count ?? 4 });
    if (!refs.length) return "No brand references uploaded yet. Rely on the brand profile.";
    const blocks: Exclude<ToolResultContent, string | undefined> = [];
    for (const a of refs) {
      const img = await sharp(await readFile(assetPath(a))).resize({ width: 720, height: 900, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      blocks.push({ type: "text", text: `Reference ${a.id} (${a.width}x${a.height})` });
      blocks.push(imageBlock(img));
    }
    return blocks;
  },
});

const generatePlateTool = define({
  name: "generate_plate",
  label: () => "Generating an atmosphere plate",
  description:
    "Generate a photographic, people-free, text-free atmosphere background plate (room, light, texture) for a layout. Describe the scene concretely in camera terms. Optionally pass real venue photos as references to match the actual room. Saved to the library as a texture.",
  schema: z.object({
    prompt: z.string().min(10).max(2000),
    aspect: z.enum(["4:5", "9:16", "1:1", "16:9", "3:4"]),
    reference_asset_ids: z.array(z.string()).max(4).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Scene description: space, materials, light, lens, mood. No people or text." },
      aspect: { type: "string", enum: ["4:5", "9:16", "1:1", "16:9", "3:4"] },
      reference_asset_ids: { type: "array", items: { type: "string" }, maxItems: 4, description: "venue_photo/texture assets to match" },
    },
    required: ["prompt", "aspect"],
  },
  async run(i, ctx) {
    const refs: Buffer[] = [];
    for (const id of i.reference_asset_ids ?? []) {
      const a = findAsset(id);
      if (a && (a.kind === "venue_photo" || a.kind === "texture" || a.kind === "crowd_photo")) refs.push(await readFile(assetPath(a)));
    }
    const plate = await generatePlate({ prompt: i.prompt, aspect: i.aspect, references: refs });
    const asset = await createAsset({ data: plate.data, kind: "texture", title: `AI plate · ${i.prompt.slice(0, 60)}`, tags: ["ai-plate", plate.provider], userId: ctx.userId });
    return [
      { type: "text", text: `Plate saved as ${asset.id} (${asset.width}x${asset.height}, via ${plate.provider}/${plate.model}). Use it as background_asset_id.` },
      await previewImage(await readFile(assetPath(asset)), 640),
    ];
  },
});

const cutoutTool = define({
  name: "cutout_artist_photo",
  label: () => "Cutting out the artist from the press photo",
  description: "Create a transparent cut-out (artist_cutout) from an artist_photo using non-generative background removal. Pixels of the person are preserved exactly.",
  schema: z.object({ asset_id: z.string() }),
  jsonSchema: { type: "object", properties: { asset_id: { type: "string" } }, required: ["asset_id"] },
  async run(i, ctx) {
    const a = findAsset(i.asset_id);
    if (!a) throw new Error("Asset not found");
    const png = await removeBackground(await readFile(assetPath(a)));
    const cut = await createAsset({ data: png, kind: "artist_cutout", title: `${a.title} (cut-out)`, artist: a.artist ?? undefined, tags: ["auto-cutout", `from:${a.id}`], userId: ctx.userId });
    return [{ type: "text", text: `Cut-out saved as ${cut.id} (${cut.width}x${cut.height}).` }, await previewImage(await sharp(await readFile(assetPath(cut))).flatten({ background: "#777777" }).png().toBuffer(), 480)];
  },
});

const StyleSchema = z
  .object({
    mood: z.enum(["warm", "noir", "gold", "natural"]).optional(),
    accent: z.enum(["gold", "champagne", "ivory", "bronze"]).optional(),
    grain: z.number().min(0).max(1).optional(),
    focus: z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional(),
    shade: z.number().min(0).max(1).optional(),
    display_font: z.string().optional(),
    seed: z.number().int().min(0).max(1_000_000).optional(),
    zoom: z.number().min(0.5).max(2).optional(),
  })
  .optional();

const renderVisual = define({
  name: "render_visual",
  label: (i) => `Rendering ${i.template.replace("xs_", "")} · ${i.format.replace("_", " ")}`,
  description:
    "Lay out and render a visual with the deterministic XS layout engine (all typography is typeset, never AI-drawn). Returns a preview image to review plus layout diagnostics, and a preview_id. Nothing is saved for the team until you call deliver.",
  schema: z.object({
    template: z.string(),
    format: z.enum(FORMAT_IDS as [string, ...string[]]),
    fields: z.record(z.string(), z.string()),
    artist_asset_id: z.string().optional(),
    background_asset_id: z.string().optional(),
    artist_logo_asset_id: z.string().nullable().optional(),
    style: StyleSchema,
  }),
  jsonSchema: {
    type: "object",
    properties: {
      template: { type: "string", enum: TEMPLATES.map((t) => t.id) },
      format: { type: "string", enum: FORMAT_IDS },
      fields: { type: "object", additionalProperties: { type: "string" }, description: "Template text fields (see template catalogue)" },
      artist_asset_id: { type: "string", description: "artist_photo or artist_cutout asset id" },
      background_asset_id: { type: "string", description: "Full-bleed background: venue/crowd photo, texture, or approved artist key art that already has its own background" },
      artist_logo_asset_id: { type: ["string", "null"], description: "artist_logo asset to use instead of typeset name (auto-picked by artist name if omitted; null forces typeset)" },
      style: {
        type: "object",
        properties: {
          mood: { type: "string", enum: ["warm", "noir", "gold", "natural"] },
          accent: { type: "string", enum: ["gold", "champagne", "ivory", "bronze"] },
          grain: { type: "number", minimum: 0, maximum: 1 },
          focus: { type: "string", description: "object-position like '50% 25%'" },
          shade: { type: "number", minimum: 0, maximum: 1 },
          display_font: { type: "string" },
          seed: { type: "integer", description: "Light-trail / procedural background seed (vary for a fresh pattern, keep for consistency)" },
          zoom: { type: "number", description: "Scale of the artist hero (1 = default)" },
        },
      },
    },
    required: ["template", "format", "fields"],
  },
  async run(i, ctx) {
    const tpl = getTemplate(i.template);
    if (!tpl) throw new Error(`Unknown template ${i.template}`);
    const fields = { ...i.fields };
    if (fields.artist) fields.artist = canonicalArtist(fields.artist);
    const spec: RenderSpec = {
      template: i.template,
      format: i.format as RenderSpec["format"],
      fields,
      images: { artistAssetId: i.artist_asset_id, backgroundAssetId: i.background_asset_id, artistLogoAssetId: i.artist_logo_asset_id },
      style: {
        mood: i.style?.mood,
        accent: i.style?.accent,
        grain: i.style?.grain,
        focus: i.style?.focus,
        shade: i.style?.shade,
        displayFont: i.style?.display_font,
        seed: i.style?.seed,
        zoom: i.style?.zoom,
      },
    };
    const r = await renderSpec(spec);
    const id = newId("pv");
    ctx.previews.set(id, { spec, png: r.png, diagnostics: r.diagnostics });
    const fieldNote = fields.artist !== i.fields.artist ? ` (artist styled as "${fields.artist}")` : "";
    return [
      { type: "text", text: `preview_id: ${id}${fieldNote}\nDiagnostics: ${r.diagnostics.length ? r.diagnostics.join(" | ") : "none — layout clean"}` },
      await previewImage(r.png, i.format === "landscape_16x9" ? 1200 : 860),
    ];
  },
});

const deliver = define({
  name: "deliver",
  label: (i) => `Delivering ${i.items.length} visual${i.items.length === 1 ? "" : "s"}`,
  description: "Save final, reviewed previews to the team's Library (full resolution). Only deliver work you'd post.",
  schema: z.object({
    items: z
      .array(z.object({ preview_id: z.string(), kind: z.enum(["flyer", "story", "lineup", "announcement", "recap"]), title: z.string().min(1).max(120) }))
      .min(1)
      .max(12),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            preview_id: { type: "string" },
            kind: { type: "string", enum: ["flyer", "story", "lineup", "announcement", "recap"] },
            title: { type: "string", description: "e.g. 'DIPLO · SAT 11.28 — Feed'" },
          },
          required: ["preview_id", "kind", "title"],
        },
      },
    },
    required: ["items"],
  },
  async run(i, ctx) {
    const saved: string[] = [];
    for (const item of i.items) {
      const p = ctx.previews.get(item.preview_id);
      if (!p) {
        saved.push(`${item.preview_id}: unknown preview id`);
        continue;
      }
      const out = await createVisualOutput({
        spec: p.spec,
        kind: item.kind,
        title: item.title,
        threadId: ctx.threadId,
        runId: ctx.runId,
        // Re-render at full resolution for print; social previews are already full-size.
        rendered: p.spec.format === "print_18x24" ? undefined : { png: p.png, diagnostics: p.diagnostics },
      });
      ctx.delivered.push(out);
      ctx.onOutput(out);
      saved.push(`${item.preview_id} → ${out.id} (${out.format?.label})`);
    }
    return saved.join("\n");
  },
});

const deliverCopy = define({
  name: "deliver_copy",
  label: (i) => `Writing ${i.kind === "caption" ? "caption" : "copy"}`,
  description: "Save text deliverables (Instagram caption options, story text, email subject lines, X post, press blurb…) to the Library.",
  schema: z.object({ kind: z.enum(["caption", "copy"]), title: z.string().min(1).max(120), text: z.string().min(1).max(8000) }),
  jsonSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["caption", "copy"] },
      title: { type: "string" },
      text: { type: "string" },
    },
    required: ["kind", "title", "text"],
  },
  async run(i, ctx) {
    const out = createTextOutput({ kind: i.kind, title: i.title, text: i.text, threadId: ctx.threadId, runId: ctx.runId });
    ctx.delivered.push(out);
    ctx.onOutput(out);
    return `Saved ${out.id}`;
  },
});

export const TOOLS = [lookupCalendar, findAssets, viewAssets, viewReferences, generatePlateTool, cutoutTool, renderVisual, deliver, deliverCopy];

export function toolDefinitions(): Anthropic.Beta.Messages.BetaTool[] {
  return TOOLS.map((t, idx) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
    eager_input_streaming: true,
    // Cache breakpoint on the last tool keeps the whole tool list in the cached prefix.
    ...(idx === TOOLS.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ content: ToolResultContent; isError: boolean; label: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: `Unknown tool ${name}`, isError: true, label: name };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      isError: true,
      label: name,
    };
  }
  const label = (tool.label as (i: unknown) => string)(parsed.data);
  try {
    const content = await (tool.run as (i: unknown, c: ToolContext) => Promise<ToolResultContent>)(parsed.data, ctx);
    return { content, isError: false, label };
  } catch (err) {
    return { content: `Error: ${(err as Error).message}`, isError: true, label };
  }
}

export { assetToApi };
