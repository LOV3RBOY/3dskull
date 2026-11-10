/**
 * XS 2026 design system — reverse-engineered from real @xslasvegas posts (Nov 2026):
 *  - Headliner (Marshmello / Kaskade): red-orange light-trail field, artist hero centred,
 *    XS mark top-left + Wynn Nightlife top-right, artist name full-width in champagne,
 *    "XS LAS VEGAS" / "SAT. NOV 14" row, boxed "TICKETS:" + WYNNNIGHTLIFE.COM + year footer.
 *  - Campaign (Opening Weekend): motion-blurred silhouette in vermilion, giant jade campaign
 *    words bleeding off top/bottom, serif lockup, condensed cream billing, logo pair, ticket line.
 *  - Feature (Franky Rizardo): photo-led, italic heavy cream name with orange glow, kicker,
 *    italic info block, logo lockup top-centre.
 * Measurements are taken from the 1080-wide originals and expressed relative to W/H.
 */
import {
  type EditableField,
  type TemplateDef,
  type TemplateInput,
  esc,
  escLines,
  fileUrl,
  hexA,
  isTall,
  page,
} from "./base.js";

const px = (n: number) => `${Math.round(n * 10) / 10}px`;

export const XS26 = {
  vermilion: "#B8391C",
  ember: "#E5591F",
  deepRed: "#5E1309",
  night: "#0D0403",
  trail: "#FF8A3A",
  trailHot: "#FFC27A",
  champagne: "#C8B28C",
  champagneLight: "#D2BE9A",
  champagneDeep: "#BBA27C",
  cream: "#EEE5D6",
  jade: "#3EA58B",
  ticketRed: "#D63F2A",
  glowOrange: "#F58A4E",
};

// ── deterministic PRNG so the same seed always gives the same light trails ──
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Long-exposure light-painting field: red-orange core, glowing orange trails, crushed edges. */
export function lightTrailField(W: number, H: number, seed = 7): string {
  const r = rng(seed);
  const trails: string[] = [];
  const n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const fromLeft = r() > 0.5;
    const y0 = H * (0.08 + r() * 0.62);
    const y3 = H * (0.08 + r() * 0.62);
    const x0 = fromLeft ? -W * 0.2 : W * 1.2;
    const x3 = fromLeft ? W * 1.2 : -W * 0.2;
    const c1x = W * (0.15 + r() * 0.7);
    const c2x = W * (0.15 + r() * 0.7);
    const c1y = y0 + (r() - 0.5) * H * 0.7;
    const c2y = y3 + (r() - 0.5) * H * 0.7;
    const w = W * (0.006 + r() * 0.016);
    const op = 0.35 + r() * 0.5;
    const d = `M${x0.toFixed(0)},${y0.toFixed(0)} C${c1x.toFixed(0)},${c1y.toFixed(0)} ${c2x.toFixed(0)},${c2y.toFixed(0)} ${x3.toFixed(0)},${y3.toFixed(0)}`;
    trails.push(
      `<path d="${d}" stroke="${XS26.ember}" stroke-width="${(w * 5).toFixed(1)}" fill="none" opacity="${(op * 0.45).toFixed(2)}" filter="url(#glowWide)"/>` +
        `<path d="${d}" stroke="${XS26.trail}" stroke-width="${(w * 1.6).toFixed(1)}" fill="none" opacity="${op.toFixed(2)}" filter="url(#glow)"/>` +
        `<path d="${d}" stroke="${XS26.trailHot}" stroke-width="${(w * 0.45).toFixed(1)}" fill="none" opacity="${(op * 0.8).toFixed(2)}" filter="url(#soft)"/>`,
    );
  }
  return `<svg class="abs" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="core" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="${XS26.vermilion}"/><stop offset=".45" stop-color="#8E2412"/><stop offset=".8" stop-color="${XS26.deepRed}"/><stop offset="1" stop-color="#2A0704"/>
    </radialGradient>
    <filter id="glowWide" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(W * 0.03).toFixed(1)}"/></filter>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(W * 0.006).toFixed(1)}"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(W * 0.0018).toFixed(1)}"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#core)"/>
  <g style="mix-blend-mode:screen">${trails.join("")}</g>
</svg>`;
}

/** Warm cinematic grade + halation for real photography (the people stay untouched apart from colour). */
function gradedPhoto(path: string, opts: { fit: string; pos: string; zoom?: number; style?: string; mask?: string; cutout?: boolean }) {
  const filter = "contrast(1.06) saturate(1.08) sepia(.12) hue-rotate(-6deg) brightness(.97)";
  const z = opts.zoom ?? 1;
  const common = `object-fit:${opts.fit};object-position:${opts.pos};transform:scale(${z});transform-origin:50% 100%`;
  const mask = opts.mask ? `-webkit-mask-image:${opts.mask};mask-image:${opts.mask};` : "";
  return `<div class="abs" style="${mask}${opts.style ?? ""}">
    <img src="${fileUrl(path)}" style="position:absolute;inset:0;width:100%;height:100%;${common};filter:${filter}">
    <img src="${fileUrl(path)}" style="position:absolute;inset:0;width:100%;height:100%;${common};filter:${filter} blur(14px);mix-blend-mode:screen;opacity:.22">
    ${opts.cutout ? "" : `<div class="abs" style="background:radial-gradient(90% 70% at 50% 35%,rgba(255,120,50,.10),rgba(120,20,5,.25));mix-blend-mode:soft-light"></div>`}
  </div>`;
}

/** Strong film grain like the originals (visible at 100%). */
function grain(opacity = 0.42) {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );
  return `<div class="abs" style="pointer-events:none;background-image:url(&quot;data:image/svg+xml,${svg}&quot;);background-size:260px 260px;mix-blend-mode:overlay;opacity:${opacity}"></div>`;
}

function xsMark(input: TemplateInput, h: number, color = "#FFFFFF") {
  if (input.images.logo) return `<img src="${fileUrl(input.images.logo)}" style="height:${px(h)};width:auto;display:block">`;
  return `<div style="font:italic 400 ${px(h * 0.9)}/1 Gloock;color:${color};letter-spacing:-.04em;transform:skewX(-12deg)">XS</div>`;
}

function wynnMark(input: TemplateInput, h: number, color = "#FFFFFF") {
  if (input.images.wynnLogo) return `<img src="${fileUrl(input.images.wynnLogo)}" style="height:${px(h)};width:auto;display:block">`;
  return `<div style="color:${color};text-align:right;line-height:1"><div style="font:italic 400 ${px(h * 0.5)} Gloock">Wynn</div><div style="font:500 ${px(h * 0.17)} 'Nunito Sans';letter-spacing:.12em">NIGHTLIFE</div><div style="font:500 ${px(h * 0.12)} 'Nunito Sans';letter-spacing:.12em">LAS VEGAS</div></div>`;
}

/** Artist name: their own logotype if uploaded (tinted champagne), else typeset full-width. */
function artistName(input: TemplateInput, o: { width: number; maxSize: number; minSize: number; color: string; font: string; maxHeight: number; letterSpacing?: string; gradient?: boolean; align?: string; extra?: string }) {
  if (input.images.artistLogo) {
    const url = fileUrl(input.images.artistLogo);
    // Use the logotype as a mask so it takes the house colour exactly.
    return `<div style="width:${px(o.width)};height:${px(o.maxHeight)};background:${o.gradient ? `linear-gradient(180deg,${XS26.champagneLight},${o.color} 55%,${XS26.champagneDeep})` : o.color};-webkit-mask:url('${url}') ${o.align === "center" ? "center" : "left"} bottom/contain no-repeat;mask:url('${url}') ${o.align === "center" ? "center" : "left"} bottom/contain no-repeat"></div>`;
  }
  const fill = o.gradient
    ? `background:linear-gradient(180deg,${XS26.champagneLight} 0%,${o.color} 50%,${XS26.champagneDeep} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;`
    : `color:${o.color};`;
  return `<div class="fit" data-fit data-max="${o.maxSize}" data-min="${o.minSize}" data-maxh="${o.maxHeight}" data-safe="artist name"
    style="width:${px(o.width)};white-space:nowrap;font:${o.font};line-height:.9;letter-spacing:${o.letterSpacing ?? "-0.01em"};text-align:${o.align ?? "left"};${fill}${o.extra ?? ""}">${escLines(input.fields.artist)}</div>`;
}

// ═══════════════════════════════ HEADLINER ═══════════════════════════════
const HEADLINER_FIELDS: EditableField[] = [
  { key: "artist", label: "Artist", multiline: false, help: "Canonical styling. If the artist's logotype is uploaded (Assets → artist_logo) it is used instead." },
  { key: "venueLine", label: "Venue (left)", multiline: false, help: "XS LAS VEGAS" },
  { key: "dateLine", label: "Date (right)", multiline: false, help: "SAT. NOV 14" },
  { key: "ctaLabel", label: "CTA box", multiline: false, help: "TICKETS:" },
  { key: "ctaUrl", label: "CTA URL", multiline: false, help: "WYNNNIGHTLIFE.COM" },
  { key: "year", label: "Year", multiline: false, help: "2026" },
];

export const xs26Headliner: TemplateDef = {
  id: "xs26_headliner",
  name: "2026 Headliner (light trails)",
  description:
    "THE current XS single-artist flyer (matches the Marshmello / Kaskade posts). Red-orange long-exposure light-trail field, artist hero centred (cut-out ideal; a regular press photo is masked into the field), XS mark top-left, Wynn Nightlife top-right, artist name spanning the full width in champagne (or the artist's own logotype when uploaded), 'XS LAS VEGAS' left + 'SAT. NOV 14' right in heavy white, footer: red-boxed 'TICKETS:' + WYNNNIGHTLIFE.COM, year at right. Use for every regular artist night, feed and story.",
  kinds: ["flyer", "story"],
  fields: HEADLINER_FIELDS,
  images: { background: "optional", artist: "required", prefersCutout: true },
  supportsArtistLogo: true,
  usesWynnLogo: true,
  render(input) {
    const { format } = input;
    const W = format.width;
    const H = format.height;
    const tall = isTall(format);
    const s = W / 1080; // all measurements from the 1080-wide originals
    const f = input.fields;
    // Vertical rhythm measured from the posts (feed vs story).
    const footerY = tall ? H - 240 * s : H - 72 * s; // centre line of footer
    const rowBase = footerY - 78 * s; // baseline of XS LAS VEGAS / date row
    const nameBottom = rowBase - 62 * s;
    const logoTop = tall ? 160 * s : 62 * s;
    const sideL = 58 * s;
    const sideR = 52 * s;
    const art = input.images.artist;
    const cut = !!input.images.artistIsCutout;
    const figureTop = tall ? 175 * s : 60 * s;
    const zoom = input.style.zoom ?? 1;
    const hero = art
      ? cut
        ? `<img src="${fileUrl(art)}" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%) scale(${zoom});transform-origin:50% 100%;height:${px(H - figureTop)};width:auto;max-width:none;filter:contrast(1.05) saturate(1.05) sepia(.1) hue-rotate(-5deg) drop-shadow(0 0 ${px(40 * s)} rgba(255,110,40,.25))">`
        : gradedPhoto(art, { fit: "cover", pos: input.style.focus ?? "50% 25%", zoom, mask: "radial-gradient(75% 60% at 50% 42%,#000 55%,transparent 100%)" })
      : "";
    return page(
      input,
      `.row{position:absolute;left:${px(sideL)};right:${px(sideR)};display:flex;justify-content:space-between;align-items:baseline;font:800 ${px(50 * s)}/1 Montserrat;letter-spacing:-.025em;color:${XS26.cream}}`,
      `${input.images.background ? gradedPhoto(input.images.background, { fit: "cover", pos: "50% 50%" }) : lightTrailField(W, H, input.style.seed ?? 7)}
      ${hero}
      <div class="abs" style="background:linear-gradient(180deg,rgba(13,4,3,.55) 0%,rgba(13,4,3,0) 16%,rgba(13,4,3,0) ${tall ? 52 : 58}%,rgba(13,4,3,.72) ${tall ? 70 : 76}%,${XS26.night} ${tall ? 84 : 94}%)"></div>
      <div class="abs" style="background:radial-gradient(120% 90% at 50% 40%,transparent 55%,rgba(10,2,1,.55) 100%)"></div>
      <div data-safe="xs logo" style="position:absolute;left:${px(sideL)};top:${px(logoTop)}">${xsMark(input, 100 * s)}</div>
      <div data-safe="wynn logo" style="position:absolute;right:${px(sideR)};top:${px(logoTop + 12 * s)}">${wynnMark(input, 76 * s)}</div>
      <div style="position:absolute;left:${px(sideL - 4 * s)};bottom:${px(H - nameBottom)}">${artistName(input, {
        width: W - sideL - sideR + 4 * s,
        maxSize: 300 * s,
        minSize: 60 * s,
        maxHeight: 230 * s,
        color: XS26.champagne,
        font: `800 ${px(140 * s)} Montserrat`,
        gradient: true,
      })}</div>
      <div class="row" data-safe="venue/date row" style="top:${px(rowBase - 38 * s)}"><span>${esc(f.venueLine)}</span><span>${esc(f.dateLine)}</span></div>
      <div data-safe="footer" style="position:absolute;left:${px(sideL + 4 * s)};right:${px(sideR + 4 * s)};top:${px(footerY - 13 * s)};display:flex;align-items:center;justify-content:space-between;color:${XS26.cream};font:400 ${px(19 * s)}/1 Syncopate">
        <div style="display:flex;align-items:center;gap:${px(11 * s)}">
          ${f.ctaLabel ? `<span style="border:${px(2 * s)} solid ${XS26.ticketRed};padding:${px(3 * s)} ${px(5 * s)} ${px(2 * s)};font-weight:700">${esc(f.ctaLabel)}</span>` : ""}
          <span>${esc(f.ctaUrl)}</span>
        </div>
        <span style="font-weight:700;font-size:${px(16 * s)}">${esc(f.year)}</span>
      </div>
      ${grain(0.45)}`,
    );
  },
};

// ═══════════════════════════════ CAMPAIGN ═══════════════════════════════
const CAMPAIGN_FIELDS: EditableField[] = [
  { key: "bigTop", label: "Giant word (top)", multiline: false, help: "OPENING" },
  { key: "bigBottom", label: "Giant word (bottom)", multiline: false, help: "WEEKEND" },
  { key: "pill", label: "Pill label", multiline: false, help: "XS LAS VEGAS" },
  { key: "yearMark", label: "Year mark", multiline: false, help: "‘26" },
  { key: "campaignTitle", label: "Campaign title (serif)", multiline: false, help: "OPENING" },
  { key: "campaignSub", label: "Campaign subtitle", multiline: false, help: "WEEKEND LINEUP" },
  { key: "artist", label: "Artist billing", multiline: false, help: "DIPLO B2B HUGEL (B2B is set smaller automatically)" },
  { key: "dateLine", label: "Date", multiline: false, help: "SATURDAY,  NOVEMBER 7" },
  { key: "ctaLine1", label: "Ticket line 1", multiline: false, help: "TICKETS AND TABLE RESERVATIONS AT" },
  { key: "ctaLine2", label: "Ticket line 2", multiline: false, help: "WYNNNIGHTLIFE.COM" },
];

/** Procedural stand-in for the motion-blurred silhouette when no campaign photo is supplied. */
function blurredSilhouette(W: number, H: number) {
  const fig = (dx: number, op: number) =>
    `<g transform="translate(${dx},0)" opacity="${op}"><ellipse cx="${W * 0.46}" cy="${H * 0.13}" rx="${W * 0.13}" ry="${H * 0.085}"/><path d="M${W * 0.12},${H * 1.02} C${W * 0.14},${H * 0.5} ${W * 0.24},${H * 0.26} ${W * 0.46},${H * 0.23} C${W * 0.72},${H * 0.26} ${W * 0.88},${H * 0.45} ${W * 0.94},${H * 1.02} Z"/><path d="M${W * 0.62},${H * 0.36} C${W * 0.82},${H * 0.4} ${W * 0.95},${H * 0.55} ${W * 0.98},${H * 0.75} L${W * 0.86},${H * 0.78} C${W * 0.83},${H * 0.6} ${W * 0.74},${H * 0.48} ${W * 0.6},${H * 0.44} Z"/></g>`;
  return `<svg class="abs" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C8301B"/><stop offset=".5" stop-color="#E4561F"/><stop offset="1" stop-color="#C23A18"/></linearGradient>
      <filter id="mb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${W * 0.035} ${W * 0.02}"/></filter>
      <filter id="mb2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${W * 0.08} ${W * 0.03}"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <g fill="#0F0302" filter="url(#mb2)">${fig(-W * 0.12, 0.35)}${fig(W * 0.1, 0.3)}</g>
    <g fill="#0B0201" filter="url(#mb)">${fig(0, 0.92)}</g>
  </svg>`;
}

/** Real photo → motion-blurred vermilion gradient map (people become abstract silhouettes). */
function campaignPhoto(path: string, W: number) {
  return `<svg width="0" height="0" style="position:absolute"><filter id="gmap" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.04 0.30 0.78 0.93 0.98"/>
        <feFuncG type="table" tableValues="0.01 0.05 0.19 0.38 0.55"/>
        <feFuncB type="table" tableValues="0.01 0.02 0.07 0.12 0.20"/>
      </feComponentTransfer>
    </filter></svg>
    <div class="abs" style="filter:url(#gmap) blur(${px(W * 0.012)})">
      <img src="${fileUrl(path)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:contrast(1.35)">
      <img src="${fileUrl(path)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.45;transform:translateX(${px(W * 0.04)});filter:contrast(1.35)">
      <img src="${fileUrl(path)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.3;transform:translateX(${px(-W * 0.05)});filter:contrast(1.35)">
    </div>`;
}

function billing(artist: string, size: number) {
  // Set qualifiers (B2B, [DJ SET]) the way the posts do: B2B smaller, brackets thin.
  return esc(artist)
    .replace(/\s+B2B\s+/gi, ` <span style="font-size:${px(size * 0.5)};vertical-align:${px(size * 0.22)};margin:0 ${px(size * 0.08)}">B2B</span> `)
    .replace(/\s*\[(.+?)\]/g, ` <span style="font-weight:300">[</span>$1<span style="font-weight:300">]</span>`);
}

export const xs26Campaign: TemplateDef = {
  id: "xs26_campaign",
  name: "2026 Campaign (Opening Weekend system)",
  description:
    "The campaign series look (matches the '26 Opening Weekend lineup posts): motion-blurred dark silhouette over a saturated vermilion/orange field (procedural, or any photo turned into an abstract gradient-mapped silhouette), giant jade campaign words bleeding off the top and bottom edges, centred lockup (cream 'XS LAS VEGAS' pill + serif year mark, serif campaign title, bold subtitle), artist billing in condensed cream caps, full date 'SATURDAY,  NOVEMBER 7', XS + Wynn Nightlife logos, 'TICKETS AND TABLE RESERVATIONS AT / WYNNNIGHTLIFE.COM'. Use for multi-night campaigns (opening/closing weekends, NYE run, holiday weekends, F1 week) — one post per night.",
  kinds: ["flyer", "story", "announcement"],
  fields: CAMPAIGN_FIELDS,
  images: { background: "optional", artist: "none" },
  usesWynnLogo: true,
  render(input) {
    const { format } = input;
    const W = format.width;
    const H = format.height;
    const tall = isTall(format);
    const s = W / 1080;
    const f = input.fields;
    const cream = XS26.cream;
    // Measured from 1080×1920 story and 4:5 feed originals.
    const lockTop = tall ? 405 * s : 322 * s;
    const nameY = tall ? 0.505 * H : 0.525 * H;
    const nameSize = tall ? 128 * s : 132 * s;
    const bigTopBottom = tall ? 0.102 * H : 0.118 * H; // y where the top word's glyphs end
    const bigBottomTop = tall ? 0.905 * H : 0.884 * H; // y where the bottom word's glyphs start
    return page(
      input,
      `.big{position:absolute;left:${px(56 * s)};right:${px(56 * s)};width:auto;text-align:center;font:400 ${px(380 * s)}/0.78 Anton;color:${XS26.jade};letter-spacing:-.005em;white-space:nowrap;overflow:visible;padding:0}
       .glow{text-shadow:0 0 ${px(14 * s)} rgba(255,190,140,.55)}`,
      `${input.images.background ? campaignPhoto(input.images.background, W) : blurredSilhouette(W, H)}
      ${f.bigTop ? `<div class="big fit" data-fit data-max="${520 * s}" data-min="${120 * s}" style="bottom:${px(H - bigTopBottom)}">${esc(f.bigTop)}</div>` : ""}
      ${f.bigBottom ? `<div class="big fit" data-fit data-max="${520 * s}" data-min="${120 * s}" style="top:${px(bigBottomTop)}">${esc(f.bigBottom)}</div>` : ""}
      <div style="position:absolute;left:0;right:0;top:${px(lockTop)};display:flex;flex-direction:column;align-items:center;color:${cream}">
        <div style="display:flex;align-items:flex-end;gap:${px(6 * s)};height:${px(92 * s)}">
          ${f.pill ? `<span style="background:${cream};color:#2B0C07;font:800 ${px(25 * s)}/1 Montserrat;letter-spacing:-.02em;padding:${px(5 * s)} ${px(8 * s)};border-radius:${px(7 * s)};margin-bottom:${px(6 * s)}">${esc(f.pill)}</span>` : ""}
          ${f.yearMark ? `<span style="font:400 ${px(112 * s)}/0.8 Gloock;letter-spacing:-.02em;transform:scaleX(1.12);transform-origin:left bottom;display:inline-block">${esc(f.yearMark)}</span>` : ""}
        </div>
        ${f.campaignTitle ? `<div style="font:400 ${px(116 * s)}/0.86 Gloock;letter-spacing:-.01em;transform:scaleX(1.22);margin-top:${px(2 * s)}">${esc(f.campaignTitle)}</div>` : ""}
        ${f.campaignSub ? `<div style="font:800 ${px(36 * s)}/1 Montserrat;letter-spacing:-.025em;margin-top:${px(8 * s)}">${esc(f.campaignSub)}</div>` : ""}
      </div>
      <div style="position:absolute;left:${px(40 * s)};right:${px(40 * s)};top:${px(nameY - nameSize * 0.55)};display:flex;flex-direction:column;align-items:center">
        <div class="fit" data-fit data-max="${nameSize * 1.7}" data-min="${nameSize * 0.4}" data-maxh="${nameSize * 1.5}" data-safe="artist billing" style="width:100%;text-align:center;white-space:nowrap;font:700 ${px(nameSize)}/1 'Roboto Condensed';letter-spacing:-.012em;color:${cream}">${billing(f.artist ?? "", nameSize)}</div>
        ${f.dateLine ? `<div style="white-space:pre;font:700 ${px(44 * s)}/1 'Roboto Condensed';letter-spacing:.02em;color:${cream};margin-top:${px(14 * s)}">${esc(f.dateLine)}</div>` : ""}
      </div>
      ${
        tall
          ? `<div data-safe="logos" style="position:absolute;left:0;right:0;top:${px(1290 * s)};display:flex;justify-content:center;align-items:center;gap:${px(34 * s)}">${xsMark(input, 92 * s, cream)}${wynnMark(input, 84 * s, cream)}</div>
             <div class="glow" style="position:absolute;left:0;right:0;top:${px(1462 * s)};text-align:center;color:${cream};font:800 ${px(29 * s)}/1.25 Montserrat;letter-spacing:-.01em">${esc(f.ctaLine1)}<br>${esc(f.ctaLine2)}</div>`
          : `<div data-safe="xs logo" style="position:absolute;left:${px(70 * s)};top:${px(1018 * s)}">${xsMark(input, 72 * s, cream)}</div>
             <div data-safe="wynn logo" style="position:absolute;right:${px(56 * s)};top:${px(1026 * s)}">${wynnMark(input, 64 * s, cream)}</div>
             <div class="glow" style="position:absolute;left:0;right:0;top:${px(1044 * s)};text-align:center;color:${cream};font:800 ${px(20 * s)}/1.3 Montserrat;letter-spacing:-.01em">${esc(f.ctaLine1)}<br>${esc(f.ctaLine2)}</div>`
      }
      ${grain(0.5)}`,
    );
  },
};

// ═══════════════════════════════ FEATURE ═══════════════════════════════
const FEATURE_FIELDS: EditableField[] = [
  { key: "kicker", label: "Kicker", multiline: true, help: "FOR THE\nFIRST TIME" },
  { key: "artist", label: "Artist (line break allowed)", multiline: true, help: "FRANKY\nRIZARDO" },
  { key: "infoLines", label: "Info lines", multiline: true, help: "Wednesday, November 18, 2026\nXS Las Vegas | 3131 Las Vegas Blvd S\nDoors 10PM | 21+ | wynnnightlife.com" },
];

export const xs26Feature: TemplateDef = {
  id: "xs26_feature",
  name: "2026 Feature (debut / special)",
  description:
    "Photo-led special announcement (matches the Franky Rizardo 'FOR THE FIRST TIME' post): full-bleed artist photo graded deep red with orange speed-light accents, XS | Wynn Nightlife lockup top-centre, glowing orange italic kicker, artist name in heavy italic cream with orange glow on a slight upward angle, italic orange info block (date with year · XS Las Vegas | 3131 Las Vegas Blvd S · Doors | 21+ | wynnnightlife.com). Use for XS debuts, one-off specials, surprise sets.",
  kinds: ["flyer", "announcement", "story"],
  fields: FEATURE_FIELDS,
  images: { background: "optional", artist: "required" },
  usesWynnLogo: true,
  render(input) {
    const { format } = input;
    const W = format.width;
    const H = format.height;
    const tall = isTall(format);
    const s = W / 1080;
    const f = input.fields;
    const art = input.images.artist ?? input.images.background;
    const top = tall ? 170 * s : 70 * s;
    const blockTop = tall ? H * 0.5 : H * 0.52;
    return page(
      input,
      `.glowtext{text-shadow:0 0 ${px(10 * s)} rgba(255,120,60,.9),0 0 ${px(28 * s)} rgba(255,90,30,.6)}`,
      `${lightTrailField(W, H, input.style.seed ?? 11)}
      ${art ? gradedPhoto(art, { fit: "cover", pos: input.style.focus ?? "50% 25%", zoom: input.style.zoom, mask: "linear-gradient(180deg,#000 60%,transparent 98%)" }) : ""}
      <div class="abs" style="background:linear-gradient(180deg,rgba(10,2,1,.55) 0%,rgba(10,2,1,0) 20%,rgba(10,2,1,0) 45%,rgba(30,4,2,.55) 75%,rgba(10,2,1,.85) 100%)"></div>
      <div class="abs" style="background:${XS26.vermilion};mix-blend-mode:color;opacity:.32"></div>
      <div data-safe="logos" style="position:absolute;left:0;right:0;top:${px(top)};display:flex;justify-content:center;align-items:center;gap:${px(16 * s)}">
        ${xsMark(input, 86 * s, XS26.cream)}<div style="width:1px;height:${px(80 * s)};background:${XS26.cream};opacity:.8"></div>${wynnMark(input, 66 * s, XS26.cream)}
      </div>
      <div style="position:absolute;left:${px(110 * s)};right:${px(80 * s)};top:${px(blockTop)};transform:rotate(-4deg);transform-origin:left top">
        ${f.kicker ? `<div class="glowtext" style="font:italic 900 ${px(50 * s)}/0.95 Archivo;font-stretch:105%;color:${XS26.glowOrange};letter-spacing:-.02em;margin-bottom:${px(18 * s)}">${escLines(f.kicker)}</div>` : ""}
        <div class="glowtext fit" data-fit data-max="${170 * s}" data-min="${70 * s}" data-maxh="${380 * s}" style="width:100%;white-space:nowrap;font:italic 900 ${px(150 * s)}/0.9 Archivo;font-stretch:108%;color:#F6E9DB;letter-spacing:-.025em">${escLines(f.artist)}</div>
        ${f.infoLines ? `<div class="glowtext" style="text-align:right;margin-top:${px(26 * s)};padding-right:${px(10 * s)};font:italic 600 ${px(30 * s)}/1.2 Archivo;color:${XS26.glowOrange};letter-spacing:-.01em">${escLines(f.infoLines).replace(/^([^<]*)/, `<span style="font-size:${px(34 * s)}">$1</span>`)}</div>` : ""}
      </div>
      ${grain(0.4)}`,
    );
  },
};

// ═══════════════════════════════ LINEUP (2026 style) ═══════════════════════════════
const LINEUP26_FIELDS: EditableField[] = [
  { key: "title", label: "Title", multiline: false, help: "THIS WEEKEND" },
  { key: "rows", label: "Rows (DATE | ARTIST per line)", multiline: true, help: "FRI. NOV 13 | KASKADE\nSAT. NOV 14 | MARSHMELLO" },
  { key: "ctaLabel", label: "CTA box", multiline: false, help: "TICKETS:" },
  { key: "ctaUrl", label: "CTA URL", multiline: false, help: "WYNNNIGHTLIFE.COM" },
  { key: "year", label: "Year", multiline: false, help: "2026" },
];

export const xs26Lineup: TemplateDef = {
  id: "xs26_lineup",
  name: "2026 Lineup (week / weekend)",
  description:
    "Weekly/weekend schedule in the 2026 headliner language: light-trail field, XS + Wynn Nightlife marks, title in champagne Montserrat ExtraBold, rows of 'FRI. NOV 13' + artist in heavy cream with thin hairlines, boxed TICKETS footer. 1–7 rows.",
  kinds: ["lineup", "story"],
  fields: LINEUP26_FIELDS,
  images: { background: "optional", artist: "none" },
  usesWynnLogo: true,
  render(input) {
    const { format } = input;
    const W = format.width;
    const H = format.height;
    const tall = isTall(format);
    const s = W / 1080;
    const f = input.fields;
    const rows = (f.rows ?? "")
      .split("\n")
      .map((r) => r.split("|").map((c) => c.trim()))
      .filter((r) => r[0] || r[1]);
    const footerY = tall ? H - 240 * s : H - 72 * s;
    const top = tall ? 330 * s : 200 * s;
    const listTop = top + 120 * s;
    const area = footerY - 70 * s - listTop;
    const block = Math.min(260 * s, area / Math.max(rows.length, 1));
    const nameMax = Math.min(block * 0.62, 170 * s);
    const listOffset = listTop + Math.max(0, (area - block * Math.max(rows.length, 1)) / 2.2);
    return page(
      input,
      `.b{display:flex;flex-direction:column;justify-content:center;height:${px(block)}}`,
      `${input.images.background ? gradedPhoto(input.images.background, { fit: "cover", pos: "50% 50%" }) + `<div class="abs" style="background:rgba(13,4,3,.55)"></div>` : lightTrailField(W, H, input.style.seed ?? 5)}
      <div class="abs" style="background:linear-gradient(180deg,rgba(13,4,3,.45),rgba(13,4,3,.25) 30%,rgba(13,4,3,.55) 75%,${XS26.night})"></div>
      <div style="position:absolute;left:${px(58 * s)};top:${px(tall ? 160 * s : 62 * s)}">${xsMark(input, 100 * s)}</div>
      <div style="position:absolute;right:${px(52 * s)};top:${px((tall ? 160 : 62) * s + 12 * s)}">${wynnMark(input, 76 * s)}</div>
      <div style="position:absolute;left:${px(58 * s)};right:${px(52 * s)};top:${px(top)};font:800 ${px(50 * s)}/1 Montserrat;letter-spacing:-.025em;color:${XS26.cream}">${esc(f.title)}</div>
      <div data-safe="rows" style="position:absolute;left:${px(54 * s)};right:${px(52 * s)};top:${px(listOffset)}">
        ${rows
          .map(
            (r) => `<div class="b"><div style="font:800 ${px(38 * s)}/1 Montserrat;letter-spacing:-.02em;color:${XS26.cream};margin-bottom:${px(8 * s)}">${esc(r[0])}</div>
            <div class="fit" data-fit data-max="${nameMax}" data-min="${40 * s}" style="width:100%;white-space:nowrap;font:800 ${px(nameMax)}/0.9 Montserrat;letter-spacing:-.015em;background:linear-gradient(180deg,${XS26.champagneLight},${XS26.champagne} 50%,${XS26.champagneDeep});-webkit-background-clip:text;background-clip:text;color:transparent">${esc(r[1])}</div></div>`,
          )
          .join("")}
      </div>
      <div style="position:absolute;left:${px(62 * s)};right:${px(56 * s)};top:${px(footerY - 13 * s)};display:flex;align-items:center;justify-content:space-between;color:${XS26.cream};font:400 ${px(19 * s)}/1 Syncopate">
        <div style="display:flex;align-items:center;gap:${px(11 * s)}">${f.ctaLabel ? `<span style="border:${px(2 * s)} solid ${XS26.ticketRed};padding:${px(3 * s)} ${px(5 * s)} ${px(2 * s)};font-weight:700">${esc(f.ctaLabel)}</span>` : ""}<span>${esc(f.ctaUrl)}</span></div>
        <span style="font-weight:700;font-size:${px(14 * s)}">${esc(f.year)}</span>
      </div>
      ${grain(0.45)}`,
    );
  },
};

export const XS26_TEMPLATES = [xs26Headliner, xs26Campaign, xs26Feature, xs26Lineup];
export { hexA };
