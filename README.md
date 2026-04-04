# Sevadal Attendance — v5.6+

Digital attendance system for Sant Nirankari Mission Sevadal volunteers.
**Stack:** Remix v2 · Cloudflare Pages · D1 (SQLite) · R2 (storage) · Workers

---

## What's New in v6 (March 2026)

| # | Feature | Change |
|---|---------|--------|
| 1 | Announcement Visibility | Changed from radio buttons (single choice) to **independent checkboxes** (select any combo: Guest, Member, Admin) |
| 2 | Data Migration | Existing announcements auto-migrated to new JSON array format (`show_to_array`) |
| 3 | Empty Visibility | Can now create **invisible announcements** (zero checkboxes selected) for drafts |
| 4 | Logout Location | Moved logout button from bottom-nav to **Profile tab main content** (cleaner UX) |
| 5 | Tab Renaming | Renamed "Home" tab to **"Attendance"** for clarity |
| 6 | Default Tab | Members now land on **Notices tab** instead of Attendance |
| 7 | Telegram Backup | Marked as **mandatory for production**, clear setup instructions |
| 8 | Documentation | Added comprehensive USER_GUIDE.md, TECHNICAL.md, and role-based README section |
| 9 | Dev Setup | Added `.dev.vars.example` template with step-by-step environment setup |

---

## Documentation

- **[USER_GUIDE.md](./USER_GUIDE.md)** — Step-by-step guides for Members, Admins, and Super Admins
- **[TECHNICAL.md](./TECHNICAL.md)** — API docs, rate limits, security, database schema
- **[DEPLOY.md](./DEPLOY.md)** — Production deployment guide
- **[.dev.vars.example](./.dev.vars.example)** — Template for local environment setup

---

| # | Issue | Fix |
|---|-------|-----|
| 1 | `/` redirected to login when not logged in | Now redirects to `/news` (public board). Login is optional |
| 2 | "Something went wrong" crash when clicking Edit on announcements | Two bugs fixed: (a) `onSubmit` was closing the modal before server responded; (b) `BUCKET` undefined locally caused unhandled throw. Action now wrapped in try-catch. Modal closes on `useEffect` watching `actionData.success` |
| 3 | `show_to` dropdown replaced with checkboxes | Now shows radio-style checkboxes: 🌐 Everyone / 👥 Members / 🔐 Admins. Stored as single value with hierarchy |
| 4 | News page `/news` images broken + no preview | Fixed image rendering with `onError` fallback. Added 👁️ eye button on every card. Full lightbox with prev/next arrows and thumbnail strip |
| 5 | Telegram not working with `.env` | Added `.dev.vars.example` — rename to `.dev.vars` for local dev. `wrangler secret put` for production. Test button now shows exact Telegram API error message |
| 6 | `/` as home page | Guests land on `/news`, admins on `/admin`, members on `/dashboard` |

---


---

## What's New in v5.4 (Patch — 29 March 2026)

| # | Issue | Fix |
|---|-------|-----|
| Q1 | Hydration crash (`Something went wrong`) on admin/member dashboard | Added `suppressHydrationWarning` on date-formatted elements (server/client locale mismatch on Windows); null-guarded `useAdminLayout()` |
| Q2 | Telegram not working even with `.env` credentials | Cloudflare Workers **never** read `.env`. Must use `.dev.vars` for local dev and `wrangler secret put` for production. Settings page now shows exact instructions |
| Q3 | How do guests see announcements? | Visit `/news` or `/notice-board` — fully public, no login needed. Shows announcements where audience = "Everyone" |
| Q4 | Announcement images/files never display anywhere | `api.photo.$.tsx` was blocking all requests to `announcements/*` prefix (hard-coded to only allow `photos/*`). Fixed — announcement files are now public. Member photos still require login |
| Q5 | Go-live step-by-step | Added `DEPLOY.md` with complete deployment guide (D1, R2, secrets, cron worker, custom domain, Telegram setup) |
| Q6 | Announcements audience filter in admin | Added filter tabs: All / 🌐 Everyone / 👥 Members / 🔐 Admins. Audience value renamed from confusing `all` → `public`. Backwards compatible with old `all` records |

---

## What's New in v5.3 (Patch — 29 March 2026)

### Bug Fixes

| # | Issue | Fix |
|---|-------|-----|
| 1 | Double announcement banner on Admin & SA dashboard | Removed duplicate banner from `admin._index.tsx`; layout in `admin.tsx` already renders it once |
| 2 | Permission system not enforced on any route | All admin routes now call `getAdminPermissions` + `can()` before executing actions: Members, Locations, Attendance, Announcements, Export CSV/PDF |
| 2 | Permissions page missing admin list with their groups | Added "Current Admin Permissions" table showing each admin's active group + override count |
| 2 | No delete option for Permission Groups | Delete button added; default group is protected from deletion; affected admins are reset to default group automatically |
| 3 | Lat/Lng shown twice in location edit modal | Read-only display now hidden when Manual Entry mode is active (it was always duplicating the editable inputs) |
| 4 | Confirm popup showing literal code string instead of message | Fixed template literal expressions that were accidentally wrapped in quotes (e.g. `"m.is_super_admin?..."` → `` m.is_super_admin?`...` ``) |
| 5 | Images/files not loading in Announcements card on member dashboard | `image_key` is a JSON array of attachments; dashboard was treating it as a raw key. Now correctly parses the array and shows the first image |
| 6 | Audit Log missing many event types | Added audit logging for: member create/edit/delete/activate/deactivate/pin-reset/admin-toggle/SA-toggle, location create/edit/toggle, schedule create/edit/delete, attendance mark (member + admin + bulk), attendance edit/delete, permission group create/update/delete, admin permission assignment |
| 7 | Kill Switch back-button bypasses maintenance page | Maintenance page now pushes a history entry on load and intercepts `popstate` so the back button keeps users on `/maintenance`. Refresh button added → redirects to `/` |
| 8 | No delete option for Satsang Types or Seva Roles | Delete button (🗑) with confirmation dialog added to both pages. Existing attendance records are unaffected |
| 9 | Logout button in member bottom nav misaligned | Form wrapper given `display:flex` + CSS rule added so the button fills its slot identically to the Home and Profile links |

---

## Permissions System

Super Admins bypass all permission checks — they always have everything.

Normal admins are governed by two layers:
1. **Permission Group** — a named set of permissions (e.g. "Attendance Only", "Location only")
2. **Individual Overrides** — additive or subtractive on top of the group

Routes that now enforce permissions server-side:

| Route | Permissions checked |
|-------|-------------------|
| Members | `view_members`, `add_members`, `edit_members`, `delete_members`, `promote_admin` |
| Locations | `add_locations`, `edit_locations`, `toggle_locations`, `add_schedules`, `edit_schedules`, `delete_schedules` |
| Attendance | `mark_attendance`, `bulk_mark_attendance`, `edit_attendance`, `delete_attendance` |
| Announcements | `manage_announcements` |
| Export | `export_data` |
| Audit Log | `view_audit_log` |

---

## Roles & Responsibilities

### Super Admin (SA)
**Who:** System owner, highest privilege level  
**Responsibilities:**
- Creates first admins and assigns permission groups
- Manages app settings, banner, kill switch, maintenance mode
- Configures Telegram backup (mandatory for production)
- Can reset database or data wipe (emergencies only)
- Audits system logs and manages permission overrides

**Cannot be removed:** There must always be at least one SA in the system

### Admin
**Who:** Moderators, location managers, attendance supervisors  
**Responsibilities (based on permission group):**
- Add/edit/remove members
- Create locations and schedules
- Manually mark attendance (for no-app users)
- Create and manage announcements (Notices)
- Export attendance data (CSV/PDF)
- View audit logs (if permitted)
- Manage Satsang types and Seva roles

**Permissions assigned by:** Super Admin via permission groups  
**Default group:** "Full Admin" (all permissions)

### Member
**Who:** Regular Sevadal volunteers  
**Responsibilities:**
- Mark own attendance using GPS at locations
- Keep PIN confidential
- Update own profile (photo, phone, DOB, zone)
- View own attendance history
- Read public and member-level announcements

**Cannot:** Edit other members' data, create announcements, access admin panel

### Guest (Public)
**Who:** Unauthenticated users  
**Access:**
- View `/news` page (public announcements only)
- Click "Login" to access member portal
- Cannot mark attendance or view member data

---

## Setup

### Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`

### Install
```bash
npm install
```

### Local dev (with Cloudflare local bindings)
```bash
npm run dev
```

### Database
Apply migrations in order:
```bash
wrangler d1 execute sevadal-db --local --file=migration.sql
wrangler d1 execute sevadal-db --local --file=migration-v5.sql
wrangler d1 execute sevadal-db --local --file=migration-v6.sql
```

### Deploy
```bash
npm run deploy
```

---

## Environment / Bindings (wrangler.toml)

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 Database | All app data |
| `BUCKET` | R2 Bucket | Member photos, announcement attachments |
| `SESSION_SECRET` | Secret | Cookie signing |
| `TELEGRAM_BOT_TOKEN` | Secret (optional) | Telegram backup bot |
| `TELEGRAM_CHAT_ID` | Secret (optional) | Target chat for backups |

---

## Architecture

```
app/
  routes/
    auth.*          — Login, logout, PIN setup
    dashboard.tsx   — Member home (attendance marking)
    profile.tsx     — Member profile
    admin.tsx       — Admin layout (sidebar, banner)
    admin._index    — Admin dashboard
    admin.members   — Member management
    admin.locations — Location + schedule management
    admin.attendance — Attendance view/mark/edit
    admin.export    — CSV / PDF export UI
    admin.announcements — Notices + file attachments
    admin.audit-log — Filterable audit log
    admin.satsang-types — Satsang type CRUD
    admin.seva-roles    — Seva role CRUD
    admin.permissions   — Permission groups + per-admin assignment
    admin.settings  — App settings, kill switch, data wipe
    maintenance.tsx — Kill switch landing page
    api.*           — Resource routes (photo, export, telegram)
  lib/
    db.server.ts        — All D1 queries
    auth.server.ts      — PIN hashing, session helpers
    session.server.ts   — requireMember / requireAdmin / requireSuperAdmin
    permissions.server.ts — Permission groups, can(), getAdminPermissions()
    permission-types.ts — Permission keys and labels (client-safe)
    audit.server.ts     — logAudit(), getAuditLog()
    audit-labels.ts     — Human-readable action labels
    killswitch.server.ts — Maintenance mode logic
    appsettings.server.ts — App-wide settings (banner, name, etc.)
    geofence.ts         — GPS distance check
    ratelimit.server.ts — Per-member + per-IP rate limiting
    r2.server.ts        — R2 photo URL helper
    pdf.server.ts       — PDF export generation
    telegram.server.ts  — Telegram backup
  components/
    LocationPicker.tsx  — Manual / GPS / Map lat-lng picker
    ConfirmModal.tsx    — Reusable confirm dialog (useConfirm hook)
```

---

## Cron Worker

Standalone worker in `cron-worker/` runs nightly:
- Telegram backup of full D1 database
- Audit log pruning (if retention configured)

Deploy separately:
```bash
cd cron-worker && wrangler deploy
```

---

## License
Internal tool — Sant Nirankari Mission, Mumbai. Not for public distribution.
