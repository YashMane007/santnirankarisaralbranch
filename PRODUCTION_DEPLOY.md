# Sevadal Attendance — Complete Production Deployment Guide

> After following this guide, your site will run 24/7 on Cloudflare's servers.
> You can shut down your PC and the site stays live forever (on Cloudflare's free plan).

---

## What You Need Before Starting

- [ ] A **Cloudflare account** — free at cloudflare.com
- [ ] A **GitHub account** — free at github.com  
- [ ] **Node.js 20+** installed on your PC
- [ ] **Git** installed on your PC — download from git-scm.com
- [ ] Your project folder (the `sevadal` folder with `package.json` inside)
- [ ] Your **custom domain** already added to Cloudflare (or use the free `.pages.dev` subdomain)

---

## PART 1 — One-Time Setup on Cloudflare

### Step 1: Install Wrangler CLI

Open PowerShell in your `sevadal` folder and run:

```powershell
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```powershell
wrangler login
```

This opens your browser. Log in with your Cloudflare account. After login you can close the browser tab.

### Step 3: Create the D1 Database

```powershell
wrangler d1 create sevadal-db
```

**Output will look like:**

```
✅ Successfully created DB 'sevadal-db'

[[d1_databases]]
binding = "DB"
database_name = "sevadal-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy that `database_id` value** and open `wrangler.toml` in VS Code. 
Find this section and paste your UUID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sevadal-db"
database_id = "PASTE-YOUR-UUID-HERE"   ← replace this
```

> **Note:** Your `wrangler.toml` already has the local dev UUID. Replace it with the new production one.

### Step 4: Create the R2 Storage Bucket

```powershell
wrangler r2 bucket create sevadal-media
```

### Step 5: Initialize the Production Database

```powershell
# Create all tables in production
npm run db:init:prod

# Run migrations to add all features
npm run db:migrate:prod
```

If you see `duplicate column` errors, ignore them — it means those columns already exist which is fine.

### Step 6: Create Your First Super Admin

```powershell
wrangler d1 execute sevadal-db --remote --command="INSERT INTO members (id, name, is_admin, is_super_admin, is_active, pin_set, created_at, updated_at) VALUES ('ADMIN001', 'Your Full Name', 1, 1, 1, 0, datetime('now'), datetime('now'))"
```

**Replace:**
- `ADMIN001` → your preferred admin ID (e.g. `SNM-SA01`)
- `Your Full Name` → your actual name

> The `--remote` flag writes to the live production database, not local.

---

## PART 2 — Upload Code to GitHub

### Step 1: Create a GitHub Repository

1. Go to **github.com** → click **New repository** (green button)
2. Repository name: `sevadal-attendance`
3. Set to **Private** (your member data must stay private)
4. **Do NOT** tick "Add README" or any other checkboxes
5. Click **Create repository**

### Step 2: Upload Your Code

Open PowerShell **inside your `sevadal` folder** (where `package.json` is) and run these commands one by one:

```powershell
# Initialize git
git init

# Tell git your identity (one-time setup)
git config user.email "your@email.com"
git config user.name "Your Name"

# Stage all files
git add .

# Create first commit
git commit -m "Initial commit - Sevadal Attendance System"

# Connect to GitHub (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/sevadal-attendance.git

# Push to GitHub
git push -u origin main
```

GitHub will ask for your username and password. 
**Important:** For the password, use a **Personal Access Token**, not your GitHub password:
1. Go to github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name, set expiry to "No expiration", tick "repo" checkbox
4. Click Generate → **copy the token immediately** (shown only once)
5. Paste this token as the password when git asks

---

## PART 3 — Deploy to Cloudflare Pages

### Step 1: Connect GitHub to Cloudflare Pages

1. Go to **dash.cloudflare.com**
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** → **Pages** → **Connect to Git**
4. Click **Connect GitHub** → authorize Cloudflare
5. Select your `sevadal-attendance` repository
6. Click **Begin setup**

### Step 2: Configure Build Settings

On the build settings screen:

| Setting | Value |
|---------|-------|
| Project name | `sevadal-attendance` |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `build/client` |
| Root directory | `/` (leave blank) |

### Step 3: Add Environment Variables

Still on the same setup screen, scroll down to **Environment variables** and add:

| Variable name | Value |
|--------------|-------|
| `SESSION_SECRET` | Any random 32+ character string — e.g. `kJ8mP2xQ9rT4vY7nL1bW5hG3cF6dE0zA` |

Click **Save and Deploy**.

> **Note:** Cloudflare will build and deploy your site. This takes about 2-3 minutes the first time.

### Step 4: Add Remaining Secrets

After deployment, go to your project:
**Cloudflare → Workers & Pages → sevadal-attendance → Settings → Environment Variables**

Add these (click "Add variable" for each):

| Variable | Value | Notes |
|----------|-------|-------|
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAFxx...` | From @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | `-1001234567890` | Your group chat ID |
| `BACKUP_SECRET` | Any random string | E.g. `backup-secret-abc123` |

After adding all variables, click **Save**. Then go to **Deployments** tab and click **Retry deployment** so the new variables take effect.

---

## PART 4 — Connect Your Custom Domain

1. Go to **Cloudflare → Workers & Pages → sevadal-attendance**
2. Click **Custom domains** tab
3. Click **Set up a custom domain**
4. Enter your domain e.g. `sevadal.yourdomain.com` or `attendance.yourdomain.com`
5. Click **Continue** → Cloudflare auto-configures DNS since your domain is already on Cloudflare
6. Wait 1-2 minutes → SSL certificate is issued automatically (free)

Your site is now live at your custom domain with HTTPS. ✅

---

## PART 5 — Set Up Production D1 Database Binding

This step links your deployed Pages project to the D1 database.

1. Go to **Cloudflare → Workers & Pages → sevadal-attendance → Settings**
2. Click **Functions** tab
3. Under **D1 database bindings** → click **Add binding**
   - Variable name: `DB`
   - D1 database: select `sevadal-db`
4. Under **R2 bucket bindings** → click **Add binding**
   - Variable name: `BUCKET`
   - R2 bucket: select `sevadal-media`
5. Click **Save**
6. Go to **Deployments** → redeploy

---

## PART 6 — First Login

1. Open your site URL in browser
2. Click **Login**
3. Enter your Member ID: `ADMIN001` (or whatever you used in Step 6 of Part 1)
4. Leave PIN blank → click **Login**
5. You'll be taken to a PIN setup screen
6. Set your 4-digit PIN (avoid: 1234, 0000, 1111)
7. You are now logged in as Super Admin ✅

---

## PART 7 — Deploy Future Updates

Every time you make changes to the code:

```powershell
# Stage changes
git add .

# Commit with a description
git commit -m "Description of what changed"

# Push to GitHub
git push
```

**Cloudflare automatically detects the push and redeploys within 2-3 minutes.**  
You don't need to do anything else. The site updates while staying live.

> **Zero downtime:** Cloudflare uses atomic deployments. The old version keeps running until the new one is fully built, then switches instantly.

---

## PART 8 — Set Up Telegram Backup Cron (Optional)

The `cron-worker` folder is a separate Cloudflare Worker that sends daily backups.

```powershell
cd cron-worker

# Install wrangler in cron worker folder
npm init -y
npm install -D wrangler

# Edit wrangler.toml - replace APP_URL with your actual domain
# Change: APP_URL = "https://yourdomain.com"

# Add the backup secret (must match BACKUP_SECRET in your main app)
wrangler secret put BACKUP_SECRET
# → Type your backup secret and press Enter

# Deploy the cron worker
wrangler deploy
```

The cron runs daily at 12:06 AM IST automatically.

---

## PART 9 — Creating More Members (Admin Guide)

### Option A: One by one (from Admin Panel)
1. Login as Super Admin
2. Go to **Members** → **+ Add Member**
3. Fill in Member ID (e.g. `SNM-001`), Name, and other details
4. Click **Create Member**
5. Share the Member ID with the sevadal via WhatsApp or printed card
6. They open the site, enter their ID → prompted to set PIN → logged in

### Option B: Bulk import from CSV
1. Create a CSV file with columns: `id, name, phone, dob, gender, zone`
2. Go to **Members** → **Bulk Import**
3. Upload the CSV
4. All members are created at once

### Option C: Direct database command
```powershell
# Single member
wrangler d1 execute sevadal-db --remote --command="INSERT INTO members (id, name, phone, is_admin, is_super_admin, is_active, pin_set, created_at, updated_at) VALUES ('SNM-001', 'Member Name', '9876543210', 0, 0, 1, 0, datetime('now'), datetime('now'))"

# Additional Super Admin
wrangler d1 execute sevadal-db --remote --command="INSERT INTO members (id, name, is_admin, is_super_admin, is_active, pin_set, created_at, updated_at) VALUES ('SA002', 'Second SA Name', 1, 1, 1, 0, datetime('now'), datetime('now'))"

# Normal Admin (counted in attendance)
wrangler d1 execute sevadal-db --remote --command="INSERT INTO members (id, name, is_admin, is_super_admin, is_active, pin_set, created_at, updated_at) VALUES ('ADM001', 'Admin Name', 1, 0, 1, 0, datetime('now'), datetime('now'))"
```

---

## PART 10 — Member Registration Flow

**For each new sevadal member:**

1. Admin creates their account (Option A/B/C above)
2. Admin shares their **Member ID** — via WhatsApp message like:
   > "Jai Nirankar! Your Sevadal Attendance ID is: **SNM-001**. Open [your site URL] to register."
3. Member opens the site on their phone
4. Enters their Member ID → clicks Login
5. First login: sets their own 4-digit PIN
6. Done — they can now mark attendance anytime

**For PIN reset** (if member forgets PIN):
- Admin → Members → find member → click **Reset PIN**
- Member's PIN is cleared → next login they set a new one

---

## Quick Reference — Important URLs

| URL | Purpose |
|-----|---------|
| `yourdomain.com` | Redirects to login or dashboard |
| `yourdomain.com/auth/login` | Login page |
| `yourdomain.com/dashboard` | Member attendance dashboard |
| `yourdomain.com/admin` | Admin panel |
| `yourdomain.com/news` | Public notice board (no login needed) |
| `yourdomain.com/notice-board` | Same as /news |
| `dash.cloudflare.com` | Cloudflare dashboard |

---

## Quick Reference — Common Commands

```powershell
# Run locally for testing
npm run dev

# Deploy to production
git add . && git commit -m "update" && git push

# View production database
wrangler d1 execute sevadal-db --remote --command="SELECT * FROM members"

# View attendance records
wrangler d1 execute sevadal-db --remote --command="SELECT * FROM attendance ORDER BY date DESC LIMIT 20"

# Reset a member's PIN (replace SNM-001 with actual ID)
wrangler d1 execute sevadal-db --remote --command="UPDATE members SET pin_hash=NULL, pin_salt=NULL, pin_set=0 WHERE id='SNM-001'"

# Deactivate a member
wrangler d1 execute sevadal-db --remote --command="UPDATE members SET is_active=0 WHERE id='SNM-001'"

# Check how many members are active
wrangler d1 execute sevadal-db --remote --command="SELECT COUNT(*) as total, SUM(is_active) as active FROM members"
```

---

## Troubleshooting

### "Build failed" on Cloudflare Pages
- Check the build logs in Cloudflare → Workers & Pages → your project → Deployments → click the failed deployment
- Most common cause: missing environment variable `SESSION_SECRET`

### Members can't login after deploying
- Make sure `SESSION_SECRET` is set in Cloudflare environment variables
- Make sure D1 and R2 bindings are added (Part 5)

### Database changes not showing
- Make sure you ran `npm run db:init:prod` and `npm run db:migrate:prod`
- Use `--remote` flag for production, not `--local`

### Site not showing on custom domain
- DNS propagation takes up to 24 hours but usually under 5 minutes on Cloudflare
- Make sure your domain nameservers point to Cloudflare

### GPS not working for members
- GPS requires HTTPS — it won't work on `http://localhost` for members
- On production (your custom domain with SSL) it works correctly
- Members must allow location permission when the browser asks

---

## What Cloudflare Runs Automatically (24/7 Free)

| Component | Where it runs | Cost |
|-----------|--------------|------|
| Your web app | Cloudflare Pages | Free |
| Database | Cloudflare D1 (SQLite) | Free (5GB, 5M reads/day) |
| File storage | Cloudflare R2 | Free (10GB) |
| SSL certificate | Cloudflare | Free, auto-renews |
| DDoS protection | Cloudflare | Free |
| Global CDN | Cloudflare | Free |
| Telegram cron | Cloudflare Worker | Free (3 crons) |

**Monthly cost: ₹0** as long as you stay within free limits, which you easily will.

---

## Security Checklist Before Going Live

- [ ] `SESSION_SECRET` is a long random string (not something obvious)
- [ ] `.dev.vars` file is NOT uploaded to GitHub (check `.gitignore`)
- [ ] `node_modules` folder is NOT on GitHub
- [ ] Your GitHub repository is set to **Private**
- [ ] First admin PIN is set to something non-obvious (not 1234, 0000)
- [ ] Geofence radius is correctly set for your bhavan location
- [ ] Test attendance marking from the actual bhavan location before launch

---

*Sevadal Attendance System — Sant Nirankari Mission*  
*Built with Remix v2 + Cloudflare Pages + D1 + R2*
