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
  venueName: "XS LAS VEGAS",
  propertyLine: "3131 LAS VEGAS BLVD S",
  instagram: "@xslasvegas",
  parentInstagram: "@wynnnightlife",
  website: "WYNNNIGHTLIFE.COM",
  tablesPhone: "",
  ticketCta: "TICKETS:",
  finePrint: "21+",
  hashtags: ["#XSLasVegas", "#WynnNightlife"],
  // Sampled from real 2026 @xslasvegas posts (light-trail headliners, Opening Weekend campaign).
  palette: {
    night: "#0D0403",
    deepRed: "#5E1309",
    vermilion: "#B8391C",
    ember: "#E5591F",
    trail: "#FF8A3A",
    champagne: "#C8B28C",
    cream: "#EEE5D6",
    jade: "#3EA58B",
    ticketRed: "#D63F2A",
    glowOrange: "#F58A4E",
    // legacy keys used by older layouts
    black: "#0D0403",
    ink: "#1E0805",
    gold: "#C8B28C",
    goldLight: "#D2BE9A",
    goldDeep: "#BBA27C",
    bronze: "#6E2A14",
    ivory: "#EEE5D6",
  },
  typography: {
    // Open-licensed matches measured against the real posts. Swap in the licensed originals via DATA_DIR/fonts.
    display: "Montserrat",
    displayWeight: 800,
    secondary: "Syncopate",
    secondaryWeight: 400,
    serif: "Gloock",
    trackingCaps: "0em",
  },
  dateStyle: "dow_dotted",
  artistStyling: {
    "RUFUS DU SOL": "RÜFÜS DU SOL",
    "RÜFÜS DU SOL": "RÜFÜS DU SOL",
    "RUFUS DU SOL [DJ SET]": "RÜFÜS DU SOL [DJ SET]",
    DEADMAU5: "deadmau5",
    "ITS MURPH": "it's murph",
    "IT'S MURPH": "it's murph",
    ODESZA: "ODESZA",
    HNTR: "HNTR",
    HUGEL: "HUGEL",
    "DIPLO B2B HUGEL": "DIPLO B2B HUGEL",
    "MAU P": "MAU P",
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
    "DILLON FRANCIS": "DILLON FRANCIS",
    "BOB MOSES": "BOB MOSES",
    AFROJACK: "AFROJACK",
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
    TIESTO: "TIËSTO",
    "TIËSTO": "TIËSTO",
  },
  venueFacts: [
    "XS is billed as 'XS LAS VEGAS' on 2026 creative; address line '3131 Las Vegas Blvd S'; operated by Wynn Nightlife (@wynnnightlife). Tickets and table reservations: wynnnightlife.com.",
    "XS reopened Nov 5–8, 2026 after a full reimagining (Opening Weekend: RÜFÜS DU SOL [DJ SET], THE CHAINSMOKERS, CALVIN HARRIS, DIPLO B2B HUGEL).",
    "Doors are usually 10:30PM (Franky Rizardo's Wednesday was 'Doors 10PM') — only print a time the calendar confirms.",
    "Billing qualifiers are exact: [DJ SET], B2B, WITH SPECIAL GUEST(S), (club set).",
    "2026 Wynn Nightlife residents include Calvin Harris, The Chainsmokers, Diplo, Kaskade, Marshmello, ODESZA, deadmau5, Subtronics, Odd Mob, HUGEL, Mau P, Loud Luxury, Valentino Khan, HNTR, AYYBO, BUNT., Bob Moses, Dustin Lynch, Dillon Francis, Gryffin, it's murph, SOFI TUKKER and others. The XS calendar is the only source of truth for dates.",
  ],
  voice: [
    "Short and confident. Let the name, the date and the room do the work.",
    "Use artist names exactly as the artist styles them (umlauts, lowercase, b2b, [DJ SET]).",
    "CTA is 'Tickets and table reservations at wynnnightlife.com' / 'Link in bio'. Tag @artist only when certain of the handle.",
    "Emoji sparingly (0–2), never in a row. Hashtags minimal: #XSLasVegas #WynnNightlife.",
  ],
  rules: {
    do: [
      "Current system (2026): red-orange light-trail / vermilion fields, near-black fades, champagne (#C8B28C) artist names, warm-white secondary type, heavy film grain.",
      "XS mark top-left + Wynn Nightlife Las Vegas mark top-right (headliner), or the pair centred/bottom-corners (campaign). Always the uploaded artwork.",
      "Venue is written 'XS LAS VEGAS'. URL is WYNNNIGHTLIFE.COM. Headliner footer: red-boxed 'TICKETS:' + URL + year.",
      "Date formats exactly per template: headliner 'SAT. NOV 14'; campaign 'SATURDAY,  NOVEMBER 7'; feature 'Wednesday, November 18, 2026'. Always from the calendar.",
      "Use the artist's own logotype when one is uploaded (e.g. Kaskade, RÜFÜS DU SOL); otherwise Montserrat ExtraBold caps spanning the full width.",
      "Reuse the artist's approved key art (cut-out or full-bleed art with its own background) — never invent a likeness.",
    ],
    dont: [
      "No black-and-gold 'luxury minimal' look, no serif-heavy editorial unless it's an Auditions/brand-style post.",
      "No neon pink/blue palettes, no lens-flare stars, no clip-art sparkles, no sponsor clutter.",
      "Never retype or redraw the XS or Wynn marks when the artwork exists.",
      "No AI-rendered text inside images — all type is set by the layout engine.",
      "Never generate or alter a real person. No AI faces, no AI crowds presented as real.",
      "Never invent dates, set times, prices or lineups.",
    ],
  },
  imageryDirection: [
    "Headliner: artist hero centred, warm orange key light, red-orange long-exposure light trails behind, deep fade to near-black under the type.",
    "Campaign: motion-blurred dark silhouette in a saturated vermilion/orange field; abstract, grainy, people unrecognisable.",
    "Feature: artist photo with the Wynn/Encore towers, red speed-light streaks, glowing orange type.",
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
