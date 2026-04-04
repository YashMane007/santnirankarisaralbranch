# Sevadal Attendance — Go Live Guide (Step by Step)

## Prerequisites
- Node.js 18+ installed
- Cloudflare account (free tier is enough)
- Wrangler CLI installed: `npm install -g wrangler`
- Log in to Cloudflare: `wrangler login`

---

## Step 1 — Create D1 Database

```bash
wrangler d1 create sevadal-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sevadal-db"
database_id = "PASTE_YOUR_ID_HERE"   # ← paste here
```

---

## Step 2 — Create R2 Bucket

```bash
wrangler r2 bucket create sevadal-media
```

No changes needed in `wrangler.toml` — bucket name `sevadal-media` is already configured.

---

## Step 3 — Run Database Migrations (REMOTE = production)

```bash
wrangler d1 execute sevadal-db --remote --file=migration.sql
wrangler d1 execute sevadal-db --remote --file=migration-v5.sql
```

---

## Step 4 — Set Secrets

These are NEVER stored in files — set them once via CLI:

```bash
# Required
wrangler secret put SESSION_SECRET
# Paste: any random 32+ character string, e.g. openssl rand -hex 32

# Optional — only needed if you want Telegram backup
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: your bot token from @BotFather, e.g. 123456789:AABBccDDeeff...

wrangler secret put TELEGRAM_CHAT_ID
# Paste: your group/channel ID, e.g. -100123456789

wrangler secret put BACKUP_SECRET
# Paste: any random string — used to authenticate the cron worker
```

---

## Step 5 — Install Dependencies

```bash
npm install
```

---

## Step 6 — Deploy

```bash
npm run deploy
```

Cloudflare will build and deploy. You'll get a URL like:
`https://sevadal-attendance.pages.dev`

---

## Step 7 — Create First Super Admin

After deploying, visit your site. The first member you create
must be promoted to Super Admin from the DB directly (first-time only):

```bash
# Open D1 console to create first member with a known PIN hash
wrangler d1 execute sevadal-db --remote --command="SELECT * FROM members LIMIT 5"
```

Or use the setup page at `/auth/setup-pin` if it's your first login.
Once you have one super admin set up, all further management is through the UI.

---

## Step 8 — Add Custom Domain (Optional)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Pages** → your project → **Custom Domains**
3. Add your domain — Cloudflare handles SSL automatically

---

## Local Development (No Deploy)

Create `.dev.vars` file in project root (NOT `.env` — Wrangler ignores `.env`):

```ini
SESSION_SECRET=any-32-char-dev-secret-here
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=-100your_chat_id
BACKUP_SECRET=dev-secret
```

Run local D1 migrations:
```bash
wrangler d1 execute sevadal-db --local --file=migration.sql
wrangler d1 execute sevadal-db --local --file=migration-v5.sql
```

Start dev server:
```bash
npm run dev
```

Visit `http://localhost:5173`

---

## Telegram Bot Setup (Optional)

1. Open Telegram, search `@BotFather`
2. Send `/newbot` → follow prompts → copy the **token**
3. Add your bot to a group or channel
4. Get the chat ID: visit `https://api.telegram.org/bot<TOKEN>/getUpdates` after sending a message in the group
5. The `chat.id` field is your `TELEGRAM_CHAT_ID` (negative number for groups/channels)

The cron worker (`cron-worker/`) must be deployed separately:
```bash
cd cron-worker
# Edit wrangler.toml: add your database_id and set BACKUP_SECRET var
wrangler deploy
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Images not loading | Check R2 bucket name matches `wrangler.toml` |
| Login not working | Check `SESSION_SECRET` is set via `wrangler secret put` |
| Telegram test failing | Make sure you used `.dev.vars` locally (NOT `.env`) |
| D1 errors | Re-run migrations: `wrangler d1 execute sevadal-db --remote --file=migration-v5.sql` |
| Hydration errors in browser | Clear site data / hard refresh (Ctrl+Shift+R) |
