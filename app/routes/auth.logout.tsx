import { type ActionFunctionArgs, redirect } from "@remix-run/cloudflare";
import { destroySession } from "~/lib/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const secret = context.cloudflare.env.SESSION_SECRET;
  const cookieHeader = await destroySession(request, secret);
  throw redirect("/news", {
    headers: { "Set-Cookie": cookieHeader },
  });
}

// GET to /auth/logout also works (e.g. direct URL visit)
export async function loader({ request, context }: ActionFunctionArgs) {
  const secret = context.cloudflare.env.SESSION_SECRET;
  const cookieHeader = await destroySession(request, secret);
  throw redirect("/news", {
    headers: { "Set-Cookie": cookieHeader },
  });
}
