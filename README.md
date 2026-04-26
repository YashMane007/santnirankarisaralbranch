# Sevadal Attendance System

**Sevadal Attendance** is a full-stack volunteer attendance management system built for Sant Nirankari Mission using Remix v2 + Cloudflare Pages / D1 / R2.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Remix v2 (SSR) |
| Hosting | Cloudflare Pages |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 (photos/attachments) |
| Cron | Cloudflare Workers (sevadal-cron) |
| Auth | Member ID + 4-digit PIN (PBKDF2 / WebCrypto) |

## Features

- **Geofenced attendance** — members must be within the configured radius to mark present
- **Schedule-based sessions** — locations can have date/time windows; outside those windows, attendance is blocked
- **Open Seva** — locations with no schedules are always open
- **Role-based access** — Super Admin / Admin / Member with per-user permission overrides
- **Telegram backup** — daily CSV + PDF sent to a Telegram channel at a configurable IST time
- **Announcements** — with image/file attachments, visible to guests on the public news page
- **PWA** — installable as Android home screen app / Play Store TWA
- **Audit log** — every action recorded with actor, target, IP
- **Kill switch** — maintenance mode that blocks members and/or admins

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Copy dev vars
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your secrets

# 3. Create local D1 database
npx wrangler d1 create sevadal-db
# Paste the database_id into wrangler.toml

# 4. Run migrations
npx wrangler d1 execute sevadal-db --local --file=schema-complete.sql

# 5. Start dev server
npm run dev
```

See `DEPLOY.md` for production deployment and `cron-worker/` for Telegram backup setup.

## Project Structure

```
app/
  routes/          # Remix routes (file-based)
    dashboard.tsx  # Member attendance page
    news.tsx       # Public announcements page
    profile.tsx    # Member profile & PIN change
    admin.*.tsx    # Admin panel pages
    api.*.tsx      # API endpoints
  components/      # Shared React components
  lib/             # Server-side utilities
  styles/app.css   # Global styles
cron-worker/       # Cloudflare Worker for scheduled Telegram backup
public/            # PWA assets (manifest, icons, service worker)
```

## Environment Variables

**Local** — create `.dev.vars` (Cloudflare does NOT read `.env`):
```
SESSION_SECRET=your-32-char-secret
TELEGRAM_BOT_TOKEN=123456789:AABBccDDeeff...
TELEGRAM_CHAT_ID=-100123456789
BACKUP_SECRET=any-random-string
```

**Production** — set via Wrangler secrets:
```bash
wrangler secret put SESSION_SECRET
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put BACKUP_SECRET
```
