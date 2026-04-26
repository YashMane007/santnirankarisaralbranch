# Implementation Summary

## v7.2 — Patch (April 2026)

### Bug Fixes

**Geofence location mismatch** (`dashboard.tsx`)
- Root cause: `checkGeofence()` compared member GPS against ALL active locations and returned the mathematically closest one (could be wrong location entirely)
- Fix: Action now scopes the check to only the selected session's location — Open Seva → noSchedLocs only, scheduled session → that session's location only

**Telegram backup time ignored** (`api.telegram-backup.tsx`, `cron-worker/wrangler.toml`)
- Root cause: Cron schedule was hardcoded in `wrangler.toml`; changing backup time in Admin had no effect
- Fix: Cron now runs every 30 min (`*/30 * * * *`); API endpoint checks current IST time vs configured `telegram_backup_time` and skips if outside ±20 min window. Append `?force=1` to skip time check

**PWA install banner broken** (`components/PWAInstallPrompt.tsx`)
- Root cause: Component rendered always (no conditional), style was empty `{}`
- Fix: Returns `null` when not showing; proper flex layout; 7-day dismiss cooldown via localStorage

### New Features

**Delete Location** (`admin.locations.tsx`, `db.server.ts`)
- Added 🗑️ Delete button to each location tile in admin
- Confirm dialog warns about cascading schedule deletion
- Requires `edit_locations` permission

**Seva Role validation error** (`dashboard.tsx`)
- Previously: Mark Present button silently disabled when no seva role selected
- Now: Clicking button without a role shows visible inline error message; button is always active (not disabled)

**Skeleton loading** (`app.css`, `dashboard.tsx`, `news.tsx`, `profile.tsx`, `admin.tsx`)
- Skeleton screens shown during Remix navigation transitions on all member-facing pages
- Admin layout shows top progress bar (saffron gradient) during page loads

**News page image lazy loading** (`news.tsx`)
- All `<img>` tags now have `loading="lazy" decoding="async"` — browser only loads images as they scroll into view

### UI / Style Improvements (`app.css`)

- **Stronger contrast** on member pages: hero gradient darker, text colors stronger, GPS status bolder
- **Bottom nav active state** more prominent (saffron color + bold)
- **Mobile fill** — on true mobile (<480px), member shell fills 100% screen width with no box-shadow
- **Admin mobile** — sidebar collapses to top bar on small screens
- **Attend button** — taller tap target (64px), bolder gradient

---

## Earlier Versions

| Version | Key changes |
|---------|-------------|
| v7.1 | Cron worker, Telegram backup CSV + PDF |
| v7.0 | Cloudflare R2 media, announcements with attachments |
| v6.x | OpenStreetMap location picker, public /news page, PWA TWA |
| v5.x | Per-user admin permissions, audit log, kill switch |
| v4.x | Geofenced attendance, schedule-based sessions, seva roles |
| v3.x | Initial Cloudflare D1 migration from Firebase |
