# Deployment Guide

## Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm i -g wrangler`
- Cloudflare account with Pages, D1, and R2 enabled (all free tier)

---

## 1. Create Cloudflare Resources

```bash
# D1 database
wrangler d1 create sevadal-db

# R2 bucket for photos/attachments
wrangler r2 bucket create sevadal-media
```

Paste the `database_id` from the D1 output into `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "sevadal-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

---

## 2. Run Database Schema

```bash
# Production
wrangler d1 execute sevadal-db --remote --file=schema-complete.sql

# Local dev
wrangler d1 execute sevadal-db --local --file=schema-complete.sql
```

---

## 3. Set Secrets

```bash
wrangler secret put SESSION_SECRET       # 32+ char random string
wrangler secret put TELEGRAM_BOT_TOKEN   # from @BotFather (optional)
wrangler secret put TELEGRAM_CHAT_ID     # channel/group ID (optional)
wrangler secret put BACKUP_SECRET        # random string, shared with cron worker
```

---

## 4. Deploy to Cloudflare Pages

```bash
npm run build
wrangler pages deploy build/client --project-name=sevadal-attendance
```

Or connect your GitHub repo in the Cloudflare Pages dashboard for automatic CI deploys.

---

## 5. Deploy Cron Worker (Telegram Backup)

```bash
cd cron-worker
wrangler secret put BACKUP_SECRET   # must match main app BACKUP_SECRET
wrangler deploy
```

The cron runs every 30 minutes. The backup only sends within ±20 minutes of the **Backup Time** configured in **Admin → Settings**. Change the time in the UI — no redeploy needed.

---

## 6. Create Super Admin

After first deploy, open the app and register the first member via the admin panel, then manually set `is_super_admin = 1` in D1:

```bash
wrangler d1 execute sevadal-db --remote \
  --command="UPDATE members SET is_admin=1, is_super_admin=1 WHERE id='MEMBER_ID'"
```

---

## Local Development

```bash
cp .dev.vars.example .dev.vars   # fill in your secrets
npm run dev                       # starts Wrangler Pages dev server on :8788
```
