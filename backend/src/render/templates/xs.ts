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

// ───────────────────────── 1. HEADLINER (full-bleed photo) ─────────────────────────
export const headliner: TemplateDef = {
  id: "xs_headliner",
  name: "Headliner — full-bleed",
  description:
    "Full-bleed artist press photo, warm/noir grade, deep type-protection fade, symmetric stack: logo top, artist name huge, date + venue, CTA/fine print. The workhorse single-artist flyer.",
  kinds: ["flyer", "story", "announcement"],
  fields: COMMON_FIELDS,
  images: { background: "optional", artist: "required" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const shade = input.style.shade ?? 0.85;
    const land = isLandscape(format);
    const tall = isTall(format);
    const photo = input.images.artist ?? input.images.background;
    if (land) {
      return page(
        input,
        `.name{color:var(--ivory)}`,
        `${photo ? photoLayer(photo, input, { extraStyle: "left:42%" }) : proceduralAtmosphere(input)}
        <div class="abs" style="background:linear-gradient(90deg,var(--black) 0%,var(--black) 40%,${hexA(input.profile.palette.black, 0.0)} 62%)"></div>
        ${finishLayers(input, 0.45)}
        <div style="position:absolute;left:var(--safe-side);top:var(--safe-top);">${logoHtml(input, px(H * 0.075))}</div>
        <div style="position:absolute;left:var(--safe-side);width:44%;top:50%;transform:translateY(-45%)">${infoStack(input, { nameMax: T * 0.2, align: "left" })}</div>
        <div style="position:absolute;left:var(--safe-side);bottom:var(--safe-bottom);width:44%;text-align:left">
          ${input.fields.cta ? `<div class="caps" style="font-size:${px(T * 0.017)};letter-spacing:.3em">${esc(input.fields.cta)}</div>` : ""}
          ${input.fields.finePrint ? `<div class="caps" style="margin-top:${px(H * 0.01)};font-size:${px(T * 0.012)};letter-spacing:.2em;opacity:.55">${esc(input.fields.finePrint)}</div>` : ""}
        </div>`,
      );
    }
    const infoBottom = tall ? format.safe.bottom + H * 0.07 : format.safe.bottom + H * 0.075;
    return page(
      input,
      `.name{color:var(--ivory);text-shadow:0 0 ${px(H * 0.03)} rgba(0,0,0,.35)}`,
      `${photo ? photoLayer(photo, input) : proceduralAtmosphere(input)}
      <div class="abs" style="background:linear-gradient(180deg,rgba(0,0,0,${(shade * 0.55).toFixed(2)}) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 42%,rgba(0,0,0,${(shade * 0.9).toFixed(2)}) 72%,var(--black) 100%)"></div>
      ${finishLayers(input)}
      ${topLogo(input)}
      <div style="position:absolute;left:var(--safe-side);right:var(--safe-side);bottom:${px(infoBottom)}">${infoStack(input, { nameMax: T * 0.13 })}</div>
      ${footer(input)}`,
    );
  },
};

// ───────────────────────── 2. CUTOUT (subject over atmosphere) ─────────────────────────
export const cutout: TemplateDef = {
  id: "xs_cutout",
  name: "Hero cut-out over atmosphere",
  description:
    "Transparent artist cut-out standing in front of a dark gold atmosphere plate with a warm rim glow; the artist name sits large BEHIND the figure for depth, info stack below. Needs an artist_cutout asset (PNG with alpha).",
  kinds: ["flyer", "story", "announcement"],
  fields: COMMON_FIELDS,
  images: { background: "optional", artist: "required", prefersCutout: true },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const W = format.width;
    const tall = isTall(format);
    const land = isLandscape(format);
    const bg = input.images.background;
    const art = input.images.artist;
    const mood = input.style.mood ?? "noir";
    const figureH = land ? H * 0.92 : tall ? H * 0.58 : H * 0.66;
    const figureBottom = land ? 0 : tall ? H * 0.3 : H * 0.235;
    const nameTop = land ? H * 0.2 : tall ? H * 0.2 : H * 0.17;
    const figLeft = land ? "62%" : "50%";
    return page(
      input,
      `.ghost{color:transparent;-webkit-text-stroke:1.5px ${hexA(input.profile.palette.champagne, 0.55)};}
       .figure{position:absolute;bottom:${px(figureBottom)};left:${figLeft};transform:translateX(-50%);height:${px(figureH)};width:auto;filter:${moodFilter(mood)} drop-shadow(0 0 ${px(H * 0.03)} ${hexA(input.profile.palette.amber, 0.25)});}`,
      `${bg ? photoLayer(bg, { ...input, style: { ...input.style, mood: "warm" } }) : proceduralAtmosphere(input, 1.2)}
      <div class="abs" style="background:radial-gradient(${land ? "45% 70% at 62% 55%" : "55% 40% at 50% 52%"},${hexA(input.profile.palette.champagne, 0.28)},transparent 70%);mix-blend-mode:screen"></div>
      <div class="abs" style="background:linear-gradient(180deg,rgba(0,0,0,.5) 0%,rgba(0,0,0,0) 25%,rgba(0,0,0,0) 55%,rgba(0,0,0,.85) 78%,var(--black) 100%)"></div>
      ${
        land
          ? ""
          : `<div style="position:absolute;left:var(--safe-side);right:var(--safe-side);top:${px(nameTop)}"><div class="display fit gold-text" data-fit data-max="${H * 0.2}" data-min="${H * 0.05}" style="text-align:center;letter-spacing:.01em;line-height:.9">${escLines(input.fields.artist)}</div></div>`
      }
      ${art ? `<img class="figure" src="${fileUrl(art)}" />` : ""}
      ${finishLayers(input, 0.5)}
      ${land ? `<div style="position:absolute;left:var(--safe-side);top:var(--safe-top)">${logoHtml(input, px(H * 0.075))}</div>` : topLogo(input)}
      ${
        land
          ? `<div style="position:absolute;left:var(--safe-side);width:${px(W * 0.42)};top:50%;transform:translateY(-50%)">${infoStack(input, { nameMax: T * 0.2, align: "left", nameClass: "gold-text" })}</div>`
          : `<div style="position:absolute;left:var(--safe-side);right:var(--safe-side);bottom:${px(format.safe.bottom + H * 0.07)}">${infoStack(input, { nameMax: 1, hideName: true })}</div>`
      }
      ${land ? "" : footer(input)}`,
    );
  },
};

// ───────────────────────── 3. EDITORIAL ARCH ─────────────────────────
export const editorial: TemplateDef = {
  id: "xs_editorial",
  name: "Editorial arch",
  description:
    "Luxury editorial: artist photo inside a retro-futurist arch with a fine champagne keyline, double-rule border around the poster, serif italic eyebrow, name set in geometric caps. Best for residency/announcement moments and print.",
  kinds: ["flyer", "announcement", "story"],
  fields: COMMON_FIELDS,
  images: { background: "none", artist: "required" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const W = format.width;
    const land = isLandscape(format);
    const tall = isTall(format);
    const art = input.images.artist ?? input.images.background;
    const inset = Math.round(Math.min(W, H) * 0.028);
    const logoTop = Math.max(format.safe.top, inset * 2.2);
    // Portrait: the info block is anchored above the footer; the arch takes the space that is left.
    const infoBottom = format.safe.bottom + T * 0.085;
    const infoReserve = T * (input.fields.eyebrow ? 0.33 : 0.29);
    const archTop = land ? H * 0.13 : logoTop + T * 0.09;
    const archSpace = H - infoBottom - infoReserve - archTop - T * 0.03;
    const archW = land ? W * 0.3 : Math.min(W * 0.64, archSpace / 1.22);
    const archH = land ? H * 0.74 : Math.min(archSpace, archW * 1.42);
    const archBox = `position:absolute;width:${px(archW)};height:${px(archH)};top:${px(archTop)};${land ? `right:${px(W * 0.1)}` : `left:50%;transform:translateX(-50%)`}`;
    return page(
      input,
      `.arch{${archBox};border-radius:${px(archW / 2)} ${px(archW / 2)} ${px(4)} ${px(4)};overflow:hidden}
       .arch-line{${archBox};border-radius:${px(archW / 2)} ${px(archW / 2)} ${px(4)} ${px(4)};border:1px solid var(--accent);margin:${px(-inset * 0.55)};width:${px(archW + inset * 1.1)};height:${px(archH + inset * 1.1)}}
       .frame{position:absolute;inset:${px(inset)};border:1px solid ${hexA(input.profile.palette.champagne, 0.55)}}
       .frame2{position:absolute;inset:${px(inset + 6)};border:1px solid ${hexA(input.profile.palette.champagne, 0.22)}}
       .eyebrow-serif{font-family:var(--serif);font-style:italic;color:var(--accent);letter-spacing:.02em}`,
      `${proceduralAtmosphere(input, 0.6)}
      <div class="arch-line"></div>
      <div class="arch">${art ? photoLayer(art, input) : proceduralAtmosphere(input, 1.4)}<div class="abs" style="background:linear-gradient(180deg,transparent 60%,rgba(0,0,0,.55))"></div></div>
      ${finishLayers(input, 0.35)}
      <div class="frame"></div><div class="frame2"></div>
      ${
        land
          ? `<div style="position:absolute;left:${px(W * 0.08)};top:${px(H * 0.12)}">${logoHtml(input, px(H * 0.08))}</div>
             <div style="position:absolute;left:${px(W * 0.08)};width:${px(W * 0.48)};top:50%;transform:translateY(-40%)">
               ${input.fields.eyebrow ? `<div class="eyebrow-serif" style="font-size:${px(T * 0.045)};margin-bottom:${px(H * 0.02)}">${esc(input.fields.eyebrow)}</div>` : ""}
               ${infoStack({ ...input, fields: { ...input.fields, eyebrow: "" } }, { nameMax: T * 0.17, align: "left" })}
             </div>
             <div style="position:absolute;left:${px(W * 0.08)};bottom:${px(H * 0.1)}"><div class="caps" style="font-size:${px(T * 0.016)};letter-spacing:.3em">${esc(input.fields.cta)}</div><div class="caps" style="margin-top:8px;font-size:${px(T * 0.011)};letter-spacing:.2em;opacity:.55">${esc(input.fields.finePrint)}</div></div>`
          : `<div style="position:absolute;top:${px(logoTop)};left:var(--safe-side);right:var(--safe-side);display:flex;justify-content:center" data-safe="logo">${logoHtml(input, px(T * 0.05))}</div>
             <div style="position:absolute;left:${px(W * 0.09)};right:${px(W * 0.09)};bottom:${px(infoBottom)}">
               ${input.fields.eyebrow ? `<div class="eyebrow-serif" style="text-align:center;font-size:${px(T * 0.03)};margin-bottom:${px(T * 0.008)}">${esc(input.fields.eyebrow)}</div>` : ""}
               ${infoStack({ ...input, fields: { ...input.fields, eyebrow: "" } }, { nameMax: T * 0.1, gap: T * 0.01 })}
             </div>
             ${footer(input)}`
      }`,
    );
  },
};

// ───────────────────────── 4. TYPOGRAPHIC ─────────────────────────
export const typographic: TemplateDef = {
  id: "xs_typographic",
  name: "Typographic gold",
  description:
    "No photo needed. Warm black field with a soft champagne light bloom and real grain; the artist name set huge in brushed-metal gold, stacked info below. Use for quick announcements, 'TONIGHT' stories, or when no approved press photo exists.",
  kinds: ["flyer", "story", "announcement"],
  fields: COMMON_FIELDS,
  images: { background: "optional", artist: "none" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const land = isLandscape(format);
    const bg = input.images.background;
    return page(
      input,
      `.name{line-height:.92}`,
      `${bg ? photoLayer(bg, { ...input, style: { ...input.style, mood: input.style.mood ?? "warm" } }) + `<div class="abs" style="background:rgba(0,0,0,.62)"></div>` : proceduralAtmosphere(input, 1.1)}
      ${finishLayers(input, 0.6)}
      ${topLogo(input, land ? 1.2 : 1)}
      <div style="position:absolute;left:var(--safe-side);right:var(--safe-side);top:50%;transform:translateY(-50%)">
        ${infoStack(input, { nameMax: T * (land ? 0.26 : 0.17), nameClass: "gold-text", gap: H * 0.018 })}
      </div>
      ${footer(input)}`,
    );
  },
};

// ───────────────────────── 5. LINEUP ─────────────────────────
const LINEUP_FIELDS: EditableField[] = [
  { key: "title", label: "Title", multiline: false, help: "e.g. THIS WEEKEND · THIS WEEK AT XS · NOVEMBER" },
  { key: "rows", label: "Rows (one per line: DATE | ARTIST | qualifier)", multiline: true, help: "FRI 11.13 | KASKADE\nSAT 11.14 | MARSHMELLO" },
  { key: "venueLine", label: "Venue line", multiline: false },
  { key: "cta", label: "Call to action", multiline: false },
  { key: "finePrint", label: "Fine print", multiline: false },
];

export const lineup: TemplateDef = {
  id: "xs_lineup",
  name: "Lineup — week / weekend / month",
  description:
    "Schedule card: logo, title (THIS WEEKEND / THIS WEEK AT XS / month), then one row per night — date left, artist right, champagne hairlines between. Optional dimmed atmosphere plate. 1–10 rows.",
  kinds: ["lineup"],
  fields: LINEUP_FIELDS,
  images: { background: "optional", artist: "none" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const W = format.width;
    const rows = (input.fields.rows ?? "")
      .split("\n")
      .map((r) => r.split("|").map((c) => c.trim()))
      .filter((r) => r[0] || r[1]);
    const n = Math.max(rows.length, 1);
    const rowsTop = format.safe.top + T * 0.22;
    const rowsBottomLimit = H - format.safe.bottom - T * 0.13;
    const area = rowsBottomLimit - rowsTop;
    const rowH = Math.min(T * 0.12, area / n);
    const rowsOffset = rowsTop + Math.max(0, (area - rowH * n) / 2.4);
    const bg = input.images.background;
    return page(
      input,
      `.row{display:grid;grid-template-columns:${px(W * 0.27)} 1fr;align-items:center;height:${px(rowH)};border-top:1px solid ${hexA(input.profile.palette.champagne, 0.35)}}
       .row:last-child{border-bottom:1px solid ${hexA(input.profile.palette.champagne, 0.35)}}
       .rdate{font-size:${px(Math.min(rowH * 0.26, T * 0.024))};letter-spacing:.26em;color:var(--accent);white-space:nowrap}
       .rname{color:var(--ivory)}
       .rq{font-size:${px(Math.min(rowH * 0.17, T * 0.014))};letter-spacing:.24em;opacity:.7;margin-top:4px}`,
      `${bg ? photoLayer(bg, input) + `<div class="abs" style="background:rgba(0,0,0,.72)"></div>` : proceduralAtmosphere(input, 0.9)}
      ${finishLayers(input, 0.5)}
      ${topLogo(input)}
      <div style="position:absolute;left:var(--safe-side);right:var(--safe-side);top:${px(format.safe.top + T * 0.1)}">
        <div class="display fit gold-text" data-fit data-max="${T * 0.085}" data-min="${T * 0.03}" style="text-align:center;letter-spacing:.06em">${esc(input.fields.title)}</div>
      </div>
      <div data-safe="rows" style="position:absolute;left:var(--safe-side);right:var(--safe-side);top:${px(rowsOffset)}">
        ${rows
          .map(
            (r) => `<div class="row"><div class="caps rdate">${esc(r[0])}</div><div style="min-width:0"><div class="display fit rname" data-fit data-max="${rowH * 0.56}" data-min="${rowH * 0.2}" style="text-align:right">${esc(r[1])}</div>${r[2] ? `<div class="caps rq" style="text-align:right">${esc(r[2])}</div>` : ""}</div></div>`,
          )
          .join("")}
      </div>
      ${input.fields.venueLine ? `<div class="caps" style="position:absolute;left:0;right:0;bottom:${px(format.safe.bottom + T * 0.06)};text-align:center;font-size:${px(T * 0.0145)};letter-spacing:.34em;color:var(--accent)">${esc(input.fields.venueLine)}</div>` : ""}
      ${footer(input)}`,
    );
  },
};

// ───────────────────────── 6. RESIDENCY ─────────────────────────
const RESIDENCY_FIELDS: EditableField[] = [
  { key: "eyebrow", label: "Eyebrow", multiline: false, help: "e.g. WELCOME HOME · 2027 RESIDENCY" },
  { key: "artist", label: "Artist", multiline: false },
  { key: "dates", label: "Dates (one per line)", multiline: true, help: "FRI 01.15\nSAT 02.13" },
  { key: "venueLine", label: "Venue line", multiline: false },
  { key: "cta", label: "Call to action", multiline: false },
  { key: "finePrint", label: "Fine print", multiline: false },
];

export const residency: TemplateDef = {
  id: "xs_residency",
  name: "Residency announcement",
  description:
    "Residency / multi-date reveal: artist photo top 55% fading to black, eyebrow (e.g. 'WELCOME HOME' / '2027 RESIDENCY'), artist name, then a centred grid of dates separated by champagne dots.",
  kinds: ["announcement", "flyer"],
  fields: RESIDENCY_FIELDS,
  images: { background: "none", artist: "required" },
  render(input) {
    const { format } = input;
    const H = format.height;
    const T = typeBasis(format);
    const tall = isTall(format);
    const dates = (input.fields.dates ?? "")
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);
    const art = input.images.artist ?? input.images.background;
    const cols = dates.length > 8 ? 4 : dates.length > 4 ? 3 : Math.max(1, Math.min(dates.length, 2));
    return page(
      input,
      `.dates{display:grid;grid-template-columns:repeat(${cols},auto);justify-content:center;gap:${px(H * 0.012)} ${px(H * 0.04)}}
       .d{font-size:${px(T * (dates.length > 8 ? 0.017 : 0.021))};letter-spacing:.26em;color:var(--ivory);white-space:nowrap}`,
      `<div class="abs" style="bottom:${tall ? "34%" : "40%"}">${art ? photoLayer(art, input) : proceduralAtmosphere(input, 1.3)}</div>
      <div class="abs" style="background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 20%,rgba(0,0,0,0) 35%,var(--black) ${tall ? "62%" : "58%"})"></div>
      ${finishLayers(input, 0.45)}
      ${topLogo(input)}
      <div style="position:absolute;left:var(--safe-side);right:var(--safe-side);bottom:${px(format.safe.bottom + T * 0.085)}">
        ${infoStack({ ...input, fields: { ...input.fields, dateLine: "", venueLine: "" } }, { nameMax: T * 0.12 })}
        <div class="hair" style="width:30%;margin:${px(H * 0.022)} auto"></div>
        <div class="dates">${dates.map((d) => `<div class="caps d">${esc(d)}</div>`).join("")}</div>
        ${input.fields.venueLine ? `<div class="caps" style="text-align:center;margin-top:${px(H * 0.025)};font-size:${px(T * 0.0145)};letter-spacing:.34em;color:var(--accent)">${esc(input.fields.venueLine)}</div>` : ""}
      </div>
      ${footer(input)}`,
    );
  },
};

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

export const TEMPLATES: TemplateDef[] = [headliner, cutout, editorial, typographic, lineup, residency, recap];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
