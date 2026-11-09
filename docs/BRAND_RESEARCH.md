# XS Nightclub: Brand Research (Nov 2026)

This file holds the starting brand system that XS Studio's agents design within. It was put together by three research agents on 9 Nov 2026, covering the XS and Wynn web presence, @xslasvegas social, and current image-generation APIs.

> **Read this first.** The research sandbox's network blocked direct fetches of xslasvegas.com, wynnlasvegas.com and instagram.com. Every finding below comes from search-indexed copies of official Wynn pages, Wynn press releases and trade/press coverage. **No flyer pixels, CSS hex values or font files were seen directly.** Labels used:
> - **[confirmed]**: stated in an official or press source.
> - **[inferred]**: art-direction judgment.
>
> The team's own material is the real ground truth: the Wynn Nightlife brand guide, the master flyer files, and an export of recent @xslasvegas posts. Load it into the app:
> - **Brand → References:** upload 20–50 recent posts, then tap **Rebuild DNA**. Claude analyses each post and writes the house style that the agent follows.
> - **Brand → Profile:** replace the inferred palette and fonts with the official values.
> - **Assets → Logo:** upload the official XS logo artwork and tag it `primary`.

## Venue facts [confirmed]
- **Location and operator:** XS Nightclub is inside Encore at Wynn Las Vegas, 3131 Las Vegas Blvd South, and is operated by Wynn Nightlife (@wynnnightlife).
  - Official billing: "XS Nightclub at Wynn Las Vegas".
  - IG bio: "Located inside of @WynnLasVegas".
- **History:** Opened NYE 2008, designed by Roger Thomas. The original palette was gold, black, bronze and brown, and the design was "inspired by the provocative curves of the human body": gold body-cast sculptures and an undulating golden staircase.
- **2026 renovation:**
  - Closed 1 Aug 2026 and reopened **Thu 5 – Sun 8 Nov 2026**:
    - Thu: RÜFÜS DU SOL [DJ SET]
    - Fri: The Chainsmokers
    - Sat: Calvin Harris
    - Sun: Diplo B2B HUGEL
  - The new room is **"retro-futurist opulence"**: brass, bronze and chrome; 1,200 kinetic pendants in sculptural gold structures; gold-mirrored LED screens; an aperture centrepiece; and a mirrored-gold DJ booth.
- **Room and pool:** About 40,000 sq ft around Encore's pool, which has 10,000+ lights. Capacity is about 1,840 indoors and about 3,121 including outdoor areas.
- **Pre-2026 interiors:** These must not be presented as the current room. **Most public XS imagery shows the old room.**
- **Campaign and tickets:**
  - The 2026 Wynn Nightlife campaign is **"The Year of Excess"** (XS = excess).
  - Tickets and tables are sold at **wynnsocial.com** and tixr.com/groups/xs.
  - Doors are generally 10:30 PM.
- **Operating nights:** Official sources disagree (Fri/Sat; Fri/Sat/Sun; Wed/Fri/Sat from 2027), so the calendar decides.

## 2026 residents (Wynn Nightlife, across XS / EBC / EBC at Night) [confirmed via press]
- **New:** Calvin Harris (two-year exclusive), Kaskade, Loud Luxury, Valentino Khan, HNTR, AYYBO, BUNT., Alec Monopoly, Alex Wann
- **Returning:** The Chainsmokers, Diplo, Marshmello, ODESZA (DJ set), deadmau5, Subtronics, Odd Mob, HUGEL, Mau P, Bob Moses (club set), Dustin Lynch, Dillon Francis, Gryffin, it's murph, SOFI TUKKER, Two Friends, VAVO, Deux Twins, Kim Lee, Charly Jordan, Sullivan King, ACRAZE
- **Not current residents:** Kygo, Zedd, Tiësto, David Guetta, Swedish House Mafia. The agent is told this.

**Upcoming public listings:** seeded into the calendar as *tentative* by `npm run seed`. They come mostly from AXS and other aggregators, so verify every one.

| Date | Artist |
|---|---|
| FRI 11.13 | Kaskade |
| SAT 11.14 | Marshmello |
| WED 11.18 | Franky Rizardo |
| THU 11.19 | Hugel w/ special guests |
| FRI 11.20 | The Chainsmokers |
| SAT 11.21 | Calvin Harris |
| SUN 11.22 | RÜFÜS DU SOL (DJ set) |
| FRI 11.27 | Loud Luxury |
| SAT 11.28 | Diplo |
| FRI 12.04 | Kaskade |
| SAT 12.05 | Diplo |
| FRI 12.11 | Marshmello |
| SAT 12.12 | Diplo |

## Visual system
**Palette [inferred from descriptors].** All of these are editable in Brand → Profile.

| Token | Hex | Use |
|---|---|---|
| near-black | `#0B0A08` | Field |
| espresso | `#1E150E` | Vignettes |
| bronze | `#6E4A2A` | Metal shadow |
| brass | `#A9824B` | Metal mid |
| champagne | `#D6B97F` | Headline gold, primary accent |
| highlight | `#F1DDAE` | Metal specular |
| amber | `#E39B3A` | Glow, sparing |
| chrome | `#C9CDD1` | Sparing |
| ivory | `#F4EEE3` | Small text |

- Gold is metallic and gradient-shaded. Never use flat #FFD700 or generic "Vegas Gold".

**Typography**
- A Wynn web snippet showed **Avenir** and **Big Caslon** font files [weak signal].
- Flyer headline lane [inferred]: all-caps geometric sans (Futura/Avenir class), tight to moderate tracking, artist name as the largest element. Small caps lines are widely tracked (+150 to +250). A high-contrast serif italic is used sparingly for "presents"-style lines.
- Open stand-ins that ship with the app: **Jost** (≈ Futura), **Nunito Sans** (≈ Avenir), **Libre Caslon Display** (≈ Big Caslon). To use licensed brand fonts, drop them in `DATA_DIR/fonts` and set their names in the profile.

**Layout [inferred]**
- One hero artist per piece, mono or desaturated, with a warm gold rim or key light.
- Symmetric, with generous negative space ("luxury through restraint").
- Official XS logo artwork, never retyped.
- Information order: logo, artist, qualifier, date, venue lockup, CTA, fine print.
- Earlier campaigns used black-and-white artist portraits (Tyler Shields, 2017) and a single shared artist image system (Meat and Potatoes, 2021).

**Copy [confirmed phrasing]**
- Billing qualifiers: `[DJ SET]`, `B2B`, `WITH SPECIAL GUEST(S)`, `(club set)`, `Night Swim`.
- CTA: "For more information, including tickets and VIP tables, visit www.wynnsocial.com and @xslasvegas on Instagram." Flyer form: "TICKETS & TABLES · WYNNSOCIAL.COM".
- Legal: "All guests must be at least 21 years of age with a valid government issued ID…", "Appropriate business casual attire is required…", "Dress code is strictly enforced…", "Scheduling and hours of operation may vary."
- Voice: short, declarative and superlative but never slangy ("the gold standard", "a complete reimagining", "Welcome home."). No emoji in headlines, no prices or minimums, no "free guest list".

**Date format**
- Social: `SAT 11.28`. Print: `SATURDAY, NOVEMBER 28`. No ordinals.
- The app always derives the weekday from the calendar date.

## Instagram (@xslasvegas)
Direct analysis wasn't possible: instagram.com is blocked from the build sandbox, and third-party mirror and scraper sites were deliberately not used. The app solves this properly instead:
1. Upload your own posts in Brand → References. Screenshots or exports are fine.
2. Claude vision writes a forensic analysis of each post: layout, type, colour, grade, verbatim copy and logo usage.
3. **Rebuild DNA** combines the analyses into a measurable house-style document. The agent receives that document and can view the reference posts while it designs.

## Image generation stack (verified Nov 2026, details in the agent report)
**Atmosphere plates** (people-free, text-free backgrounds)
- Set any one key; `IMAGE_PROVIDER=auto` uses the first one configured, in this order:
  1. `gemini-nano-banana-2.1` (Gemini API)
  2. `flux-2-pro` (BFL, asynchronous polling)
  3. `gpt-image-2.6-sunburst` (OpenAI)
- Imagen 4 was shut down on 17 Aug 2026; don't use it.

**Cut-outs** (non-generative)
- Options: Photoroom `/v1/segment` ($0.02), remove.bg, or fal Bria RMBG 2.0.
- The iOS app can also lift subjects on-device for free with Apple Vision.

**Principle:** keep the artist's pixels original. No generative edit, relight or upscale ever touches a real person.
