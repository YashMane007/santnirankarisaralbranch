# Sevadal Attendance — Full Deploy Guide

Step-by-step for both **local development** and **Cloudflare Pages production**.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | bundled with Node |
| Wrangler CLI | 3+ | `npm install -g wrangler` |
| Git | any | https://git-scm.com |
| Cloudflare account | free | https://dash.cloudflare.com/sign-up |

Verify:
```bash
node -v        # v18.x or higher
npm -v         # 9.x or higher
wrangler -v    # 3.x or higher
```

---

## PART 1 — One-Time Cloudflare Setup

### 1.1 Login to Cloudflare
```bash
wrangler login
# Opens browser — sign in to your Cloudflare account
```

### 1.2 Create D1 Database
```bash
wrangler d1 create sevadal-db
# Output:
# [[d1_databases]]
# binding = "DB"
# database_name = "sevadal-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
Copy the `database_id` — paste it into `wrangler.toml` under `[[d1_databases]]`.

### 1.3 Create R2 Bucket
```bash
wrangler r2 bucket create sevadal-media
```
Already in `wrangler.toml` — no change needed if bucket name matches.

### 1.4 Create KV Namespace
```bash
wrangler kv namespace create SEVADAL_CACHE
# Output: id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```
Paste the `id` into `wrangler.toml` under `[[kv_namespaces]]`.

### 1.5 Generate VAPID Keys (for Push Notifications)
Run this in Node.js:
```bash
node -e "
const { webcrypto } = require('crypto');
const crypto = webcrypto;
(async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const b64u = b => Buffer.from(b).toString('base64url');
  console.log('VAPID_PUBLIC_KEY=' + b64u(pub));
  console.log('VAPID_PRIVATE_KEY_JWK=' + JSON.stringify({...jwk, key_ops:['sign']}));
})();
"
```
Save both outputs — you'll need them in steps below.

`VAPID_SUBJECT` = `mailto:youremail@gmail.com` (any valid mailto or https URL)

---

## PART 2 — Local Development

### 2.1 Clone / Get the Project
```bash
cd /path/to/your/projects
# If from zip: just unzip and cd in
cd sevadal
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Create `.dev.vars`
```bash
cp .dev.vars.example .dev.vars
```
Edit `.dev.vars` — fill in ALL values:
```ini
SESSION_SECRET=any-random-32-char-string-here-123

# Telegram (optional — skip if not using)
TELEGRAM_BOT_TOKEN=123456789:AABBccDDeeffGGhhIIjjKKll
TELEGRAM_CHAT_ID=-100123456789
BACKUP_SECRET=any-random-secret-string

# VAPID keys from Step 1.5 above
VAPID_PUBLIC_KEY=BNqhUAg0UMd4...your-key-here
VAPID_PRIVATE_KEY_JWK={"key_ops":["sign"],"ext":true,"kty":"EC",...}
VAPID_SUBJECT=mailto:youremail@gmail.com
```

**IMPORTANT**: If VAPID keys are missing or empty, push notifications are silently disabled. The app won't crash but no notification permission dialog will appear.

### 2.4 Initialize Local Database

For a **fresh database** (first time):
```bash
wrangler d1 execute sevadal-db --local --file=./schema-complete.sql
```

For an **existing database** that needs updates (run after fresh schema):
```bash
# Only if DB was created without migration-v8 changes:
wrangler d1 execute sevadal-db --local --file=./migration-v8.sql
```

### 2.5 Create Super Admin

Insert your super admin via SQL:
```bash
wrangler d1 execute sevadal-db --local --command="
INSERT INTO members (id, name, phone, is_admin, is_super_admin, is_active)
VALUES ('ADMIN001', 'Your Name', '9876543210', 1, 1, 1);
"
```

Then set their PIN (the app hashes it — use the setup-pin flow):
1. Start dev server (step 2.6)
2. Go to `http://localhost:8788/auth/login`
3. Login with member ID `ADMIN001` — it redirects to PIN setup
4. Set a 4-digit PIN

### 2.6 Start Dev Server
```bash
npm run dev
# App runs at: http://localhost:8788
```

**That's it for local.** Changes to `app/` files hot-reload automatically.

---

## PART 3 — Production Deployment

### 3.1 Push Production Database Schema

For **first deploy** (fresh production DB):
```bash
wrangler d1 execute sevadal-db --file=./schema-complete.sql
```

For **existing production DB** (adding new tables/columns):
```bash
wrangler d1 execute sevadal-db --file=./migration-v8.sql
```

If migration-v8 throws error on `ALTER TABLE` (column already exists), that's OK — D1 will skip it.

### 3.2 Set Production Secrets

Each secret is set once. Run all of these:
```bash
wrangler secret put SESSION_SECRET
# Paste: any-random-32-char-string

wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: your Telegram bot token (or press Enter to skip)

wrangler secret put TELEGRAM_CHAT_ID
# Paste: your Telegram group chat ID

wrangler secret put BACKUP_SECRET
# Paste: any random string (shared with cron worker)

wrangler secret put VAPID_PUBLIC_KEY
# Paste: VAPID_PUBLIC_KEY from Step 1.5

wrangler secret put VAPID_PRIVATE_KEY_JWK
# Paste: full JSON string from Step 1.5

wrangler secret put VAPID_SUBJECT
# Paste: mailto:youremail@gmail.com
```

Verify secrets exist:
```bash
wrangler secret list
```

### 3.3 Build and Deploy Main App
```bash
npm run build
wrangler pages deploy ./build/client
# Or push to GitHub and use Cloudflare Pages CI (recommended)
```

**Cloudflare Pages CI setup** (preferred):
1. Go to Cloudflare Dashboard → Pages → Create a Project
2. Connect your GitHub repo
3. Build command: `npm run build`
4. Build output dir: `./build/client`
5. Add environment variables (same as secrets above) in Pages dashboard → Settings → Environment Variables
6. Every `git push` auto-deploys

### 3.4 Deploy Cron Worker

The cron worker handles Telegram backups and session reminders.

```bash
cd cron-worker
```

Edit `wrangler.toml` in `cron-worker/`:
```toml
name = "sevadal-cron"
main = "index.ts"
compatibility_date = "2024-09-23"

[triggers]
crons = ["* * * * *"]   # every minute

[vars]
APP_URL = "https://your-project.pages.dev"   # ← your actual URL
```

Set cron worker secrets:
```bash
wrangler secret put BACKUP_SECRET
# Same value as main app's BACKUP_SECRET
```

Deploy:
```bash
wrangler deploy
```

Verify:
```bash
# Trigger manually to test
curl https://sevadal-cron.your-account.workers.dev/trigger
```

```bash
cd ..  # back to project root
```

### 3.5 Create Production Super Admin
```bash
wrangler d1 execute sevadal-db --command="
INSERT OR IGNORE INTO members (id, name, phone, is_admin, is_super_admin, is_active)
VALUES ('ADMIN001', 'Your Name', '9876543210', 1, 1, 1);
"
```
Then visit your production URL, login as ADMIN001, set PIN.

---

## PART 4 — Push Notifications Setup Verification

Push notifications need VAPID keys + service worker + user permission.

### Check if VAPID keys are working:
```bash
# Local
curl http://localhost:8788/api/push-notify \
  -H "Cookie: YOUR_SESSION_COOKIE"

# Check push_subscriptions table (should have rows after members login)
wrangler d1 execute sevadal-db --command="SELECT COUNT(*) FROM push_subscriptions;"
```

### How notification permission works:
1. Member opens app → goes to dashboard
2. App requests **Location** permission → **same dialog chain** triggers **Notification** permission
3. Member allows both → browser registers push subscription → stored in `push_subscriptions`
4. Cron worker fires `api/session-reminders` every minute → sends push if session is tomorrow

### If push_subscriptions is still empty:
- **Most likely**: VAPID_PUBLIC_KEY secret not set in production → `window.__VAPID_PUBLIC_KEY__` is empty → push code bails silently
- Fix: `wrangler secret put VAPID_PUBLIC_KEY` → redeploy
- Ask members to refresh the app and allow notifications when prompted

---

## PART 5 — Telegram Backup Setup

### 5.1 Create Bot
1. Open Telegram → search `@BotFather`
2. `/newbot` → give it a name → get token like `123456789:AABBcc...`

### 5.2 Get Chat ID
1. Create a Telegram group
2. Add your bot to the group
3. Send any message in the group
4. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Find `"chat": { "id": -100XXXXXXXXX }` — that's your chat ID

### 5.3 Enable in Settings
Login as super admin → Admin → Settings → Enable Telegram Backup → set backup time.

### 5.4 Test Backup
```bash
curl "https://your-project.pages.dev/api/telegram-backup?secret=YOUR_BACKUP_SECRET"
```

---

## PART 6 — Updating Existing Deployment

When new code changes arrive:

```bash
# 1. Pull latest code
git pull

# 2. Install any new deps
npm install

# 3. Run new migrations (safe if tables already exist)
wrangler d1 execute sevadal-db --file=./migration-v8.sql        # production
wrangler d1 execute sevadal-db --local --file=./migration-v8.sql # local

# 4. Build
npm run build

# 5. Deploy
wrangler pages deploy ./build/client

# 6. Redeploy cron if changed
cd cron-worker && wrangler deploy && cd ..
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `wrangler: command not found` | `npm install -g wrangler` |
| `D1_ERROR: no such table` | Run schema-complete.sql on that DB |
| PDF shows `-` for Admin Marked At | Run migration-v8.sql; deploy updated `api.export.tsx` |
| Push notifications not working | Set VAPID secrets; redeploy; members must refresh app |
| Notification dialog never appears | VAPID_PUBLIC_KEY missing in production secrets |
| Telegram backup not sending | Check BACKUP_SECRET matches in both main app and cron worker |
| 404 on all routes | `functions/_middleware.ts` is missing or not deployed |
| GPS shows ±50000m | Normal if browser can't get GPS — members should enable GPS |
| `KV namespace not found` | Create KV namespace + paste ID in wrangler.toml |

---

## File Reference

```
sevadal/
├── app/                    ← Remix app source
│   ├── routes/             ← All pages and API routes
│   └── lib/                ← Server-side utilities
├── functions/
│   └── _middleware.ts      ← REQUIRED — do not delete
├── cron-worker/            ← Separate Cloudflare Worker for cron
│   ├── index.ts
│   └── wrangler.toml       ← Cron-specific config
├── public/
│   ├── sw.js               ← Service worker (push notifications)
│   └── manifest.json       ← PWA manifest
├── schema-complete.sql     ← Full schema — use on fresh DB
├── migration-v8.sql        ← Apply on existing DB for latest changes
├── .dev.vars               ← Local secrets (never commit this)
├── .dev.vars.example       ← Template for .dev.vars
└── wrangler.toml           ← Cloudflare binding config
```
