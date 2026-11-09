# Deploying the XS Studio backend

The iPhone app talks to one backend over HTTPS. Pick one of the three options below.

## What you need
- An **Anthropic API key** (required). It powers the Creative Director agent, the reference analysis and the lineup parsing.
- Optional: one image key for AI atmosphere plates (Gemini, BFL or OpenAI).
- Optional: one cut-out key (Photoroom, remove.bg or fal). Without one, the iOS app still makes cut-outs on-device.
- A persistent disk for `DATA_DIR`. It holds the SQLite database and every asset and render. Back it up.

## Option A: Fly.io (simplest managed HTTPS)
```bash
cd backend
fly launch --no-deploy --copy-config        # accept fly.toml, pick a unique app name
fly volumes create studio_data --size 10 --region lax
fly secrets set ANTHROPIC_API_KEY=... JWT_SECRET=$(openssl rand -hex 32) \
  ADMIN_EMAIL=you@wynnlasvegas.com ADMIN_PASSWORD='a-long-password' \
  PUBLIC_BASE_URL=https://<app>.fly.dev GEMINI_API_KEY=...   # optional extras
fly deploy
```
Use `https://<app>.fly.dev` as the server URL in the app.

## Option B: Any Docker host (VM, Mac mini, office server)
```bash
cp backend/.env.example backend/.env   # fill it in
docker compose up -d --build
```
To expose it over HTTPS without opening ports, use a Cloudflare Tunnel:
1. Create a tunnel in the Cloudflare dashboard.
2. Uncomment the `cloudflared` service in `docker-compose.yml`.
3. Set `CLOUDFLARE_TUNNEL_TOKEN`.
4. Set `PUBLIC_BASE_URL` to the tunnel hostname.

## Option C: Local development
```bash
cd backend
npm install
cp .env.example .env            # set ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed                    # optional: tentative public dates from research
npm run dev                     # http://localhost:8787
```
The iOS simulator can reach `http://localhost:8787`, because ATS allows local networking. On a physical iPhone, use your Mac's LAN IP, or put the server behind a tunnel.

## After first boot
1. Sign in to the app with the admin account and create logins for the team (Settings → Users). Roles:
   - **viewer:** read-only
   - **editor:** create and edit
   - **admin:** also manages users
2. **Assets → Upload:**
   - The official XS logo (kind *logo*, tag `primary`; transparent PNG).
   - Artist press photos (kind *artist_photo*, artist name set). Use *Lift subject* to make cut-outs.
   - Venue and crowd photography from the reimagined room.
3. **Brand → References:** upload 20–50 recent @xslasvegas posts, then tap **Rebuild DNA**.
4. **Brand → Profile:** replace the inferred palette and fonts with official values. Set the tables phone if you want it printed.
5. **Calendar:** confirm or replace the seeded *tentative* dates, or paste a lineup email into **Paste lineup**.

## Operations
- Health check: `GET /health`
- Backups: copy `DATA_DIR`. SQLite runs in WAL mode, so use `sqlite3 studio.db ".backup out.db"` for a hot backup.
- Logs: structured JSON from Fastify on stdout.
- Model and cost:
  - `ANTHROPIC_MODEL` defaults to `claude-opus-5-5`.
  - `ANTHROPIC_EFFORT` defaults to `high`. Lower it to `medium` for faster and cheaper runs.
  - Each run's token usage is stored on the `runs` row.
