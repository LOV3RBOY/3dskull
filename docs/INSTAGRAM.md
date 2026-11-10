# Connecting @xslasvegas (Instagram sync)

XS Studio keeps its Brand DNA current by pulling the account's **own** posts through the official Instagram API. It doesn't scrape: Instagram blocks automated scraping and its terms forbid it, so the official API is the reliable route. One person with admin access to the @xslasvegas professional account does this once.

## One-time setup (~15 minutes)
1. **Create the app.** At developers.facebook.com create an app (type **Business**). Add the **Instagram** product and choose **"API setup with Instagram login"**.
2. **Add the account.** Under *Roles → Instagram testers* (or app review for production use), add the @xslasvegas account. Accept the invite in Instagram → Settings → Apps and websites.
3. **Get a token.** In *Generate access tokens*, log in as @xslasvegas with the `instagram_business_basic` permission. Copy the **long-lived** token (valid for 60 days; XS Studio refreshes it automatically every ~20 days).
4. **Give it to the server.** Set it on the backend:
   ```bash
   fly secrets set INSTAGRAM_ACCESS_TOKEN=IGAA...     # or add to backend/.env
   ```

## What it does
- **Imports:** every post image, every carousel slide and every reel cover frame becomes a **Brand Reference**, tagged `instagram` and `ig:<id>`, with its date.
- **Captions:** stored and used as the voice reference when Brand DNA is rebuilt.
- **Analysis:** each new image is analysed by Claude vision (layout, type, colour, copy).
- **Schedule:**
  - Runs every 6 hours automatically (`INSTAGRAM_SYNC_HOURS`).
  - On demand: tap **Brand → Sync latest Instagram posts** in the app, which also rebuilds the DNA.
- **Duplicates:** imports are idempotent, so posts already synced are skipped.

API: `GET /brand/instagram` (status), `POST /brand/instagram/sync {maxPosts?, rebuildDna?}`.
