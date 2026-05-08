/**
 * GET /api/marked-members?date=YYYY-MM-DD&scheduleId=N
 * Returns member IDs already marked for a given date + schedule combo.
 * Used by mark modals to exclude already-marked members.
 */
import { type LoaderFunctionArgs, json } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  await requireAdmin(request, SESSION_SECRET, DB);
  const url        = new URL(request.url);
  const date       = url.searchParams.get("date") ?? "";
  const scheduleId = parseInt(url.searchParams.get("scheduleId") ?? "0");
  if (!date) return json({ markedIds: [] });

  const rows = await DB.prepare(
    "SELECT DISTINCT member_id FROM attendance WHERE date = ? AND schedule_id = ?"
  ).bind(date, scheduleId).all<{ member_id: string }>();

  return json({ markedIds: rows.results.map(r => r.member_id) });
}
