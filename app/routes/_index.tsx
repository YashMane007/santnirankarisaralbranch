import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getSession } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const secret = context.cloudflare.env.SESSION_SECRET;
  const session = await getSession(request, secret);
  const memberId = session.get("memberId");
  // Not logged in → public news board
  if (!memberId) throw redirect("/news");
  const isAdmin = session.get("isAdmin");
  const isSuperAdmin = session.get("isSuperAdmin");
  if (isAdmin || isSuperAdmin) throw redirect("/admin");
  throw redirect("/dashboard  ");
}

export default function Index() {
  return null;
}
