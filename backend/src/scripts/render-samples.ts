/**
 * Renders every template in every format with sample data → ./samples (or argv[2]).
 * Usage: npm run render-samples -- /path/to/out [artistPhoto.jpg] [cutout.png] [background.jpg] [logo.png]
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROFILE } from "../brand/profile.js";
import { FORMATS, type FormatId } from "../render/formats.js";
import { closeRenderer, renderHtml } from "../render/renderer.js";
import { TEMPLATES } from "../render/templates/xs.js";

const [outDir = "./samples", artist, cutout, background, logo] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const headliner = { artist: "MARSHMELLO", venueLine: "XS LAS VEGAS", dateLine: "FRI. DEC 11", ctaLabel: "TICKETS:", ctaUrl: "WYNNNIGHTLIFE.COM", year: "2026" };
const fields: Record<string, Record<string, string>> = {
  default: headliner,
  xs26_headliner: headliner,
  xs26_campaign: { bigTop: "OPENING", bigBottom: "WEEKEND", pill: "XS LAS VEGAS", yearMark: "\u201826", campaignTitle: "OPENING", campaignSub: "WEEKEND LINEUP", artist: "DIPLO B2B HUGEL", dateLine: "SUNDAY,  NOVEMBER 8", ctaLine1: "TICKETS AND TABLE RESERVATIONS AT", ctaLine2: "WYNNNIGHTLIFE.COM" },
  xs26_feature: { kicker: "FOR THE\nFIRST TIME", artist: "FRANKY\nRIZARDO", infoLines: "Wednesday, November 18, 2026\nXS Las Vegas | 3131 Las Vegas Blvd S\nDoors 10PM | 21+ | wynnnightlife.com" },
  xs26_lineup: { title: "THIS WEEKEND", rows: "FRI. NOV 13 | KASKADE\nSAT. NOV 14 | MARSHMELLO", ctaLabel: "TICKETS:", ctaUrl: "WYNNNIGHTLIFE.COM", year: "2026" },
  xs_recap: { eyebrow: "LAST NIGHT · SAT 11.07", artist: "CALVIN HARRIS" },
};

const only = process.env.ONLY?.split(",");
const formats = (process.env.FORMATS?.split(",") as FormatId[] | undefined) ?? ["feed_4x5", "story_9x16"];

for (const tpl of TEMPLATES) {
  if (only && !only.includes(tpl.id)) continue;
  for (const fid of formats) {
    const format = FORMATS[fid];
    const html = tpl.render({
      format,
      fields: fields[tpl.id] ?? fields.default,
      images: {
        artist: tpl.images.prefersCutout ? cutout ?? artist : artist,
        artistIsCutout: tpl.images.prefersCutout && !!cutout,
        background: tpl.id === "xs_recap" ? background ?? artist : tpl.images.prefersCutout ? background : undefined,
        logo,
      },
      style: { mood: tpl.id === "xs_cutout" ? "noir" : "warm", grain: 0.35 },
      profile: DEFAULT_PROFILE,
    });
    if (tpl.images.background === "required" && !(background ?? artist)) continue;
    const t0 = Date.now();
    const { png, diagnostics } = await renderHtml(html, format);
    const file = path.join(outDir, `${tpl.id}__${fid}.png`);
    fs.writeFileSync(file, png);
    console.log(`${file}  ${Date.now() - t0}ms  ${diagnostics.join(" | ")}`);
  }
}
await closeRenderer();
