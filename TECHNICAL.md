# Sevadal Attendance — Technical Documentation

**Version:** 5.6+  
**Last Updated:** March 30, 2026  
**Stack:** Remix v2 · Cloudflare Pages · D1 (SQLite) · R2 (object storage) · Workers

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Rate Limiting](#rate-limiting)
4. [Security](#security)
5. [Database Schema](#database-schema)
6. [Environment Variables](#environment-variables)
7. [Deployment](#deployment)
8. [Monitoring & Logging](#monitoring--logging)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ Cloudflare Pages (CDN)                              │
│ ├─ Static assets (CSS, JS, images)                  │
│ └─ Remix SSR server (Node.js runtime)               │
└───────────┬──────────────────┬──────────────────────┘
            │                  │
    ┌───────▼──────┐    ┌──────▼────────┐
    │ D1 Database  │    │ R2 Bucket      │
    │ (SQLite)     │    │ (Media files)  │
    │ members      │    │ /announcements │
    │ attendance   │    │ /photos        │
    │ locations    │    │ /exports       │
    │ schedules    │    └────────────────┘
    │ etc          │
    └──────────────┘

┌──────────────────────────────┐
│ Cloudflare Workers (Cron)    │
│ /cron-worker/index.ts        │
│ • Daily Telegram backup      │
│ • Audit log cleanup          │
└──────────────────────────────┘
```

### Data Flow

1. **User → App:** Browser/mobile app makes HTTP request
2. **App → Remix:** Cloudflare Pages routes to Remix server
3. **Remix → DB:** Query/insert data via D1
4. **Remix → R2:** Store/retrieve files from object bucket
5. **Remix → Browser:** Returns HTML/JSON response
6. **Cron Worker:** Runs daily at configured time, backs up DB to Telegram

---

## API Endpoints

### Authentication Routes

#### `POST /auth/login`
**Purpose:** Authenticate a member with PIN  
**Request:**
```json
{
  "intent": "login",
  "memberId": "SNM-003",
  "pin": "1234"
}
```
**Response (Success - 200):**
```json
{
  "sessionId": "abc123...",
  "memberId": "SNM-003",
  "isAdmin": false,
  "isSuperAdmin": false
}
```
**Response (Failure - 401):**
```json
{
  "error": "Invalid member ID or PIN"
}
```
**Rate Limit:** 5 attempts per 15 minutes per IP  
**Security:** PIN hashed with PBKDF2, session stored in signed cookie

---

#### `POST /auth/logout`
**Purpose:** End user session  
**Request:** Form POST (no body)  
**Response:** Redirect to `/news`  
**Headers:** Clears `session` cookie

---

#### `POST /auth/setup-pin` (First-time admin setup)
**Purpose:** Create first super admin if none exists  
**Request:**
```json
{
  "intent": "setup",
  "memberId": "SNM-001",
  "pin": "1234"
}
```
**Response (Success - 200):** Redirected to admin dashboard  
**Preconditions:** Only works if zero super admins exist in database

---

### Attendance Routes

#### `POST /api/attendance/mark`
**Purpose:** Mark attendance (member can only mark themselves)  
**Authentication:** Requires `session` cookie with memberId  
**Request:**
```json
{
  "lat": 28.6139,
  "lng": 77.2090,
  "accuracy": 8.5,
  "sevaRole": "Guard / Security",
  "scheduleIds": [1, 2]
}
```
**Response (Success - 200):**
```json
{
  "success": true,
  "locationName": "Delhi Satsang Center"
}
```
**Response (Errors):**
```json
{
  "error": "You are 150m from Location X. Must be within 200m."
}
```
**Rate Limit:** 10 marks per member per hour, 30 per IP per hour  
**Geofencing:** Validates GPS is within location radius  
**Audit Log:** Logged with member ID, location, time, IP

---

#### `GET /api/attendance/history`
**Purpose:** Retrieve member's attendance records  
**Authentication:** Requires `session` cookie  
**Query Parameters:**
- `limit` (default 50): Max records to return
- `startDate` (optional): ISO date to filter from
- `endDate` (optional): ISO date to filter to

**Response:**
```json
[
  {
    "id": 123,
    "date": "2026-03-30",
    "location_name": "Delhi Satsang",
    "seva_role": "Guard",
    "marked_at": "2026-03-30T05:45:00Z",
    "session_label": "Morning Satsang"
  }
]
```

---

#### `POST /admin/attendance/mark-manual`
**Purpose:** Admin marks attendance for a member  
**Authentication:** Requires admin session + `mark_attendance` permission  
**Request:**
```json
{
  "intent": "manual-mark",
  "memberId": "SNM-005",
  "date": "2026-03-30",
  "locationId": 1,
  "sevaRole": "Kitchen",
  "scheduleId": 0
}
```
**Response (Success - 200):** Attendance record created  
**Audit Log:** Recorded as "manual_mark" with admin ID

---

### Announcements (Notices) Routes

#### `GET /api/announcements`
**Purpose:** List announcements for current user  
**Authentication:** Optional (determines visibility)  
**Query Parameters:**
- `showTo`: "guest" (default), "member", or "admin"
- `activeOnly`: true/false (default true)

**Response:**
```json
[
  {
    "id": 1,
    "title": "Annual Satsang Schedule",
    "body": "2026 schedule announced...",
    "image_key": "[{\"key\":\"announcements/abc123.jpg\",\"name\":\"Schedule.jpg\"}]",
    "type": "notice",
    "show_to_array": "[\"guest\",\"member\"]",
    "is_pinned": 1,
    "created_at": "2026-03-20T10:30:00Z",
    "expires_at": null
  }
]
```
**Visibility Logic:**
- **Guests:** See announcements with "guest" in show_to_array
- **Members:** See "guest" + "member" announcements
- **Admins:** See all announcements

---

#### `POST /admin/announcements`
**Purpose:** Create or update announcement  
**Authentication:** Requires admin session + `manage_announcements` permission  
**Request (Create):**
```json
{
  "intent": "create",
  "title": "Weekly Meeting",
  "body": "This week's meeting is on Friday.",
  "type": "notice",
  "show_to_array": "[\"guest\",\"member\"]",
  "is_pinned": "0",
  "expires_at": "2026-04-30T23:59:59"
}
```
**Files:** Multipart form data for image/PDF attachments  
**Response:** Success message or error

---

### Media Routes

#### `GET /api/photo/:fileKey`
**Purpose:** Retrieve file from R2 bucket  
**Path Parameters:**
- `fileKey`: URL-encoded file path (e.g., `announcements/abc123.jpg`)

**Access Control:**
- `/announcements/*`: Public (unauthenticated)
- `/photos/:memberId/*`: Requires authentication
- Expired announcements still serve files if URL known

**Response (200):** File with proper MIME type  
**Response (404):** File not found  
**Cache:** Files cached for 7 days on Cloudflare edge

---

#### `POST /admin/members/:memberId/photo`
**Purpose:** Upload member profile photo  
**Authentication:** Requires member session (own photo) OR admin  
**Request:** Multipart form data
```
file: <binary image data>
```
**File Limits:** Max 3MB, JPG/PNG/WebP only  
**Response (200):**
```json
{
  "success": true,
  "photoUrl": "/api/photo/photos/SNM-003/abc123.jpg"
}
```

---

### Export Routes

#### `GET /admin/export/csv`
**Purpose:** Export attendance as CSV  
**Authentication:** Requires admin + `export_data` permission  
**Query Parameters:**
- `startDate` (required): ISO date
- `endDate` (required): ISO date
- `columns` (optional): Comma-separated field names

**Response:** CSV file download  
**Example Columns:**
```
date, member_id, member_name, location_name, seva_role, marked_at
2026-03-30,SNM-001,Amit Kumar,Delhi Satsang,Guard,05:30
```

---

#### `GET /admin/export/pdf`
**Purpose:** Export attendance as PDF report  
**Authentication:** Requires admin + `export_data` permission  
**Query Parameters:** Same as CSV  
**Response:** PDF file download with formatted report

---

### Member Management Routes

#### `GET /admin/members`
**Purpose:** List all members  
**Authentication:** Requires admin + `view_members` permission  
**Query Parameters:**
- `search`: Filter by name, ID, or zone
- `activeOnly`: true (default) or false
- `sortBy`: "name" (default), "id", "created_at"

**Response:**
```json
[
  {
    "id": "SNM-001",
    "name": "Amit Kumar",
    "phone": "9876543210",
    "zone": "East",
    "is_active": 1,
    "is_admin": 0,
    "is_super_admin": 0,
    "pin_set": 1,
    "created_at": "2026-01-15T10:00:00Z"
  }
]
```

---

#### `POST /admin/members`
**Purpose:** Create new member  
**Authentication:** Requires admin + `add_members` permission  
**Request:**
```json
{
  "intent": "create",
  "id": "SNM-101",
  "name": "Priya Sharma",
  "phone": "8765432109",
  "dob": "1995-06-15",
  "gender": "Female",
  "zone": "North"
}
```
**Response:** Member created, ready for PIN setup by admin

---

#### `POST /admin/members/:memberId`
**Purpose:** Edit member  
**Authentication:** Requires admin + `edit_members` permission  
**Request:**
```json
{
  "intent": "edit",
  "phone": "9999999999",
  "zone": "South",
  "is_admin": 1
}
```
**Response:** Updated

---

#### `POST /admin/members/:memberId/reset-pin`
**Purpose:** Generate one-time PIN for member  
**Authentication:** Requires admin  
**Response:**
```json
{
  "tempPin": "7392",
  "message": "Share this PIN with member, valid for 1 login only"
}
```

---

## Rate Limiting

### Strategy
Rate limits prevent abuse and ensure fair resource access. Implemented using sliding window counters in D1 rate_limits table.

### Limits by Action

| Action | Limit | Window | Per | Reason |
|--------|-------|--------|-----|--------|
| Attendance Mark | 10 | 1 hour | Member | Prevent spam marking |
| Attendance Mark | 30 | 1 hour | IP | Prevent coordinated abuse |
| Login Attempt | 5 | 15 min | IP | Prevent brute force |
| API Calls (general) | 100 | 1 min | Session | Prevent resource exhaustion |
| File Upload | 1 | 5 sec | Session | Prevent upload floods |
| Password Change | 1 | 1 hour | Member | Prevent lockout loops |

### How It Works
1. Request comes in, `memberId` and IP extracted
2. Check `rate_limits` table for `attend:member:{memberId}` key
3. If count < limit and window not expired, allow
4. Increment count, update window_start if needed
5. If limit exceeded, return 429 Too Many Requests

### Error Response (429)
```json
{
  "error": "Too many attempts. Please wait a while, or ask an admin to mark your attendance."
}
```

---

## Security

### 1. Authentication

**PIN System:**
- Stored as PBKDF2 hash (SHA-256, 100,000 iterations)
- Salt: 16 random bytes per member
- Never transmitted plaintext
- Weak PINs blocked: 1111, 2222, 1234, 1357, etc.

**Session Management:**
- Signed JWT-like cookie using SESSION_SECRET
- 7-day expiration (sliding window on each request)
- Httponly flag (cannot be accessed via JavaScript)
- Secure flag (HTTPS only in production)
- SameSite=Strict (prevents CSRF)

---

### 2. Authorization

**Role-Based Access Control (RBAC):**
- Super Admin: Bypasses all permission checks
- Admin: Governed by Permission Group + Individual Overrides
- Member: Can only access own data
- Guest: Can only view public announcements

**Permission Checks:**
```typescript
// Example: Mark attendance
if (!can(perms, "mark_attendance")) {
  return json({ error: "Insufficient permissions" }, { status: 403 });
}
```

**Permissions:**
- `view_members` — See member list
- `add_members` — Create new members
- `edit_members` — Modify member details
- `delete_members` — Remove members
- `promote_admin` — Make someone admin
- `view_locations` — See locations
- `add_locations` — Create locations
- `edit_locations` — Modify locations
- `toggle_locations` — Activate/deactivate
- `add_schedules` — Create schedules
- `edit_schedules` — Modify schedules
- `delete_schedules` — Remove schedules
- `view_attendance` — See attendance records
- `mark_attendance` — Mark attendance (own or others)
- `edit_attendance` — Modify records
- `delete_attendance` — Remove records
- `export_data` — Export to CSV/PDF
- `manage_announcements` — Create/edit notices
- `view_audit_log` — See action logs

---

### 3. Data Protection

**Geofencing:**
- Member GPS must be within specified radius of location
- Default: 200m, configurable per location
- Prevents false attendance from remote locations
- Accuracy checked: rejects if >50m accuracy error

**GPS Accuracy Validation:**
```javascript
// Only accept GPS with accuracy <= 50m
if (gps.accuracy > 50) {
  return json({ error: "GPS accuracy too low. Try again in open sky." });
}
```

**Encryption in Transit:**
- All production traffic HTTPS only
- TLS 1.3 enforced by Cloudflare
- HSTS headers set (365 days)

**Encryption at Rest:**
- D1 database: Default encryption by Cloudflare
- R2 bucket: Default encryption by Cloudflare
- Backups (Telegram): Messages encrypted by Telegram

---

### 4. Input Validation

**Member ID:**
- Format: `^[A-Z0-9\-]{3,20}$`
- Alphanumeric + hyphens only

**PIN:**
- Format: `^\d{4}$` (exactly 4 digits)
- Weak PINs rejected server-side

**Names:**
- Max 100 chars
- Trimmed, no leading/trailing whitespace

**Phone:**
- Max 20 chars
- No validation (supports international)

**GPS Coordinates:**
- Valid latitude: -90 to 90
- Valid longitude: -180 to 180
- Accuracy: positive number

**Email/URLs:**
- Not currently used in app

---

### 5. Audit Logging

**What's Logged:**
- Member create/edit/delete/activate/deactivate
- PIN changes
- Admin promotions
- Attendance marks (manual + GPS)
- Announcement create/edit/delete
- Location changes
- Permission changes
- Settings changes
- Data exports

**Fields Recorded:**
```typescript
interface AuditLog {
  actor_id: string;         // Who did it
  actor_name: string;
  actor_role: "member" | "admin" | "super_admin";
  action: string;           // What action
  target_type?: string;     // What was affected (member, announcement, etc)
  target_id?: string;
  details?: string;         // JSON object with context
  ip_address?: string;      // From where
  lat?: number;             // GPS if available
  lng?: number;
  created_at: string;       // When (ISO 8601)
}
```

**Retention Policy:**
- Default: 0 (keep forever)
- Configurable: Admin can set retention days
- Old logs auto-deleted nightly

---

### 6. Backup & Disaster Recovery

**Daily Backup to Telegram (Mandatory):**
- Cron worker runs daily at configured time (IST)
- Exports full D1 database + file list
- Sends CSV to Telegram group/channel
- Timestamp + backup hash included
- Stored in Telegram (encrypted, 2FA recommended)

**How to Restore from Backup:**
1. Get backup CSV from Telegram
2. Run: `wrangler d1 execute sevadal-db --file=backup.sql`
3. Verify data integrity
4. Manual: Download backup, import to new D1 instance

---

### 7. CORS & Security Headers

**CORS Policy:**
- Same-origin only (requests from same domain)
- No cross-domain requests allowed
- Prevents unauthorized API access from other sites

**Security Headers (Set by Cloudflare):**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```

---

## Database Schema

### Core Tables

```sql
-- Members
CREATE TABLE members (
  id TEXT PRIMARY KEY,              -- SNM-001
  name TEXT NOT NULL,
  phone TEXT,
  dob TEXT,                         -- YYYY-MM-DD
  gender TEXT,                      -- Male, Female, Other
  zone TEXT,
  pin_hash TEXT,                    -- PBKDF2 hash
  pin_salt TEXT,                    -- 16-byte hex
  pin_set INTEGER,                  -- 0 or 1
  is_admin INTEGER DEFAULT 0,       -- 0 or 1
  is_super_admin INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  photo_key TEXT,                   -- R2 path
  created_at TEXT,
  updated_at TEXT
);

-- Attendance Records
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  member_name TEXT,
  seva_role TEXT,
  location_id INTEGER,
  location_name TEXT,
  date TEXT,                        -- YYYY-MM-DD
  marked_at TEXT,                   -- ISO 8601 timestamp
  lat REAL,
  lng REAL,
  accuracy REAL,                    -- meters
  distance_meters INTEGER,          -- from location center
  schedule_id INTEGER DEFAULT 0,
  satsang_type TEXT,
  session_label TEXT,
  marked_by_id TEXT,                -- NULL for self-mark
  marked_by_name TEXT,
  UNIQUE(member_id, date, schedule_id)
);

-- Locations
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_meters INTEGER DEFAULT 200,
  is_active INTEGER DEFAULT 1,
  created_at TEXT
);

-- Location Schedules (Satsang/Seva sessions)
CREATE TABLE location_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  label TEXT NOT NULL,              -- Morning Satsang
  satsang_type_name TEXT,           -- Normal, EMS, Mahila
  date TEXT NOT NULL,               -- YYYY-MM-DD
  all_day INTEGER DEFAULT 0,
  start_time TEXT,                  -- HH:MM
  end_time TEXT,                    -- HH:MM
  is_active INTEGER DEFAULT 1,
  created_at TEXT
);

-- Announcements
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  image_key TEXT,                   -- JSON array of {key, name, type}
  type TEXT DEFAULT 'notice',       -- notice, poster, contact, gallery
  show_to TEXT,                     -- LEGACY: public, members, admins
  show_to_array TEXT,               -- JSON array: ["guest","member","admin"]
  is_active INTEGER DEFAULT 1,
  is_pinned INTEGER DEFAULT 0,
  created_by TEXT,                  -- Admin ID
  created_at TEXT,
  expires_at TEXT                   -- ISO 8601, NULL = never expires
);

-- Satsang Types
CREATE TABLE satsang_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- Normal Satsang, EMS, etc
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

-- Seva Roles
CREATE TABLE seva_roles_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- Guard, Kitchen, Parking
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

-- Audit Log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,                  -- member, admin, super_admin
  action TEXT NOT NULL,             -- attendance_marked, member_created, etc
  target_type TEXT,                 -- announcement, location, etc
  target_id TEXT,
  details TEXT,                     -- JSON object
  ip_address TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT
);

-- Admin Permissions
CREATE TABLE admin_permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- Full Admin, Attendance Only
  permissions TEXT NOT NULL,        -- JSON array of permission keys
  is_default INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE admin_permissions (
  member_id TEXT PRIMARY KEY,
  group_id INTEGER,                 -- FK to permission_groups
  overrides TEXT DEFAULT '{}',      -- JSON: {permission: +1 or -1}
  updated_at TEXT
);

-- Rate Limiting
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,             -- attend:member:{id}, attend:ip:{ip}
  count INTEGER DEFAULT 1,
  window_start TEXT NOT NULL
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

---

## Environment Variables

### Local Development (.dev.vars)

```ini
# REQUIRED
SESSION_SECRET=<32+ random chars>

# OPTIONAL: Telegram
TELEGRAM_BOT_TOKEN=<bot token from @BotFather>
TELEGRAM_CHAT_ID=<group/channel ID>
BACKUP_SECRET=<random string for cron auth>
```

### Production (wrangler secret put)

```bash
wrangler secret put SESSION_SECRET
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put BACKUP_SECRET
```

### wrangler.toml (Bindings)

```toml
[[d1_databases]]
binding = "DB"
database_name = "sevadal-db"
database_id = "YOUR_DB_ID"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "sevadal-media"

[env.production]
routes = [
  { pattern = "example.com/*", zone_name = "example.com" }
]
```

---

## Deployment

### Step 1: Create D1 Database
```bash
wrangler d1 create sevadal-db
```
Copy `database_id` to `wrangler.toml`

### Step 2: Create R2 Bucket
```bash
wrangler r2 bucket create sevadal-media
```

### Step 3: Run Migrations
```bash
wrangler d1 execute sevadal-db --file=migration.sql --remote
wrangler d1 execute sevadal-db --file=migration-v6.sql --remote
```

### Step 4: Set Secrets
```bash
wrangler secret put SESSION_SECRET
# Paste: openssl rand -hex 32

wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: your bot token

wrangler secret put TELEGRAM_CHAT_ID
# Paste: your chat ID

wrangler secret put BACKUP_SECRET
# Paste: random string
```

### Step 5: Deploy App
```bash
npm run build
npm run deploy
```

### Step 6: Deploy Cron Worker
```bash
cd cron-worker
wrangler deploy
```

### Step 7: Add Custom Domain
```
Cloudflare Dashboard → Pages → sevadal-attendance → Custom Domains
Add: sevadal.example.com
```

---

## Monitoring & Logging

### Cloudflare Analytics
- **Pages:** Requests, bandwidth, error rates
- **Workers:** CPU time, failures
- **R2:** Object count, storage used, bandwidth

### Application Logs
- Audit log table (queryable in app)
- Browser console (development)
- Telegram daily backup (metadata only)

### How to Check for Errors

**In Cloudflare Dashboard:**
1. Go to Pages → sevadal-attendance → Analytics
2. Check error rate and top errors
3. Click error code for details

**In Database:**
```sql
-- Recent errors from audit log
SELECT action, details, ip_address, created_at
FROM audit_log
WHERE action LIKE '%error%'
ORDER BY created_at DESC
LIMIT 20;
```

**Monitor Telegram Backups:**
- Check Telegram group daily for backup message
- Verify timestamp matches expected backup time
- If missing, manually trigger via admin settings

---

**Document Version:** 1.0  
**Last Updated:** March 30, 2026  
**Maintainer:** System Admin
