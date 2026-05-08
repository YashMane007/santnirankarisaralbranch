/**
 * POST /api/push-subscribe
 * Saves or removes a push subscription for the current logged-in user.
 */
import { type ActionFunctionArgs, json } from "@remix-run/cloudflare";
import { getSessionStorage } from "~/lib/session.server";
import { upsertPushSubscription, deletePushSubscription } from "~/lib/db.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const storage = getSessionStorage(SESSION_SECRET, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const memberId = session.get("memberId") as string | undefined;
  if (!memberId) return json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const body = await request.json() as any;
  const { action, endpoint, p256dh, auth } = body;

  if (action === "subscribe" && endpoint && p256dh && auth) {
    await upsertPushSubscription(DB, {
      member_id: memberId,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return json({ ok: true });
  }
  if (action === "unsubscribe" && endpoint) {
    await deletePushSubscription(DB, memberId, endpoint);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Invalid request" }, { status: 400 });
}

export function loader() {
  return json({ ok: false }, { status: 405 });
}
