import { pathToFileURL } from "node:url";
import type { BrandProfile } from "../../brand/profile.js";
import { fontFaceCss } from "../fonts.js";
import type { Format } from "../formats.js";

export type Mood = "warm" | "noir" | "gold" | "natural";
export type Accent = "gold" | "champagne" | "ivory" | "bronze";

export interface TemplateImages {
  /** Absolute file paths */
  background?: string;
  artist?: string;
  artistIsCutout?: boolean;
  logo?: string;
}

export interface TemplateStyle {
  mood?: Mood;
  accent?: Accent;
  /** 0..1 film grain strength */
  grain?: number;
  /** CSS object-position for the main photo, e.g. "50% 25%" */
  focus?: string;
  /** Override display font family (must be a loaded family) */
  displayFont?: string;
  /** Darkness of the type-protection gradient, 0..1 */
  shade?: number;
}

export interface TemplateInput {
  format: Format;
  fields: Record<string, string>;
  images: TemplateImages;
  style: TemplateStyle;
  profile: BrandProfile;
}

export interface EditableField {
  key: string;
  label: string;
  multiline: boolean;
  help?: string;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  kinds: ("flyer" | "story" | "lineup" | "announcement" | "recap")[];
  fields: EditableField[];
  images: { background: "required" | "optional" | "none"; artist: "required" | "optional" | "none"; prefersCutout?: boolean };
  render(input: TemplateInput): string;
}

export const esc = (s: string | undefined | null) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escape, then turn newlines into <br>. */
export const escLines = (s: string | undefined | null) => esc(s).replace(/\n/g, "<br>");

export const fileUrl = (p?: string) => (p ? pathToFileURL(p).href : "");

export function accentColor(profile: BrandProfile, accent: Accent = "gold"): string {
  const p = profile.palette;
  return { gold: p.champagne, champagne: p.goldLight, ivory: p.ivory, bronze: p.gold }[accent] ?? p.champagne;
}

export function isLandscape(f: Format) {
  return f.width / f.height > 1.2;
}
export function isTall(f: Format) {
  return f.height / f.width > 1.6;
}

/** CSS filter chain for a photographic mood. Duotone ("gold") adds an overlay layer too. */
export function moodFilter(mood: Mood = "warm"): string {
  switch (mood) {
    case "noir":
      return "grayscale(1) contrast(1.18) brightness(0.92)";
    case "gold":
      return "grayscale(1) contrast(1.15) brightness(1.02)";
    case "natural":
      return "contrast(1.05) saturate(0.95)";
    case "warm":
    default:
      return "contrast(1.1) saturate(0.82) sepia(0.22) brightness(0.94) hue-rotate(-4deg)";
  }
}

export function photoLayer(path: string | undefined, input: TemplateInput, opts: { className?: string; fit?: "cover" | "contain"; extraStyle?: string } = {}) {
  if (!path) return "";
  const mood = input.style.mood ?? "warm";
  const pos = input.style.focus ?? "50% 30%";
  const duo =
    mood === "gold"
      ? `<div class="duo-shadow"></div><div class="duo-light"></div>`
      : `<div class="warm-wash"></div>`;
  return `<div class="photo ${opts.className ?? ""}" style="${opts.extraStyle ?? ""}">
    <img src="${fileUrl(path)}" style="object-fit:${opts.fit ?? "cover"};object-position:${esc(pos)};filter:${moodFilter(mood)}" />
    ${duo}
  </div>`;
}

export function logoHtml(input: TemplateInput, size: string, color?: string): string {
  if (input.images.logo) {
    return `<img class="logo" src="${fileUrl(input.images.logo)}" style="height:${size};width:auto;object-fit:contain" />`;
  }
  // Typeset placeholder — the team should upload the official XS logo artwork.
  const c = color ?? input.profile.palette.goldLight;
  return `<div class="logo logo-fallback" style="font-size:${size};color:${c}">${esc(input.profile.brandName)}</div>`;
}

/** Film grain + subtle vignette layers. Real camera texture is the #1 thing that stops output looking synthetic. */
export function finishLayers(input: TemplateInput, vignette = 0.55): string {
  const grain = Math.max(0, Math.min(1, input.style.grain ?? 0.35));
  return `<div class="vignette" style="opacity:${vignette}"></div><div class="grain" style="opacity:${(grain * 0.5).toFixed(3)}"></div>`;
}

const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
);

/**
 * In-page layout pass: fits [data-fit] text to its box with a binary search on
 * font-size, then reports anything that still overflows or leaves the safe zone.
 */
const LAYOUT_JS = `
window.__layout = function () {
  var diags = [];
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-fit]'));
  els.forEach(function (el) {
    var max = parseFloat(el.getAttribute('data-max')) || 200;
    var min = parseFloat(el.getAttribute('data-min')) || 10;
    var maxH = parseFloat(el.getAttribute('data-maxh')) || Infinity;
    var lo = min, hi = max, best = min;
    for (var i = 0; i < 18; i++) {
      var mid = (lo + hi) / 2;
      el.style.fontSize = mid + 'px';
      var fits = el.scrollWidth <= el.clientWidth + 0.5 && el.getBoundingClientRect().height <= maxH + 0.5;
      if (fits) { best = mid; lo = mid; } else { hi = mid; }
    }
    el.style.fontSize = best + 'px';
    if (best <= min + 0.5) diags.push('Text "' + el.textContent.trim().slice(0, 40) + '" hit its minimum size — consider shortening it.');
  });
  var W = window.innerWidth, H = window.innerHeight;
  var safe = document.body.dataset;
  var st = parseFloat(safe.safeTop || 0), sb = parseFloat(safe.safeBottom || 0), ss = parseFloat(safe.safeSide || 0);
  document.querySelectorAll('[data-safe]').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.top < st - 1 || r.bottom > H - sb + 1 || r.left < ss - 1 || r.right > W - ss + 1) {
      diags.push('Element "' + (el.getAttribute('data-safe') || el.className) + '" extends outside the platform safe zone.');
    }
  });
  document.querySelectorAll('.nowrap-check').forEach(function (el) {
    if (el.scrollWidth > el.clientWidth + 1) diags.push('Text "' + el.textContent.trim().slice(0, 40) + '" is clipped horizontally.');
  });
  return diags;
};`;

export function page(input: TemplateInput, css: string, body: string): string {
  const p = input.profile.palette;
  const t = input.profile.typography;
  const f = input.format;
  const display = input.style.displayFont ?? t.display;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss()}
:root{
  --black:${p.black};--ink:${p.ink};--gold:${p.gold};--gold-light:${p.goldLight};--gold-deep:${p.goldDeep};
  --bronze:${p.bronze};--champagne:${p.champagne};--ivory:${p.ivory};
  --accent:${accentColor(input.profile, input.style.accent)};
  --display:'${display}','Barlow Condensed','Oswald',sans-serif;--display-weight:${t.displayWeight};
  --sans:'${t.secondary}','Montserrat','Inter',sans-serif;--sans-weight:${t.secondaryWeight};
  --serif:'${t.serif}','Cormorant Garamond',serif;
  --track:${t.trackingCaps};
  --W:${f.width}px;--H:${f.height}px;
  --safe-top:${f.safe.top}px;--safe-bottom:${f.safe.bottom}px;--safe-side:${f.safe.side}px;
  --u:${Math.min(f.width, f.height) / 100}px;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:var(--W);height:var(--H);overflow:hidden;background:var(--black);color:var(--ivory);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
body{position:relative;font-family:var(--sans)}
.abs{position:absolute;inset:0}
.photo{position:absolute;inset:0;overflow:hidden}
.photo img{width:100%;height:100%;display:block}
.photo .warm-wash{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 30%,rgba(235,214,165,.10),rgba(110,79,44,.18) 60%,rgba(0,0,0,.25));mix-blend-mode:soft-light}
.photo .duo-shadow{position:absolute;inset:0;background:linear-gradient(180deg,${p.goldDeep},${p.bronze});mix-blend-mode:multiply;opacity:.85}
.photo .duo-light{position:absolute;inset:0;background:linear-gradient(160deg,${p.goldLight},${p.gold});mix-blend-mode:screen;opacity:.18}
.vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 45%,rgba(0,0,0,.85) 100%)}
.grain{position:absolute;inset:-10%;pointer-events:none;background-image:url("data:image/svg+xml,${GRAIN_SVG}");background-size:300px 300px;mix-blend-mode:overlay}
.caps{text-transform:uppercase;letter-spacing:var(--track);font-family:var(--sans);font-weight:var(--sans-weight)}
.display{font-family:var(--display);font-weight:var(--display-weight);line-height:1;padding:.06em 0 .02em;text-transform:none;white-space:nowrap;overflow:visible}
.fit{display:block;width:100%}
.logo-fallback{font-family:var(--serif);font-weight:300;letter-spacing:.18em;line-height:1;text-indent:.18em}
.hair{height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.9}
.gold-text{background:linear-gradient(100deg,var(--bronze) 0%,var(--gold) 22%,var(--gold-light) 48%,var(--champagne) 60%,var(--gold) 80%,var(--bronze) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
${css}
</style></head>
<body data-safe-top="${f.safe.top}" data-safe-bottom="${f.safe.bottom}" data-safe-side="${f.safe.side}">
${body}
<script>${LAYOUT_JS}</script>
</body></html>`;
}

/** Atmosphere fallback when no background image exists: layered light that reads like haze in a dark gold room. */
export function proceduralAtmosphere(input: TemplateInput, intensity = 1): string {
  const p = input.profile.palette;
  return `<div class="abs" style="background:
    radial-gradient(60% 45% at 50% 18%, ${hexA(p.goldLight, 0.22 * intensity)}, transparent 70%),
    radial-gradient(40% 30% at 18% 70%, ${hexA(p.gold, 0.12 * intensity)}, transparent 70%),
    radial-gradient(45% 35% at 85% 60%, ${hexA(p.bronze, 0.28 * intensity)}, transparent 70%),
    linear-gradient(180deg, ${p.ink} 0%, ${p.black} 100%)"></div>
  <div class="abs" style="background:repeating-linear-gradient(100deg, ${hexA(p.goldLight, 0.035 * intensity)} 0 2px, transparent 2px 46px);mix-blend-mode:screen;mask-image:radial-gradient(70% 60% at 50% 20%,#000,transparent)"></div>`;
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

/** Common bottom-of-flyer info block fields */
export const COMMON_FIELDS: EditableField[] = [
  { key: "eyebrow", label: "Eyebrow (small line above name)", multiline: false, help: "e.g. WYNN NIGHTLIFE PRESENTS · RESIDENT · GRAND REOPENING" },
  { key: "artist", label: "Artist / headline", multiline: false },
  { key: "support", label: "Support line", multiline: false, help: "e.g. B2B HUGEL · WITH SPECIAL GUEST …" },
  { key: "dateLine", label: "Date line", multiline: false, help: "e.g. SATURDAY, NOVEMBER 15" },
  { key: "venueLine", label: "Venue line", multiline: false, help: "e.g. XS NIGHTCLUB · WYNN LAS VEGAS" },
  { key: "cta", label: "Call to action", multiline: false, help: "e.g. TABLES & TICKETS · XSLASVEGAS.COM" },
  { key: "finePrint", label: "Fine print", multiline: false },
];
