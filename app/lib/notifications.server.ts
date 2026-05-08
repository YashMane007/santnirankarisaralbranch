/**
 * Shared push notification sending logic.
 * Called directly (no internal HTTP) from settings and api.push-notify.
 */
import { getAllPushSubscriptions, getPushSubscriptionsForMember, deletePushSubscriptionByEndpoint } from "~/lib/db.server";
import { sendPushNotification, type PushPayload } from "~/lib/webpush.server";

export interface SendPushOptions {
  target: "all" | "member";
  memberId?: string;
  title: string;
  body: string;
  url?: string;
}

export interface SendPushResult {
  ok: boolean;
  sent: number;
  failed: number;
  total: number;
  error?: string;
}

export async function sendPushToMembers(
  db: D1Database,
  vapidPrivateKeyJwk: string,
  vapidPublicKey: string,
  vapidSubject: string,
  opts: SendPushOptions
): Promise<SendPushResult> {
  if (!vapidPrivateKeyJwk || !vapidPublicKey) {
    return { ok: false, sent: 0, failed: 0, total: 0, error: "VAPID keys not configured. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY_JWK to your .dev.vars (local) or wrangler secrets (production)." };
  }

  const subs = opts.target === "member" && opts.memberId
    ? await getPushSubscriptionsForMember(db, opts.memberId)
    : await getAllPushSubscriptions(db);

  if (subs.length === 0) {
    return { ok: true, sent: 0, failed: 0, total: 0, error: "No subscribers found. Members must open the app and allow notifications first." };
  }

  const payload: PushPayload = {
    title: opts.title || "Sevadal",
    body:  opts.body  || "",
    icon:  "/icon-192.png",
    badge: "/icon-192.png",
    url:   opts.url || "/dashboard",
  };

  let sent = 0, failed = 0;
  for (const sub of subs) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload,
      vapidPrivateKeyJwk,
      vapidPublicKey,
      vapidSubject
    );
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (result.status === 410 || result.status === 404) {
        await deletePushSubscriptionByEndpoint(db, sub.endpoint);
      }
    }
  }

  return { ok: true, sent, failed, total: subs.length };
}
