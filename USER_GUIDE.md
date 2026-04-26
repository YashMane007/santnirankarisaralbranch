# User Guide

## For Members

### Logging In
1. Open **sevadalattendance.yashmane.xyz** in your browser
2. Enter your **Member ID** (e.g. `SNM001`) and **4-digit PIN**
3. First login will prompt you to set a PIN if admin created your account without one

### Marking Attendance
1. Go to **Dashboard** (home screen)
2. Allow location permission when prompted — the green "GPS ready" indicator must appear
3. Select the session(s) you are attending (checkboxes)
4. Select your **Seva Role** from the dropdown (required)
5. Tap **✅ Mark Present**
6. If you see a distance error, you are too far from the venue — move closer and retry

### Installing as App (Android)
- On the News page, tap **Install Now** in the orange banner
- Or use Chrome menu → "Add to Home Screen"
- The app works offline once installed

### Viewing Your Records
- Dashboard shows **This Month** and **All Time** attendance counts
- Scroll down to see **Recent Attendance** history

### Changing Your PIN
1. Go to **Profile** (bottom nav, right icon)
2. Tap **Change PIN**
3. Enter current PIN, then new PIN twice

---

## For Admins

### Managing Members
**Admin → Members** — add, edit, activate/deactivate, reset PINs, upload photos

### Managing Locations
**Admin → Locations** — add satsang bhavans with GPS coordinates and geofence radius

- **No schedules** = location is always open (any day, any time)
- **With schedules** = members can only mark during those specific date/time windows
- Delete a location removes all its schedules — use Deactivate if you want to keep history

### Managing Schedules
Click **+ Add** on any location card to add a session (label, date, time window, satsang type)

### Marking Attendance (Admin)
**Admin → Mark Attendance** — mark attendance on behalf of a member (useful if their phone has no GPS)

### Exporting Data
**Admin → Export** — download attendance CSV filtered by date range, location, or member

### Telegram Backup
**Admin → Settings → Telegram Backup**
- Enable/disable daily backup
- Set backup time in IST (the cron checks every 30 min, fires within ±20 min of set time)
- Select which days to send
- Click **Send Test Message** to verify bot is configured

### Announcements
**Admin → Announcements** — create news posts with images and file attachments, visible on the public **/news** page

### Audit Log
**Admin → Audit Log** — view all actions with actor, timestamp, and IP

### Kill Switch
**Admin → Settings → Kill Switch** — block members and/or admins from accessing the site (maintenance mode)
