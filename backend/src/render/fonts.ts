import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";

const require = createRequire(import.meta.url);

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/** Built-in families (open-licensed). Brand fonts can be dropped into DATA_DIR/fonts. */
const FAMILIES: { family: string; pkg: string; weights: number[]; italics?: boolean }[] = [
  // Futura-class geometric (closest open match to the XS flyer headline lane)
  { family: "Jost", pkg: "jost", weights: [300, 400, 500, 600, 700, 800], italics: true },
  // Avenir-class humanist geometric for small tracked caps
  { family: "Nunito Sans", pkg: "nunito-sans", weights: [300, 400, 500, 600, 700, 800] },
  // Big Caslon-class high-contrast display serif
  { family: "Libre Caslon Display", pkg: "libre-caslon-display", weights: [400] },
  { family: "Anton", pkg: "anton", weights: [400] },
  // XS 2026 system
  { family: "Syncopate", pkg: "syncopate", weights: [400, 700] },
  { family: "Gloock", pkg: "gloock", weights: [400] },
  { family: "Marcellus", pkg: "marcellus", weights: [400] },
  { family: "Roboto Condensed", pkg: "roboto-condensed", weights: [400, 500, 600, 700, 800, 900], italics: true },
  { family: "Archivo Black", pkg: "archivo-black", weights: [400] },
  { family: "Bebas Neue", pkg: "bebas-neue", weights: [400] },
  { family: "Oswald", pkg: "oswald", weights: [200, 300, 400, 500, 600, 700] },
  { family: "Barlow Condensed", pkg: "barlow-condensed", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Montserrat", pkg: "montserrat", weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: "Inter", pkg: "inter", weights: [300, 400, 500, 600, 700] },
  { family: "Cormorant Garamond", pkg: "cormorant-garamond", weights: [300, 400, 500, 600, 700], italics: true },
  { family: "Playfair Display", pkg: "playfair-display", weights: [400, 500, 600, 700], italics: true },
];

let cachedCss: string | null = null;

function pkgFilesDir(pkg: string): string {
  return path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)), "files");
}

export function brandFontsDir() {
  return path.join(config.dataDir, "fonts");
}

/** Lists custom brand font families found in DATA_DIR/fonts (family = file name before the first "-" or "."). */
export function customFontFamilies(): string[] {
  const dir = brandFontsDir();
  if (!fs.existsSync(dir)) return [];
  const fams = new Set<string>();
  for (const f of fs.readdirSync(dir)) if (/\.(woff2?|otf|ttf)$/i.test(f)) fams.add(f.replace(/[-.].*$/, ""));
  return [...fams];
}

export function fontFaceCss(): string {
  if (cachedCss) return cachedCss;
  const rules: string[] = [];
  for (const fam of FAMILIES) {
    const dir = pkgFilesDir(fam.pkg);
    for (const w of fam.weights) {
      for (const style of fam.italics ? ["normal", "italic"] : ["normal"]) {
        for (const [subset, range] of [
          ["latin", LATIN],
          ["latin-ext", LATIN_EXT],
        ] as const) {
          const file = path.join(dir, `${fam.pkg}-${subset}-${w}-${style}.woff2`);
          if (!fs.existsSync(file)) continue;
          rules.push(
            `@font-face{font-family:'${fam.family}';font-style:${style};font-weight:${w};font-display:block;src:url('${pathToFileURL(file).href}') format('woff2');unicode-range:${range};}`,
          );
        }
      }
    }
  }
  // Variable Archivo with a width axis (62%–125%): expanded heavy caps and condensed billing from one family.
  const archivoDir = path.join(path.dirname(require.resolve("@fontsource-variable/archivo/package.json")), "files");
  for (const style of ["normal", "italic"]) {
    for (const [subset, range] of [
      ["latin", LATIN],
      ["latin-ext", LATIN_EXT],
    ] as const) {
      const file = path.join(archivoDir, `archivo-${subset}-wdth-${style}.woff2`);
      if (fs.existsSync(file))
        rules.push(
          `@font-face{font-family:'Archivo';font-style:${style};font-weight:100 900;font-stretch:62% 125%;font-display:block;src:url('${pathToFileURL(file).href}') format('woff2-variations');unicode-range:${range};}`,
        );
    }
  }
  // Custom brand fonts: e.g. "XSDisplay-Bold.otf" -> family "XSDisplay"; weight guessed from name.
  const dir = brandFontsDir();
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(woff2?|otf|ttf)$/i.test(f)) continue;
      const family = f.replace(/[-.].*$/, "");
      const lower = f.toLowerCase();
      const weight = /black|heavy/.test(lower) ? 900 : /extrabold/.test(lower) ? 800 : /bold/.test(lower) ? 700 : /semibold/.test(lower) ? 600 : /medium/.test(lower) ? 500 : /light/.test(lower) ? 300 : /thin/.test(lower) ? 200 : 400;
      const style = /italic/.test(lower) ? "italic" : "normal";
      rules.push(
        `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url('${pathToFileURL(path.join(dir, f)).href}');}`,
      );
    }
  }
  cachedCss = rules.join("\n");
  return cachedCss;
}

export function resetFontCache() {
  cachedCss = null;
}
