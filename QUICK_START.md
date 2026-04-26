# Quick Start

## Local Dev (5 minutes)

```bash
# Install deps
npm install

# Copy and fill secrets
cp .dev.vars.example .dev.vars

# Create local D1 database and run schema
npx wrangler d1 create sevadal-db --local
npx wrangler d1 execute sevadal-db --local --file=schema-complete.sql

# Start dev server
npm run dev
# → http://localhost:8788
```

## First Run

1. Open `http://localhost:8788/auth/login`
2. There's no member yet — go to the D1 console or run:

```bash
wrangler d1 execute sevadal-db --local \
  --command="INSERT INTO members (id,name,is_admin,is_super_admin,is_active,created_at) VALUES ('ADMIN001','Your Name',1,1,1,datetime('now'))"
```

3. Log in with ID `ADMIN001` — you'll be prompted to set a PIN
4. Go to **Admin → Members** to add your volunteer members
5. Go to **Admin → Locations** to add your satsang bhavan with GPS coordinates

## Telegram Backup Setup

1. Create a bot via [@BotFather](https://t.me/botfather), copy the token
2. Add the bot to your group/channel, get the chat ID
3. Add to `.dev.vars`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABC...
   TELEGRAM_CHAT_ID=-100123456789
   BACKUP_SECRET=anyrandomstring
   ```
4. Go to **Admin → Settings → Telegram Backup**, enable it and set time
5. Click **Send Test Message** to verify

## Deploy to Production

See `DEPLOY.md` for complete Cloudflare Pages deployment steps.
