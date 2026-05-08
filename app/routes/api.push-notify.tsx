import { type ActionFunctionArgs, json } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/session.server";
import { sendPushToMembers } from "~/lib/notifications.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const env = context.cloudflare.env as any;
  await requireAdmin(request, SESSION_SECRET, DB);

  const body = await request.json() as any;
  const result = await sendPushToMembers(
    DB,
    env.VAPID_PRIVATE_KEY_JWK ?? "",
    env.VAPID_PUBLIC_KEY ?? "",
    env.VAPID_SUBJECT ?? "mailto:admin@sevadal.app",
    { target: body.target || "all", memberId: body.memberId, title: body.title, body: body.body, url: body.url }
  );
  return json(result);
}

export function loader() {
  return json({ ok: false }, { status: 405 });
}
