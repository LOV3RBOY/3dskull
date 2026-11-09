import { kvGet, kvSet } from "../db.js";

/**
 * The XS brand system the agents design within. Defaults come from the research pass
 * (see docs/BRAND_RESEARCH.md). Everything is overridable by the team in-app
 * (Brand → Profile), and the Brand DNA synthesised from the team's own reference
 * posts is layered on top of this at prompt time.
 */
export interface BrandProfile {
  brandName: string;
  venueName: string;
  propertyLine: string;
  instagram: string;
  parentInstagram: string;
  website: string;
  tablesPhone: string;
  ticketCta: string;
  finePrint: string;
  hashtags: string[];
  palette: Record<string, string>;
  typography: {
    display: string;
    displayWeight: number;
    secondary: string;
    secondaryWeight: number;
    serif: string;
    trackingCaps: string;
  };
  dateStyle: "dow_dotted" | "long" | "medium" | "month_day_pipe";
  artistStyling: Record<string, string>;
  venueFacts: string[];
  voice: string[];
  rules: { do: string[]; dont: string[] };
  imageryDirection: string[];
}

export const DEFAULT_PROFILE: BrandProfile = {
  brandName: "XS",
  venueName: "XS Nightclub",
  propertyLine: "WYNN LAS VEGAS",
  instagram: "@xslasvegas",
  parentInstagram: "@wynnnightlife",
  website: "WYNNSOCIAL.COM",
  tablesPhone: "",
  ticketCta: "TICKETS & TABLES",
  finePrint: "21+ · VALID GOVERNMENT-ISSUED ID REQUIRED · DRESS CODE STRICTLY ENFORCED",
  hashtags: ["#XSLasVegas", "#WynnNightlife"],
  // Inferred from Wynn/press descriptors (gold, champagne-gold, amber, bronze, brass, chrome, warm near-black).
  // Replace with official values from the Wynn Nightlife brand guide in Brand → Profile.
  palette: {
    black: "#0B0A08",
    ink: "#1E150E",
    bronze: "#6E4A2A",
    goldDeep: "#7E5B32",
    gold: "#A9824B",
    champagne: "#D6B97F",
    goldLight: "#F1DDAE",
    amber: "#E39B3A",
    chrome: "#C9CDD1",
    ivory: "#F4EEE3",
  },
  typography: {
    // Open-licensed stand-ins: Jost ≈ Futura, Nunito Sans ≈ Avenir, Libre Caslon Display ≈ Big Caslon.
    // Drop licensed brand fonts into DATA_DIR/fonts and set their family names here.
    display: "Jost",
    displayWeight: 600,
    secondary: "Nunito Sans",
    secondaryWeight: 600,
    serif: "Libre Caslon Display",
    trackingCaps: "0.28em",
  },
  dateStyle: "dow_dotted",
  artistStyling: {
    "RUFUS DU SOL": "RÜFÜS DU SOL",
    "RÜFÜS DU SOL": "RÜFÜS DU SOL",
    DEADMAU5: "deadmau5",
    "ITS MURPH": "it's murph",
    "IT'S MURPH": "it's murph",
    ODESZA: "ODESZA",
    HNTR: "HNTR",
    HUGEL: "HUGEL",
    "MAU P": "Mau P",
    "CALVIN HARRIS": "CALVIN HARRIS",
    "THE CHAINSMOKERS": "THE CHAINSMOKERS",
    DIPLO: "DIPLO",
    KASKADE: "KASKADE",
    MARSHMELLO: "MARSHMELLO",
    SUBTRONICS: "SUBTRONICS",
    "ODD MOB": "ODD MOB",
    "LOUD LUXURY": "LOUD LUXURY",
    "VALENTINO KHAN": "VALENTINO KHAN",
    "DUSTIN LYNCH": "DUSTIN LYNCH",
    "SOFI TUKKER": "SOFI TUKKER",
    BUNT: "BUNT.",
    "BUNT.": "BUNT.",
    AYYBO: "AYYBO",
    VAVO: "VAVO",
    GRYFFIN: "GRYFFIN",
    ACRAZE: "ACRAZE",
    "TWO FRIENDS": "TWO FRIENDS",
    "SULLIVAN KING": "SULLIVAN KING",
    "ALEC MONOPOLY": "ALEC MONOPOLY",
    "ALEX WANN": "ALEX WANN",
    "DEUX TWINS": "DEUX TWINS",
    "KIM LEE": "KIM LEE",
    "CHARLY JORDAN": "CHARLY JORDAN",
    "FRANKY RIZARDO": "FRANKY RIZARDO",
    "DILLON FRANCIS": "DILLON FRANCIS",
    "BOB MOSES": "BOB MOSES",
    AFROJACK: "AFROJACK",
    TIESTO: "TIËSTO",
    "TIËSTO": "TIËSTO",
  },
  venueFacts: [
    "XS Nightclub is inside Encore at Wynn Las Vegas (3131 Las Vegas Blvd South), operated by Wynn Nightlife (@wynnnightlife). Sister venues: Encore Beach Club (EBC) and EBC at Night / Nightswim. Official billing: 'XS Nightclub at Wynn Las Vegas'. IG bio: 'Located inside of @WynnLasVegas'.",
    "Tickets & tables: wynnsocial.com (Wynn Nightlife) and tixr.com/groups/xs. Doors typically 10:30PM — only print a time when the calendar confirms it.",
    "2026 Wynn Nightlife campaign: 'The Year of Excess' (XS = excess pun). Earlier artist campaigns used black-and-white artist portraits with a restrained colour system.",
    "Billing qualifiers are exact: [DJ SET], B2B, WITH SPECIAL GUEST(S), (club set), Night Swim.",
    "XS closed in 2026 for a top-to-bottom reimagining and reopened Nov 5–8, 2026 (RÜFÜS DU SOL DJ set, The Chainsmokers, Calvin Harris, Diplo b2b HUGEL).",
    "The reimagined room: 'retro-futurist opulence' — reflective brass, bronze and chrome, 1,200 kinetic pendants in sculptural gold structures, gold-mirrored LED screens, an aperture centerpiece, mirrored-gold DJ booth. ~40,000 sq ft wrapped around Encore's pool (10,000+ lights).",
    "The original Roger Thomas design language was gold, black, bronze and brown with sensual curves; the club opens onto Encore's illuminated pool (outdoor/indoor party).",
    "Pre-2026 interiors (gold body-cast wall sculptures, the old chandelier) must NOT be presented as the current room unless the team confirms they survived the redesign.",
    "2026 Wynn Nightlife residents (XS/EBC/EBC at Night) per press: Calvin Harris, The Chainsmokers, Diplo, Kaskade, Marshmello, ODESZA (DJ set), deadmau5, Subtronics, Odd Mob, HUGEL, Mau P, Loud Luxury, Valentino Khan, HNTR, AYYBO, BUNT., Bob Moses (club set), Dustin Lynch, Dillon Francis, Gryffin, it's murph, SOFI TUKKER, Two Friends, VAVO and others. Kygo, Zedd, Tiësto, David Guetta, Swedish House Mafia are NOT current residents. The XS calendar is the only source of truth for dates.",
  ],
  voice: [
    "Confident, understated luxury — short, declarative, superlative but never slangy. Craft words: design, artistry, elegant, legendary, opulence, reimagined. Light wit allowed in campaign lines ('Excess'), never in fine print.",
    "Short declaratives. 'Welcome home.' energy for residents. Announcements read like an invitation, not an ad.",
    "Use artist names exactly as the artist styles them (umlauts, lowercase, b2b).",
    "CTA is crisp: tables and tickets, link in bio. Mention @artist handle when known.",
    "Emoji sparingly (0–2), never in headlines, never a row of 🔥. Hashtags minimal: #XSLasVegas #WynnNightlife.",
    "Long-form CTA pattern: 'For tickets and VIP tables, visit wynnsocial.com.' No prices, minimums or 'free guest list' on official creative.",
  ],
  rules: {
    do: [
      "Warm near-black field; metallic champagne/gold as the only primary accent (gradient-shaded, like brass under light). Chrome and amber sparingly.",
      "One hero artist per flyer, mono or desaturated, warm gold rim/key light; artist name is the largest element; symmetric, generous negative space — luxury through restraint.",
      "Date line format for social: 'FRI 11.13' (day + M.DD). Print may use 'FRIDAY NOVEMBER 13'. No ordinals.",
      "Typography carries the luxury: generous tracking on small caps, tight confident display for artist names, lots of negative space.",
      "Use ONLY official, team-supplied artist press photos for artist likenesses. Grade them warm, rich blacks, filmic.",
      "Place the official XS logo artwork from the asset library; if none is uploaded, use the typeset placeholder and tell the team.",
      "Check every date's day-of-week against the calendar tool before it goes on a flyer.",
      "Respect Instagram safe zones (story top/bottom UI).",
    ],
    dont: [
      "No neon pink/electric blue/acid rave palettes, glitch, grunge or festival collage; no flat #FFD700 yellow or generic 'Vegas Gold'. No lens flares, starbursts, sponsor-badge clutter or 'LIMITED!!!' urgency.",
      "No script or decorative fonts (Wynn's signature logo is the only script, used as artwork).",
      "Never list a non-current artist as an XS resident; never call it 'XS Las Vegas Club' or put it in another hotel.",
      "Never generate or synthesise a real artist's face or body. No AI-made people as the focal point.",
      "Never retype or redraw the XS logo in a font when the official artwork exists.",
      "No AI-rendered text inside images — all type is set by the layout engine.",
      "No pre-renovation interiors presented as the current room. No invented pyro/show elements.",
      "Never invent dates, set times, ticket prices or lineups — only what's in the calendar or the request.",
    ],
  },
  imageryDirection: [
    "Atmosphere plates: dark, expensive, architectural — mirrored gold surfaces, warm haze, beams of champagne light cutting through black, shallow depth of field, real-camera grain, no people in focus.",
    "Artist photos: rich blacks, warm highlights, slight halation, subtle film grain; desaturate cool casts.",
    "Crowd/recap: hands up silhouettes against gold light, CO2 and confetti only if they're in the source photo.",
  ],
};

const KEY = "brand.profile";

export function getProfile(): BrandProfile {
  const overrides = kvGet<Partial<BrandProfile>>(KEY, {});
  return { ...DEFAULT_PROFILE, ...overrides, palette: { ...DEFAULT_PROFILE.palette, ...(overrides.palette ?? {}) }, typography: { ...DEFAULT_PROFILE.typography, ...(overrides.typography ?? {}) }, rules: { ...DEFAULT_PROFILE.rules, ...(overrides.rules ?? {}) }, artistStyling: { ...DEFAULT_PROFILE.artistStyling, ...(overrides.artistStyling ?? {}) } };
}

export function updateProfile(patch: Partial<BrandProfile>): BrandProfile {
  const current = kvGet<Partial<BrandProfile>>(KEY, {});
  kvSet(KEY, { ...current, ...patch });
  return getProfile();
}

const normKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Return the artist's canonical styling if we know it; otherwise the input unchanged. */
export function canonicalArtist(name: string, profile = getProfile()): string {
  const target = normKey(name);
  for (const [k, v] of Object.entries(profile.artistStyling)) if (normKey(k) === target) return v;
  return name;
}
