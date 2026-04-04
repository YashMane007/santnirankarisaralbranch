/**
 * Sevadal Backup Cron Worker
 * Deploy separately: cd cron-worker && wrangler deploy
 *
 * This tiny worker runs on a cron schedule and calls the main app's
 * /api/telegram-backup endpoint. Deployed as a separate Worker (not Pages).
 *
 * Setup:
 *   1. cd cron-worker
 *   2. Create wrangler.toml (see below)
 *   3. wrangler secret put BACKUP_SECRET
 *   4. wrangler deploy
 *
 * wrangler.toml for this worker:
 * ---
 * name = "sevadal-cron"
 * main = "index.ts"
 * compatibility_date = "2024-09-23"
 *
 * [triggers]
 * # 12:06 AM IST = 18:36 UTC
 * crons = ["36 18 * * *"]
 *
 * [vars]
 * APP_URL = "https://yourdomain.com"
 * ---
 */

export interface Env {
  BACKUP_SECRET: string;
  APP_URL: string;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const url = `${env.APP_URL}/api/telegram-backup?secret=${encodeURIComponent(env.BACKUP_SECRET)}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "Sevadal-Cron/1.0" },
      });
      const body = await res.text();
      console.log(`[Sevadal Cron] Backup response: ${res.status} — ${body}`);
    } catch (e) {
      console.error("[Sevadal Cron] Backup failed:", e);
    }
  },

  // Also handle direct fetch (for manual testing)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger") {
      await this.scheduled({} as any, env, {} as any);
      return new Response("Triggered", { status: 200 });
    }
    return new Response("Sevadal Backup Cron Worker\nGET /trigger to run manually", { status: 200 });
  },
};
