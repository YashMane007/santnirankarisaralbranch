import { type LoaderFunctionArgs, json } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/session.server";
import { getScheduleOptionsForDate } from "~/lib/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  await requireAdmin(request, SESSION_SECRET, DB);
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!date) return json({ schedules: [] });
  const schedules = await getScheduleOptionsForDate(DB, date);
  return json({ schedules });
}
