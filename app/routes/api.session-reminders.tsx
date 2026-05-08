/**
 * GET /api/session-reminders?secret=XXX
 * Called by cron worker every minute.
 * Sends pre-session push notifications at configured reminder time.
 */
import { type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getAppSettings } from "~/lib/appsettings.server";
import { getScheduleOptionsForDate, wasNotificationSent, logNotification } from "~/lib/db.server";
import { sendPushToMembers } from "~/lib/notifications.server";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function nowMinutesIST(): number {
  const t = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  }).replace(".", ":");
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function timeToMinutes(t: string): number {
  if (!t) return -1;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  const env    = context.cloudflare.env as any;

  const secret = new URL(request.url).searchParams.get("secret") ?? "";
  if (!secret || secret !== (env.BACKUP_SECRET ?? "")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await getAppSettings(DB);
  if (!settings.notifications_enabled || !settings.reminder_enabled) {
    return new Response(JSON.stringify({ ok: false, reason: "Reminders disabled" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const date     = todayIST();
  const nowMin   = nowMinutesIST();
  const schedules = await getScheduleOptionsForDate(DB, date);
  const reminderMin = settings.reminder_minutes_before;
  let notifSent = 0;

  for (const sch of schedules) {
    if (!sch.start_time) continue;
    const triggerMin = timeToMinutes(sch.start_time) - reminderMin;
    if (Math.abs(nowMin - triggerMin) > 1) continue;

    const alreadySent = await wasNotificationSent(DB, "session_reminder", date, String(sch.id));
    if (alreadySent) continue;

    const result = await sendPushToMembers(
      DB,
      env.VAPID_PRIVATE_KEY_JWK ?? "",
      env.VAPID_PUBLIC_KEY ?? "",
      env.VAPID_SUBJECT ?? "mailto:admin@sevadal.app",
      {
        target: "all",
        title: "🙏 Satsang Reminder",
        body: `${sch.label} at ${sch.location_name} starts in ${reminderMin} min (${sch.start_time})`,
        url: "/dashboard",
      }
    );

    if (result.sent > 0) {
      await logNotification(DB, null, "session_reminder", date, String(sch.id));
      notifSent += result.sent;
    }
  }

  return new Response(JSON.stringify({ ok: true, date, notifSent }), {
    headers: { "Content-Type": "application/json" },
  });
}
