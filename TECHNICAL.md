# Technical Reference

## Architecture

```
Browser (PWA/TWA)
      │
      ▼
Cloudflare Pages (Remix SSR)
  ├── app/routes/       Remix file-based routing
  ├── app/lib/          Server-only utilities
  ├── functions/        Cloudflare Pages middleware
  │
  ├── D1 (SQLite)       Members, attendance, locations, settings, audit log
  ├── R2                Profile photos, announcement attachments
  └── Cron Worker       Scheduled Telegram backup (every 30 min, time-gated)
```

## Authentication

- Member ID (e.g. `SNM001`) + 4-digit PIN
- PIN hashed with PBKDF2 / WebCrypto (100,000 iterations, SHA-256)
- Session stored in signed cookie (cookie-based, no JWT)
- Roles: `member`, `admin`, `super_admin`
- Per-user permission overrides via `admin_permissions` table

## Geofencing

`app/lib/geofence.ts` — pure Haversine distance formula (server-side, not bypassable by client). Each location has a `radius_meters` field. On attendance mark:

1. GPS coordinates submitted from browser
2. Server computes distance to **the selected session's location only** (not all locations)
3. If distance > radius → rejected with exact distance shown

## Telegram Backup

- Cron worker (`cron-worker/`) runs every 30 minutes via Cloudflare Workers cron
- Calls `/api/telegram-backup?secret=...`
- Endpoint checks: enabled? correct day? within ±20 min of configured IST backup time?
- Sends summary message + CSV file + PDF report to Telegram channel
- Append `?force=1` to override time check for manual triggers

## Key DB Tables

| Table | Purpose |
|-------|---------|
| `members` | Member profiles + hashed PINs |
| `locations` | Satsang bhavans with GPS + radius |
| `location_schedules` | Date/time windows per location |
| `attendance` | Attendance records (UNIQUE on member+date+schedule) |
| `announcements` | News/notices with file attachments |
| `settings` | Key-value app configuration |
| `audit_log` | Immutable action log |
| `rate_limits` | Per-member + per-IP rate limiting |

## PDF Export

`app/lib/pdf.server.ts` — pure JS PDF generation (no puppeteer / headless chrome). Cloudflare edge compatible. Outputs simple table layout with org branding.

## PWA

- `public/manifest.json` — app manifest
- `public/sw.js` — service worker (offline fallback)
- `public/offline.html` — offline page
- `app/components/PWAInstallPrompt.tsx` — install banner (7-day dismiss cooldown)

## Permission System

```
can(perms, "add_locations")     → boolean
can(perms, "edit_locations")
can(perms, "toggle_locations")
can(perms, "delete_locations")
can(perms, "mark_attendance")
... etc
```

Super admins bypass all permission checks. Regular admins start with defaults; overrides stored per-user in `admin_permissions` table.
