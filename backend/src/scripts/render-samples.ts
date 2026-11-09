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

const fields: Record<string, Record<string, string>> = {
  default: {
    eyebrow: "WYNN NIGHTLIFE PRESENTS",
    artist: "DIPLO",
    support: "",
    dateLine: "SAT 11.28",
    venueLine: "XS NIGHTCLUB · WYNN LAS VEGAS",
    cta: "TICKETS & TABLES · WYNNSOCIAL.COM",
    finePrint: "21+ · VALID GOVERNMENT-ISSUED ID REQUIRED · DRESS CODE STRICTLY ENFORCED",
  },
  xs_lineup: {
    title: "THIS WEEKEND",
    rows: "FRI 11.13 | KASKADE\nSAT 11.14 | MARSHMELLO",
    venueLine: "XS NIGHTCLUB · WYNN LAS VEGAS",
    cta: "TICKETS & TABLES · WYNNSOCIAL.COM",
    finePrint: "21+ · DRESS CODE STRICTLY ENFORCED",
  },
  xs_residency: {
    eyebrow: "WELCOME HOME",
    artist: "RÜFÜS DU SOL",
    dates: "SUN 11.22\nSAT 12.19\nFRI 01.15\nSAT 02.13\nFRI 03.12\nSAT 04.10",
    venueLine: "XS NIGHTCLUB · WYNN LAS VEGAS",
    cta: "TICKETS & TABLES · WYNNSOCIAL.COM",
    finePrint: "21+",
  },
  xs_recap: { eyebrow: "LAST NIGHT · SAT 11.07", artist: "CALVIN HARRIS" },
};

const only = process.env.ONLY?.split(",");
const formats = (process.env.FORMATS?.split(",") as FormatId[] | undefined) ?? ["feed_4x5", "story_9x16", "landscape_16x9"];

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
