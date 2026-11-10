import { XS26_TEMPLATES } from "./xs26.js";
import {
  COMMON_FIELDS,
  type EditableField,
  type TemplateDef,
  type TemplateInput,
  esc,
  escLines,
  fileUrl,
  finishLayers,
  hexA,
  isLandscape,
  isTall,
  logoHtml,
  moodFilter,
  page,
  photoLayer,
  proceduralAtmosphere,
} from "./base.js";

const px = (n: number) => `${Math.round(n)}px`;

/** Type-size basis: stories use the same type scale as a 4:5 feed post of the same width. */
const typeBasis = (f: { width: number; height: number }) => Math.min(f.width * 1.25, f.height);

/** The information stack shared by single-artist layouts. */
function infoStack(input: TemplateInput, opts: { nameMax: number; nameMin?: number; align?: "center" | "left"; nameClass?: string; gap?: number; hideName?: boolean }) {
  const f = input.fields;
  const H = typeBasis(input.format);
  const T = H;
  const align = opts.align ?? "center";
  const g = opts.gap ?? H * 0.014;
  return `<div class="info" style="text-align:${align};display:flex;flex-direction:column;align-items:${align === "center" ? "center" : "flex-start"};gap:${px(g)}">
    ${f.eyebrow ? `<div class="caps eyebrow" style="font-size:${px(T * 0.0165)};color:var(--accent)">${esc(f.eyebrow)}</div>` : ""}
    ${opts.hideName ? "" : `<div class="display fit name ${opts.nameClass ?? ""}" data-fit data-max="${opts.nameMax}" data-min="${opts.nameMin ?? H * 0.03}" data-safe="artist name" style="text-align:${align};letter-spacing:0.02em">${escLines(f.artist)}</div>`}
    ${f.support ? `<div class="caps support" style="font-size:${px(T * 0.02)};color:var(--ivory);letter-spacing:.24em">${esc(f.support)}</div>` : ""}
    ${f.dateLine ? `<div class="hair" style="width:${align === "center" ? "34%" : "40%"};margin:${px(g * 0.6)} 0;${align === "left" ? "background:linear-gradient(90deg,var(--accent),transparent)" : ""}"></div>` : ""}
    ${f.dateLine ? `<div class="caps date" style="font-size:${px(T * 0.026)};color:var(--ivory);letter-spacing:.3em;font-weight:600">${esc(f.dateLine)}</div>` : ""}
    ${f.venueLine ? `<div class="caps venue" style="font-size:${px(T * 0.0145)};color:var(--accent);letter-spacing:.34em">${esc(f.venueLine)}</div>` : ""}
  </div>`;
}

function footer(input: TemplateInput) {
  const f = input.fields;
  const H = typeBasis(input.format);
  const T = H;
  if (!f.cta && !f.finePrint) return "";
  return `<div class="footer" data-safe="footer" style="position:absolute;left:var(--safe-side);right:var(--safe-side);bottom:var(--safe-bottom);text-align:center;display:flex;flex-direction:column;gap:${px(H * 0.008)};align-items:center">
    ${f.cta ? `<div class="caps nowrap-check" style="font-size:${px(T * 0.0135)};letter-spacing:.3em;color:var(--ivory);white-space:nowrap;overflow:hidden;max-width:100%">${esc(f.cta)}</div>` : ""}
    ${f.finePrint ? `<div class="caps nowrap-check" style="font-size:${px(T * 0.0095)};letter-spacing:.22em;color:${hexA(input.profile.palette.ivory, 0.55)};white-space:nowrap;overflow:hidden;max-width:100%">${esc(f.finePrint)}</div>` : ""}
  </div>`;
}

function topLogo(input: TemplateInput, scale = 1) {
  const H = typeBasis(input.format);
  const T = H;
  return `<div class="top" data-safe="logo" style="position:absolute;top:var(--safe-top);left:var(--safe-side);right:var(--safe-side);display:flex;justify-content:center">${logoHtml(input, px(H * 0.06 * scale))}</div>`;
}

// ───────────────────────── 7. RECAP (photo + minimal mark) ─────────────────────────
const RECAP_FIELDS: EditableField[] = [
  { key: "eyebrow", label: "Small line", multiline: false, help: "e.g. LAST NIGHT · SAT 11.07" },
  { key: "artist", label: "Artist", multiline: false },
];

export const recap: TemplateDef = {
  id: "xs_recap",
  name: "Recap photo",
  description:
    "For real event photography (crowd, booth, room): the photo is the post. Graded to the XS look with grain, tiny logo bottom-centre and an optional discreet line ('LAST NIGHT · CALVIN HARRIS'). Never fake a crowd — use team photos only.",
  kinds: ["recap"],
  fields: RECAP_FIELDS,
  images: { background: "required", artist: "none" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const line = [input.fields.eyebrow, input.fields.artist].filter(Boolean).join("  ·  ");
    return page(
      input,
      ``,
      `${photoLayer(input.images.background, { ...input, style: { ...input.style, mood: input.style.mood ?? "warm" } })}
      <div class="abs" style="background:linear-gradient(180deg,rgba(0,0,0,0) 70%,rgba(0,0,0,.65) 100%)"></div>
      ${finishLayers(input, 0.4)}
      <div data-safe="mark" style="position:absolute;left:var(--safe-side);right:var(--safe-side);bottom:var(--safe-bottom);display:flex;flex-direction:column;align-items:center;gap:${px(H * 0.012)}">
        ${line ? `<div class="caps" style="font-size:${px(T * 0.013)};letter-spacing:.32em;color:var(--ivory)">${esc(line)}</div>` : ""}
        ${logoHtml(input, px(H * 0.035))}
      </div>`,
    );
  },
};

export const TEMPLATES: TemplateDef[] = [...XS26_TEMPLATES, recap];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
