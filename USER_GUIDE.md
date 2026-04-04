# Sevadal Attendance — User Guide

**Version:** 5.6+ (Updated March 2026)  
**Organization:** Sant Nirankari Mission

---

## Table of Contents
1. [For Members](#for-members)
2. [For Admins](#for-admins)
3. [For Super Admins (SA)](#for-super-admins)
4. [Troubleshooting](#troubleshooting)

---

## For Members

### Overview
Members use Sevadal Attendance to mark their attendance at Satsang/Seva locations. The app tracks attendance history and displays important notices.

### Logging In
1. **First-time login:** Get your 4-digit PIN from an admin
2. **Visit:** `https://sevadal.example.com`
3. **Enter** your Member ID (e.g., SNM-003) and PIN
4. **Keep your PIN private** — it's like your password

### Marking Attendance

**Step 1: Open the Attendance Tab**
- Tap the "Attendance" icon in the bottom navigation (home icon)
- You'll see today's scheduled Satsang/Seva sessions (if any are active)

**Step 2: Select Your Seva Role**
- Choose your role from the dropdown (Guard, Kitchen, Parking, etc.)
- If your role isn't listed, ask an admin to add it
- Or select "General Seva" if unsure

**Step 3: Get Location Permission**
- Tap "📍 Get My Location First"
- Your phone will ask permission to access GPS
- **Allow location access** — this is required for attendance
- Wait for GPS to lock (shows 3-5 satellites)

**Step 4: Mark Present**
- Once GPS is found, the "✅ Mark Present" button activates
- Tap it to mark attendance
- You'll see a success message with the location name
- Your attendance record is saved immediately

**Rules:**
- ✅ You can mark attendance only **within the location boundary** (typically 200m radius)
- ✅ Mark for **each active session** you attend (same location, different times = mark twice)
- ❌ You cannot mark without GPS — "Allow location access" in phone settings
- ❌ You cannot mark more than **10 times per hour** (rate limit for fairness)

### Viewing Notices & Announcements

**Step 1: Open the Notices Tab**
- Tap the "Notices" icon in bottom navigation (calendar icon)
- This is the **default tab when you log in**

**Step 2: View Announcements**
- Scroll through notices from admins
- Pinned notices (📌) appear at the top
- Each notice may have images, PDF files, or links

**Step 3: View Images**
- Tap any image in a notice to open the lightbox
- Swipe left/right or use arrows to browse images
- Tap thumbnails at the bottom to jump to any image
- Tap outside or press ✕ to close

**Step 4: Download Files**
- Tap PDF or file links to download
- Files open in your phone's default viewer

**Visibility:**
- You see notices marked for "Guests" + "Members"
- You do NOT see admin-only notices

### Managing Your Profile

**Step 1: Open Profile Tab**
- Tap the "Profile" icon in bottom navigation (person icon)

**Step 2: View Your Details**
- Your member ID, phone, date of birth, zone, gender
- Tap "✏️ Edit" to update any field

**Step 3: Change Your Profile Photo**
- Tap the camera icon 📷 on your photo
- Select a JPG/PNG from your phone
- Photo uploads immediately

**Step 4: Change Your PIN**
- Enter your current PIN (4 digits)
- Enter new PIN (4 digits, must be different)
- Confirm by re-entering new PIN
- ⚠️ PINs must be 4 unique digits (not 1111, 1234 is OK)

**Step 5: Logout**
- Scroll down to "Session" section
- Tap "Logout" button
- You'll be sent to the News & Notices page
- To log back in, use your PIN again

### Attendance History

- Scroll down in the Attendance tab to see "Recent Attendance"
- Shows last 10 attendance records with:
  - Date and time marked
  - Location name
  - Seva role
  - Session label (if applicable)

### Rate Limits & Fairness

**Why are there rate limits?**
- Prevents accidental multiple markings
- Ensures system stability
- Fair access for all members

**Limits:**
- **Per member:** 10 attendance marks per hour
- **Per IP address:** 30 marks per hour shared
- If you hit a limit, wait ~1 hour and retry

---

## For Admins

### Overview
Admins manage members, mark attendance for others, create notices, view reports, and configure locations.

### Logging In
1. You have "admin" privilege on your member account
2. Login with your Member ID + PIN
3. You'll automatically land on the **Admin Dashboard**
4. Members land on Attendance tab; Admins land on Admin panel

### Admin Dashboard
- **Quick stats:** Total members, active locations, recent attendance
- **Action buttons:** Jump to any admin section
- **Announcements banner:** Optional message to display

### Managing Members

**View All Members:**
1. Click "Members" in the left sidebar
2. Search by name, ID, or zone
3. See: ID, Name, Status (Active/Inactive), Contact info

**Add a New Member:**
1. Click "Add Member" button
2. Enter: Member ID, Name, Phone (optional), Date of Birth, Gender, Zone
3. Set initial status (Active/Inactive)
4. Click "Create"
5. New member gets a temporary PIN (admin must set via Settings)

**Edit Member:**
1. Find member in list → Click "✏️ Edit"
2. Update any field
3. Optionally toggle Admin/Super Admin status
4. Click "Save"

**Activate/Deactivate:**
- Click the toggle button next to a member
- Inactive members cannot login
- Use this instead of deleting

**Reset Member PIN:**
1. Click member's row → More options (⋯)
2. Select "Reset PIN"
3. Admin receives a one-time PIN to share with member

**Promote to Admin:**
1. Edit member → Toggle "Is Admin?"
2. Assign them to a Permission Group (see Permissions section)
3. Save

### Managing Locations & Schedules

**Add Location:**
1. Click "Locations" in sidebar
2. Click "Add Location"
3. Enter name, address, GPS coordinates
4. Set geofence radius (default 200m)
5. Save

**How to get GPS Coordinates:**
- Google Maps: Right-click address → Copy coordinates
- Apple Maps: Long-press → Share → Shows lat/lng
- Or use "📍 Get My Location" button in app

**Add Schedule (Satsang/Seva Session):**
1. Click location → "Add Schedule"
2. Enter:
   - Label (e.g., "Morning Satsang", "Evening Langar")
   - Satsang type (Normal, EMS, Mahila, etc.)
   - Date
   - All-day or specific time
3. Save
4. Members see active schedules when marking attendance

**Toggle Location Active/Inactive:**
- Click toggle next to location name
- Inactive locations don't appear to members

### Marking Attendance (for members who can't use app)

**Admin Mark Attendance:**
1. Click "Attendance" in sidebar
2. Click "Mark Attendance" button
3. Select date, member, location, seva role
4. Click "Mark"
5. Auto-timestamps the record

**Edit Attendance:**
1. Find record in attendance list
2. Click "✏️ Edit"
3. Change location, time, role, or date
4. Save

**Delete Attendance:**
1. Find record
2. Click "🗑️ Delete"
3. Confirm

### Creating & Managing Announcements (Notices)

**Create Notice:**
1. Click "Announcements" in sidebar
2. Click "Add Announcement"
3. Fill in:
   - **Title** (required)
   - **Body** (optional, supports multi-line text)
   - **Type:** Notice, Poster, Contact, Gallery
   - **Visible to:** Select checkboxes:
     - ☐ Guests (public page, no login needed)
     - ☐ Members (logged-in members)
     - ☐ Admins (admins only)
   - **Attachments:** Upload images (JPG, PNG) or PDFs
   - **Expires on:** Optional date (after this, notice disappears)
   - ☑️ Pin to top (pinned notices show first)

4. Click "Create"

**Edit Notice:**
1. Find notice in list
2. Click "✏️ Edit"
3. Update any field
4. Remove attachments with ✕ icon
5. Add new attachments
6. Click "Save"

**Delete Notice:**
1. Click "🗑️ Delete"
2. Confirm

**Important about Visibility:**
- **Guests:** Unauthenticated users on `/news` page
- **Members:** Logged-in members (not admins)
- **Admins:** Admin accounts only
- You can select **multiple visibility levels** independently
- Uncheck all boxes = notice invisible to everyone (draft mode)

### Exporting Data

**CSV Export:**
1. Click "Export" in sidebar
2. Select date range
3. Choose columns (auto-marked, marked-by, location, etc.)
4. Click "Download CSV"
5. Open in Excel or Google Sheets

**PDF Export:**
1. Click "Export"
2. Select date range
3. Choose columns
4. Click "Download PDF"
5. Professional printable format

### Audit Log (View all actions)

**View Audit Trail:**
1. Click "Audit Log" in sidebar
2. See all actions: member create, attendance mark, notice edit, etc.
3. Filter by date range, action type, actor
4. Shows who did what, when, and from which IP

### Managing Satsang Types & Seva Roles

**Add Satsang Type:**
1. Click "Satsang Types" in sidebar
2. Click "Add Type"
3. Enter name (e.g., "Youth Satsang")
4. Click "Create"

**Add Seva Role:**
1. Click "Seva Roles" in sidebar
2. Click "Add Role"
3. Enter name (e.g., "Sound/Media")
4. Click "Create"

**Delete:**
- Click "🗑️ Delete" next to any type/role
- Existing attendance records are NOT affected

### Permission Groups (Who can do what)

**Default Groups:**
- **Full Admin:** All permissions
- **Attendance Only:** Can only view & mark attendance
- **Read Only:** Can only view data (no edit/mark)

**Assign Admin to Group:**
1. Click "Permissions" in sidebar
2. Find admin in list
3. Change their "Permission Group" dropdown
4. Save

**Grant Individual Override:**
- Same page, click "Edit Overrides"
- Add/remove specific permissions for that admin
- Useful if they need one extra permission

**Create Custom Group:**
1. Click "Permissions" → "Add Group"
2. Select permissions
3. Name the group (e.g., "Location Managers")
4. Save
5. Assign admins to it

### App Settings

**Click "Settings" in sidebar:**

**Banner Message:**
- Sets a message shown to all users
- Use for maintenance alerts, event announcements

**Kill Switch (Maintenance Mode):**
- "Block Members" = members can't access app (see maintenance page)
- "Block Admins" = admins can't access admin panel
- "Message" = text shown on maintenance page

**Telegram Backup Settings:**
- ✓ Enable Telegram Backup = daily backups to Telegram
- **Backup Time (IST):** e.g., "09:52" (set to non-peak hours)
- **Backup Days:** Select which days to backup
- **Test Button:** Send a test backup now (shows errors if any)

**Audit Log Settings:**
- "Audit Enabled" = log all actions
- "Retention Days" = 0 (keep forever) or number of days to keep

---

## For Super Admins

### What's Different?
- Super Admins (SA) bypass **all permission checks**
- Can do everything any Admin can do
- Can promote/demote admins
- Can reset app settings to defaults
- Only SAs can create/edit other SAs

### First Super Admin Setup

**If this is your first time:**
1. Ask an admin to create your member account
2. Contact system owner to promote you to Super Admin via database
3. Or use setup page: `https://sevadal.example.com/auth/setup-pin`

**Once promoted:**
1. Login normally
2. You'll see "Super Admin" badge on dashboard
3. All admin features are unlocked

### Managing Other Admins

**Promote Member to Admin:**
1. Go to Members
2. Find member
3. Click "✏️ Edit"
4. Toggle "Is Admin?"
5. Assign Permission Group
6. Save

**Promote Admin to Super Admin:**
1. Go to Members
2. Find admin
3. Edit → Toggle "Is Super Admin?"
4. Save

**Remove Admin Status:**
1. Edit member
2. Uncheck "Is Admin?"
3. Save
4. They revert to regular member

### Resetting App to Defaults

**⚠️ This is destructive:**
1. Click "Settings"
2. Scroll to "Data Management"
3. Click "Reset All Settings to Defaults"
4. Confirm
5. All announcements, satsang types, permission groups reset
6. Member attendance data is NOT deleted

### Full Data Wipe (if needed)

⚠️ **ONLY IN EMERGENCIES:**
1. Click "Settings"
2. "Wipe All Data"
3. Confirm twice
4. **All data deleted:** members, attendance, locations, notices
5. Only option: restore from Telegram backup or database restore

---

## Troubleshooting

### "Location Denied. Allow permission."
**Problem:** Can't get GPS
**Solution:**
1. Go to phone Settings
2. Find "Sevadal" app
3. Tap "Permissions" → "Location"
4. Change from "Don't Allow" to "Allow While Using App"
5. Go back to app, tap "📍 Get My Location" again

### "You are Xm from Location Y. Must be within Zm."
**Problem:** Too far from location
**Solution:**
1. Check you're at the correct physical location
2. Move closer (typically within 200m)
3. Ensure you didn't accidentally swipe to wrong location in app
4. GPS accuracy can vary ±10m — try refreshing location

### "Too many attempts. Please wait a while."
**Problem:** Rate limit hit
**Solution:**
1. You've marked attendance 10+ times in 1 hour
2. Wait 1 hour before trying again
3. Or ask an admin to mark attendance for you

### "PIN incorrect"
**Problem:** Wrong PIN
**Solution:**
1. Check caps lock is OFF
2. Try again carefully
3. If PIN forgotten, ask admin for reset

### "Something went wrong"
**Problem:** App crashed
**Solution:**
1. Close app completely
2. Clear site data: Settings → [App Name] → Storage → Clear All
3. Reopen app
4. Refresh page (Ctrl+Shift+R on desktop, pull-down on mobile)
5. If persists, contact admin with screenshot

### "Images not loading"
**Problem:** Photos/attachments show broken
**Solution:**
1. Check internet connection
2. Clear browser cache
3. Try a different browser
4. Contact admin — file may not have uploaded

### Images show but can't download
**Problem:** "Something went wrong" on file click
**Solution:**
1. File may be expired or deleted
2. Ask admin to re-upload attachment
3. Or contact admin for manual share

### "No active locations found"
**Problem:** Can't mark attendance
**Solution:**
1. Admin hasn't created a location yet
2. Or no schedules active for today
3. Contact admin to add location/schedule

### Can't see a notice
**Problem:** Announcement not visible
**Solution:**
1. If you're a member, check notice is marked "Members" or "Guests"
2. If not, ask admin to change visibility
3. If notice is expired, it won't show (intentional)
4. If unpublished (is_active = 0), ask admin to activate

---

## Contact & Support

**For Member Issues:**
- Contact your local admin
- Provide screenshot of error message
- Include date/time of issue

**For Admin Issues:**
- Contact Super Admin
- Check Audit Log for what failed
- Check browser console for error messages (F12)

**For Server/Infrastructure Issues:**
- Contact system owner
- Check Telegram backup log (sent daily)
- May need to restart cron worker or deploy new version

---

**Last Updated:** March 30, 2026  
**Next Review:** June 2026
