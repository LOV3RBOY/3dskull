# XS Studio

An in-house creative tool for the XS Nightclub (Wynn Las Vegas) marketing and social team. It's a native iPhone app backed by an agentic content pipeline. You brief it the way you would brief a designer, for example *"make a poster for Diplo this weekend"*, *"weekly lineup"* or *"caption pack for Saturday"*. It returns publish-ready flyers, stories, lineups, residency announcements and captions in the XS house style.

```
iPhone app (SwiftUI)  ──HTTPS/SSE──▶  Backend (Node + Fastify)
  Studio · Library ·                   ├─ Creative Director agent (Claude, tool use)
  Calendar · Assets · Brand            ├─ XS layout engine (HTML/CSS → headless Chromium)
                                       ├─ Brand system + Brand DNA (Claude vision on real posts)
                                       ├─ Calendar (source of truth for dates)
                                       ├─ Asset library (press photos, cut-outs, logo, venue)
                                       └─ Optional: AI atmosphere plates, server cut-outs
```

## How it avoids looking AI-made
- **Real people stay real.** Artist likeness only comes from the team's approved press photos. Nothing generative ever touches a person: no restyle, relight or upscale. AI is only used for empty atmosphere plates such as rooms, light and haze, and only when you want it.
- **Typography is typeset, not generated.** Every letter is set by a deterministic layout engine with real fonts, auto-fit, safe zones and exact canonical artist styling (RÜFÜS DU SOL, deadmau5, BUNT.). AI-drawn text is the most common giveaway, and this design rules it out.
- **Facts come from the calendar.** The agent has to look up the booking. It gets weekday and date formats from the calendar and never works them out itself. If the brief conflicts with the calendar, for example Diplo isn't on this weekend, it says so and offers the correct dates.
- **Brand DNA from your own posts.** Upload your real posts. Claude analyses each one, then writes a measurable house style that the agent follows. The agent can also view those reference posts while it designs.
- **It checks its own work.** Each render comes back to the agent as an image. It checks the result against a creative-director checklist and re-renders before delivering.
- **Finish.** Real-camera grain, a warm or noir grade, and metallic champagne gold. Output is at exact platform sizes: 1080×1350, 1080×1920, 1080×1080, 1920×1080, and 18×24 in at 300 dpi.
- **The editor stays deterministic.** In the Library you can edit any text field, or switch format or template, and re-render instantly with no AI involved.

## Repository
| Path | What |
|---|---|
| `backend/` | API, agent, layout engine, storage (TypeScript). See `docs/API.md` |
| `ios/` | Native SwiftUI app (XcodeGen). See `ios/README.md` for Xcode → TestFlight |
| `docs/BRAND_RESEARCH.md` | Research findings and their confidence levels |
| `docs/DEPLOY.md` | Hosting (Fly.io / Docker / local) and first-run checklist |
| `docs/API.md` | Backend API contract |

## Quick start
```bash
cd backend && npm install && cp .env.example .env   # set ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed && npm run dev                         # http://localhost:8787
npm test                                            # unit + agent end-to-end (mocked model) tests
npm run render-samples -- ./samples                 # render every template/format for review
```
Then build the app: see `ios/README.md`.
