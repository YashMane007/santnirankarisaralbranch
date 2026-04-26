/**
 * Telegram Backup API
 * Called by Cloudflare Cron Worker at scheduled time.
 * Protected by BACKUP_SECRET env var.
 *
 * GET /api/telegram-backup?secret=xxx&date=YYYY-MM-DD
 */
import { type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getAttendanceForExport, getAbsentList, getDailyStats } from "~/lib/db.server";
import { getAppSettings, setSetting } from "~/lib/appsettings.server";
import { generateAttendancePdf, fmtIST, type AttendancePdfOptions } from "~/lib/pdf.server";
import { sendTelegramFile, sendTelegramMessage, buildBackupSummary, isTodayBackupDay } from "~/lib/telegram.server";
import { logAudit } from "~/lib/audit.server";

function csvEsc(v: any): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayIST() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function yesterdayIST() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const env = context.cloudflare.env as any;

  const url     = new URL(request.url);
  const secret  = url.searchParams.get("secret") ?? "";
  const backupSecret = (env.BACKUP_SECRET as string) ?? "";

  // Auth: require secret token
  if (!backupSecret || secret !== backupSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const date = url.searchParams.get("date") ?? yesterdayIST();
  const settings = await getAppSettings(DB);

  if (!settings.telegram_enabled) {
    return new Response(JSON.stringify({ ok: false, reason: "Telegram backup disabled" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const botToken = env.TELEGRAM_BOT_TOKEN as string;
  const chatId   = env.TELEGRAM_CHAT_ID as string;

  if (!botToken || !chatId) {
    return new Response(JSON.stringify({ ok: false, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check backup day schedule
  if (!isTodayBackupDay(settings.telegram_backup_days)) {
    return new Response(JSON.stringify({ ok: false, reason: "Not a backup day" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check backup time — only fire within ±20 minutes of configured IST time.
  // This allows cron to run every 30 min while still honouring user-set time.
  const nowIST = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).replace(".", ":");
  const cfgTime = settings.telegram_backup_time || "00:06";
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const diff = Math.abs(toMin(nowIST) - toMin(cfgTime));
  const skip = url.searchParams.get("force") !== "1";
  if (skip && diff > 20) {
    return new Response(JSON.stringify({ ok: false, reason: `Not backup time yet (now ${nowIST} IST, configured ${cfgTime} IST)` }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const records = await getAttendanceForExport(DB, date, date);
  const stats   = await getDailyStats(DB, date);

  // Skip if no data
  if (records.length === 0) {
    await sendTelegramMessage({ botToken, chatId },
      `📋 <b>${settings.org_name}</b>\n📅 ${date}\n\n⚠️ No attendance data for this date. Backup skipped.`
    );
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Summary message
  const summary = buildBackupSummary(
    date, stats.uniquePresentCount, Math.max(0, stats.totalActive - stats.uniquePresentCount),
    stats.totalActive, settings.org_name
  );
  await sendTelegramMessage({ botToken, chatId }, summary);

  // CSV
  const csvHeader = ["Date","Member ID","Name","Seva Role","Session","Location","Time (IST)","Marked By"];
  const csvRows = records.map(r => [
    r.date, r.member_id, r.member_name, r.seva_role,
    r.session_label, r.location_name, fmtIST(r.marked_at),
    r.marked_by_name ?? "Self",
  ].map(csvEsc).join(","));
  const csv = "\uFEFF" + [csvHeader.join(","), ...csvRows].join("\r\n");

  await sendTelegramFile(
    { botToken, chatId },
    `attendance-${date}.csv`,
    csv,
    `📊 CSV — ${date} (${records.length} records)`
  );

  // PDF
  const absentList = await getAbsentList(DB, date);
  const pdfOpts: AttendancePdfOptions = {
    date,
    orgName: settings.org_name,
    appName: settings.app_name,
    presentRows: records.map(r => ({
      memberName: r.member_name ?? "—",
      memberId: r.member_id,
      sevaRole: r.seva_role,
      sessionLabel: r.session_label,
      location: r.location_name,
      timeIST: fmtIST(r.marked_at),
      markedBy: r.marked_by_name ?? "Self",
    })),
    absentCount: absentList.length,
    totalActive: stats.totalActive,
    columns: ["all"],
  };
  const pdfBytes = generateAttendancePdf(pdfOpts);

  await sendTelegramFile(
    { botToken, chatId },
    `attendance-${date}.pdf`,
    pdfBytes,
    `📄 PDF — ${date}`
  );

  // Update last backup timestamp
  await setSetting(DB, "telegram_last_backup", new Date().toISOString());

  // Audit log
  await logAudit(DB, {
    actorId: "SYSTEM", actorName: "Telegram Cron", actorRole: "admin",
    action: "telegram_backup_sent",
    details: { date, records: records.length },
  });

  return new Response(JSON.stringify({ ok: true, date, records: records.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
