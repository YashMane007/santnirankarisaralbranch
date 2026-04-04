import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getPhotoResponse } from "~/lib/r2.server";
import { getSession } from "~/lib/session.server";

/**
 * Unified photo/file serving route.
 *
 * Access rules:
 *  - photos/*         → must be logged in (member photos are private)
 *  - announcements/*  → public (no login needed, guests on /news can see them)
 *  - any other prefix → 403
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { BUCKET, SESSION_SECRET } = context.cloudflare.env;

  const key = params["*"];
  if (!key) return new Response("Not found", { status: 404 });

  // Announcement attachments are public — no login required
  if (key.startsWith("announcements/")) {
    return getPhotoResponse(BUCKET, key);
  }

  // Member photos and everything else requires login
  if (key.startsWith("photos/")) {
    const session = await getSession(request, SESSION_SECRET);
    const memberId = session.get("memberId");
    if (!memberId) return new Response("Unauthorized", { status: 401 });
    return getPhotoResponse(BUCKET, key);
  }

  return new Response("Forbidden", { status: 403 });
}
