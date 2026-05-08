/**
 * Telegram Backup API — called by Cloudflare Cron Worker.
 * Protected by BACKUP_SECRET. Rate-limited + date-based dedup (sends once per day max).
 * GET /api/telegram-backup?secret=xxx
 */
import { type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getAttendanceForExport, getAbsentList, getDailyStats } from "~/lib/db.server";
import { getAppSettings, setSetting } from "~/lib/appsettings.server";
import { generateAttendancePdf, fmtIST, fmtTime12hr, type AttendancePdfOptions } from "~/lib/pdf.server";
import { sendTelegramFile, sendTelegramMessage, buildBackupSummary, isTodayBackupDay } from "~/lib/telegram.server";
import { logAudit } from "~/lib/audit.server";
import { checkRateLimit } from "~/lib/ratelimit.server";

function csvEsc(v: any): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function yesterdayIST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function nowTimeIST(): string {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  }).replace(".", ":");
}
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  const env = context.cloudflare.env as any;

  const url    = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? "";
  const backupSecret = (env.BACKUP_SECRET as string) ?? "";

  if (!backupSecret || secret !== backupSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate limit: 10/hour secondary guard
  const rl = await checkRateLimit(DB, "telegram-backup:global", 10, 3600);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ ok: false, reason: "Rate limit exceeded" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const settings = await getAppSettings(DB);

  if (!settings.telegram_enabled) {
    return new Response(JSON.stringify({ ok: false, reason: "Telegram backup disabled" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const botToken = env.TELEGRAM_BOT_TOKEN as string;
  const chatId   = env.TELEGRAM_CHAT_ID   as string;
  if (!botToken || !chatId) {
    return new Response(JSON.stringify({ ok: false, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Backup day check ────────────────────────────────────────────────────────
  if (!isTodayBackupDay(settings.telegram_backup_days)) {
    return new Response(JSON.stringify({ ok: false, reason: "Not a backup day" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Backup time check (±20 min window, skippable with ?force=1) ────────────
  const cfgTime = settings.telegram_backup_time || "00:06";
  const nowIST  = nowTimeIST();
  const diff    = Math.abs(toMin(nowIST) - toMin(cfgTime));
  const force   = url.searchParams.get("force") === "1";
  if (!force && diff > 20) {
    return new Response(JSON.stringify({ ok: false, reason: `Not backup time yet (now ${nowIST} IST, cfg ${cfgTime})` }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── DATE-BASED DEDUP: only send once per IST day ───────────────────────────
  const today = todayIST();
  const lastBackupDate = settings.telegram_last_backup
    ? settings.telegram_last_backup.slice(0, 10) // "YYYY-MM-DD"
    : "";
  if (!force && lastBackupDate === today) {
    return new Response(JSON.stringify({ ok: false, reason: `Backup already sent today (${today})` }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Fetch data for yesterday ────────────────────────────────────────────────
  const date    = url.searchParams.get("date") ?? yesterdayIST();
  const records = await getAttendanceForExport(DB, date, date);
  const stats   = await getDailyStats(DB, date);

  if (records.length === 0) {
    await sendTelegramMessage({ botToken, chatId },
      `📋 <b>${settings.org_name}</b>\n📅 ${date}\n\n⚠️ No attendance data for this date. Backup skipped.`
    );
    // Still mark as sent so we don't retry all day
    await setSetting(DB, "telegram_last_backup", today);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

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

  await sendTelegramFile({ botToken, chatId }, `attendance-${date}.csv`, csv,
    `📊 CSV — ${date} (${records.length} records)`);

  // PDF
  const absentList = await getAbsentList(DB, date);
  const pdfOpts: AttendancePdfOptions = {
    date,
    orgName: settings.org_name,
    appName: settings.app_name,
    presentRows: records.map(r => ({
      date: r.date,
      memberName: r.member_name ?? "—",
      memberId: r.member_id,
      sevaRole: r.seva_role,
      sessionLabel: r.session_label,
      location: r.location_name,
      timeIST: fmtIST(r.marked_at),
      markedBy: r.marked_by_name ?? "Self",
      adminMarkedAt: r.admin_marked_date && r.admin_marked_time
        ? `${r.admin_marked_date} (${fmtTime12hr(r.admin_marked_time)})`
        : null,
    })),
    absentCount: absentList.length,
    totalActive: stats.totalActive,
    columns: ["all"],
  };
  const pdfBytes = generateAttendancePdf(pdfOpts);
  await sendTelegramFile({ botToken, chatId }, `attendance-${date}.pdf`, pdfBytes,
    `📄 PDF — ${date}`);

  // ── Mark backup sent (store today's date, not full ISO) ────────────────────
  await setSetting(DB, "telegram_last_backup", today);

  await logAudit(DB, {
    actorId: "SYSTEM", actorName: "Telegram Cron", actorRole: "admin",
    action: "telegram_backup_sent",
    details: { date, records: records.length },
  });

  return new Response(JSON.stringify({ ok: true, date, records: records.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
