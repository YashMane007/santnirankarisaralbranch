/**
 * Telegram Bot API — sends backup files to a configured chat/channel.
 * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .dev.vars + CF env vars.
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Send a text message to the Telegram chat.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a file (CSV or PDF bytes) to the Telegram chat.
 */
export async function sendTelegramFile(
  config: TelegramConfig,
  filename: string,
  data: Uint8Array | string,
  caption: string
): Promise<boolean> {
  try {
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    const isText = filename.endsWith(".csv");

    const form = new FormData();
    form.append("chat_id", config.chatId);
    form.append("caption", caption);
    form.append(
      "document",
      new Blob([bytes], {
        type: isText ? "text/csv" : "application/pdf",
      }),
      filename
    );

    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendDocument`,
      { method: "POST", body: form }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if today's IST day-of-week matches backup schedule.
 * days = comma-separated: mon,tue,wed,thu,fri,sat,sun
 */
export function isTodayBackupDay(daysConfig: string): boolean {
  const days = daysConfig.toLowerCase().split(",").map(d => d.trim());
  if (days.includes("daily") || days.length === 7) return true;
  const dow = new Date()
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" })
    .toLowerCase()
    .slice(0, 3);
  return days.includes(dow);
}

/**
 * Format a summary message for the Telegram backup.
 */
export function buildBackupSummary(
  date: string,
  presentCount: number,
  absentCount: number,
  totalActive: number,
  orgName: string
): string {
  const rate = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;
  return (
    `📋 <b>${orgName} — Daily Attendance Backup</b>\n` +
    `📅 Date: <b>${date}</b>\n\n` +
    `✅ Present: <b>${presentCount}</b>\n` +
    `❌ Absent: <b>${absentCount}</b>\n` +
    `👥 Total Active: <b>${totalActive}</b>\n` +
    `📊 Rate: <b>${rate}%</b>\n\n` +
    `<i>Files attached below ↓</i>`
  );
}
