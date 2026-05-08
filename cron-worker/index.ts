/**
 * Sevadal Cron Worker — runs on schedule, calls main app endpoints.
 * Deploy separately: cd cron-worker && wrangler deploy
 *
 * wrangler.toml for this worker:
 * ---
 * name = "sevadal-cron"
 * main = "index.ts"
 * compatibility_date = "2024-09-23"
 *
 * [triggers]
 * # Change to ONE specific time, e.g. 12:06 AM IST = 18:36 UTC
 * # For session reminders (minute-level), use: crons = ["* * * * *"]
 * # For backup only (once a day), use: crons = ["36 18 * * *"]
 * # Recommended: run every minute so reminders fire on time
 * crons = ["* * * * *"]
 *
 * [vars]
 * APP_URL = "https://santnirankarisaralbranch.pages.dev"
 * ---
 *
 * Secrets: wrangler secret put BACKUP_SECRET
 */

export interface Env {
  BACKUP_SECRET: string;
  APP_URL: string;
}

async function callEndpoint(url: string, label: string): Promise<void> {
  try {
    const res  = await fetch(url, { method:"GET", headers:{"User-Agent":"Sevadal-Cron/2.0"} });
    const body = await res.text();
    console.log(`[Sevadal Cron] ${label}: ${res.status} — ${body.slice(0,200)}`);
  } catch (e) {
    console.error(`[Sevadal Cron] ${label} failed:`, e);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const secret = encodeURIComponent(env.BACKUP_SECRET);
    const base   = env.APP_URL.replace(/\/$/, "");

    // 1. Telegram backup (fires once/day — dedup handled server-side)
    await callEndpoint(`${base}/api/telegram-backup?secret=${secret}`, "Telegram Backup");

    // 2. Session reminders (runs every minute, server checks if reminder should fire)
    await callEndpoint(`${base}/api/session-reminders?secret=${secret}`, "Session Reminders");
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger") {
      await this.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);
      return new Response("Triggered", { status:200 });
    }
    return new Response("Sevadal Cron Worker v2\nGET /trigger to run manually", { status:200 });
  },
};
