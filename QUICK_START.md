# Sevadal Attendance v6 — Quick Start

**Copy & paste these commands in order**

---

## LOCAL DEVELOPMENT SETUP

### 1. Install Node dependencies
```bash
npm install
```

### 2. Create environment file
```bash
cp .dev.vars.example .dev.vars
```

### 3. Edit .dev.vars and add SESSION_SECRET
```bash
# Generate random secret
openssl rand -hex 32

# Open .dev.vars and set:
SESSION_SECRET=<paste_the_32_char_string>

# Optional: Add Telegram credentials if you have them
TELEGRAM_BOT_TOKEN=<your_bot_token>
TELEGRAM_CHAT_ID=<your_chat_id>
BACKUP_SECRET=<random_string>
```

### 4. Run database migrations (LOCAL)
```bash
# Initial schema
wrangler d1 execute sevadal-db --local --file=migration.sql

# Permissions and audit log
wrangler d1 execute sevadal-db --local --file=migration-v5.sql

# NEW: Announcement visibility checkboxes
wrangler d1 execute sevadal-db --local --file=migration-v6.sql
```

### 5. Start dev server
```bash
npm run dev
```

Open: `http://localhost:5173`

### 6. First login (create first super admin)
- Visit: `http://localhost:5173/auth/setup-pin`
- Create your member account
- You'll be promoted to Super Admin
- Login with your PIN

---

## PRODUCTION DEPLOYMENT

### 1. Ensure logged into Cloudflare
```bash
wrangler login
```

### 2. Create D1 database (if not exists)
```bash
wrangler d1 create sevadal-db
# Copy the database_id and paste into wrangler.toml
```

### 3. Create R2 bucket
```bash
wrangler r2 bucket create sevadal-media
```

### 4. Run migrations on REMOTE database
```bash
wrangler d1 execute sevadal-db --remote --file=migration.sql
wrangler d1 execute sevadal-db --remote --file=migration-v5.sql
wrangler d1 execute sevadal-db --remote --file=migration-v6.sql
```

### 5. Set production secrets
```bash
# Required
wrangler secret put SESSION_SECRET
# Paste: openssl rand -hex 32

# Optional but recommended for daily backups
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: your bot token

wrangler secret put TELEGRAM_CHAT_ID
# Paste: your chat ID

wrangler secret put BACKUP_SECRET
# Paste: openssl rand -hex 16
```

### 6. Build and deploy app
```bash
npm run build
npm run deploy
```

You'll get a URL like: `https://sevadal-attendance.pages.dev`

### 7. Deploy cron worker (for daily backup)
```bash
cd cron-worker
wrangler deploy
cd ..
```

### 8. Add custom domain (optional)
```
Cloudflare Dashboard → Pages → sevadal-attendance → Custom Domains
Add your domain (e.g., sevadal.example.com)
Wait for SSL certificate (auto-issued by Cloudflare)
```

---

## VERIFY EVERYTHING WORKS

### 1. Test login
- Visit your deployed URL
- Login as the super admin account created during setup
- Should see admin dashboard

### 2. Test announcement visibility (NEW FEATURE)
- Go to Admin → Announcements → Create New
- Check "Guest" only → Save
- Logout and visit `/news` without login → Should see it
- Login as member → Go to Notices → Should see it
- Edit announcement, uncheck "Guest", check only "Admin"
- Logout → Goto /news without login → Should NOT see it
- Login as member → Should NOT see it (member-level can't see admin-only)

### 3. Test logout
- Login
- Click "Profile" tab
- Scroll down, see "Session" section
- Click "Logout"
- Should redirect to /news
- Should NOT be logged in

### 4. Test tab names
- Dashboard shows "Attendance" tab (not "Home")
- News shows "Attendance" and "Notices" tabs
- Profile shows "Attendance" and "Notices" tabs

### 5. Test default tab
- Login as member
- Should land on "Notices" tab first (not Attendance)

---

## COMMON ISSUES

### "Cannot find module" error
```bash
# Solution: Reinstall
rm -rf node_modules
npm install
```

### "SESSION_SECRET not found" error
```bash
# Local dev: Check .dev.vars exists and has SESSION_SECRET
# Production: Check secret set: wrangler secret list
```

### Migrations fail with "database_id not found"
```bash
# Ensure wrangler.toml has correct database_id
# Copy from: wrangler d1 list
```

### "Something went wrong" in browser
```bash
# Clear site data and refresh
# Settings → [App Name] → Storage → Clear All
# Then refresh (Ctrl+Shift+R)
```

### Announcements not showing visibility checkboxes
```bash
# Clear npm build cache
rm -rf .wrangler build
npm run dev
# Or: npm run build && npm run deploy
```

---

## USEFUL COMMANDS

```bash
# Check D1 database
wrangler d1 list

# Execute query on local D1
wrangler d1 execute sevadal-db --local --command="SELECT COUNT(*) FROM members"

# Execute query on production D1
wrangler d1 execute sevadal-db --command="SELECT COUNT(*) FROM members" --remote

# List all secrets (production)
wrangler secret list

# View deployment logs
wrangler pages deployment list

# Connect custom domain to Pages project
wrangler pages project create sevadal-attendance
# OR update in dashboard
```

---

## FILE STRUCTURE

```
sevadal-v6/
├── app/
│   ├── routes/           # Page routes (dashboard, profile, admin, etc)
│   ├── lib/              # Server-side utilities (db, auth, etc)
│   ├── components/       # React components
│   └── styles/           # CSS
├── cron-worker/          # Telegram backup worker
├── migration.sql         # v1 schema
├── migration-v5.sql      # v5 features (permissions, audit)
├── migration-v6.sql      # v6 features (announcement checkboxes) ← NEW
├── README.md             # Updated with roles section ← UPDATED
├── DEPLOY.md             # Production deployment guide
├── USER_GUIDE.md         # User documentation ← NEW
├── TECHNICAL.md          # Technical reference ← NEW
├── .dev.vars.example     # Environment template ← NEW
├── .gitignore            # Git ignore rules ← UPDATED
└── package.json
```

---

## NEXT STEPS

1. ✅ Extract `sevadal-v6-final.zip`
2. ✅ Follow "LOCAL DEVELOPMENT SETUP" above
3. ✅ Test locally
4. ✅ Follow "PRODUCTION DEPLOYMENT" above
5. ✅ Verify everything works
6. ✅ Share USER_GUIDE.md with your users
7. ✅ Keep TECHNICAL.md as reference for developers

---

**Version:** 6.0  
**Last Updated:** March 30, 2026  
**Need Help?** See IMPLEMENTATION_SUMMARY.md and TECHNICAL.md
