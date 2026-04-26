import { redirect, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getKillSwitch } from "~/lib/killswitch.server";
import { getSession } from "~/lib/session.server";

export const meta: MetaFunction = () => [{ title: "Under Maintenance — Sevadal" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;

  const [ks, session] = await Promise.all([
    getKillSwitch(DB),
    getSession(request, SESSION_SECRET),
  ]);

  const isSuperAdmin = session.get("isSuperAdmin");
  const memberId     = session.get("memberId");
  const isAdmin      = session.get("isAdmin");

  // Super admin always bypasses
  if (isSuperAdmin) throw redirect("/admin");

  // Logged-in admin — redirect out if admin block is lifted
  if (memberId && isAdmin && !ks.blockAdmins) throw redirect("/admin");

  // Logged-in member — redirect out if member block is lifted
  if (memberId && !isAdmin && !ks.blockMembers) throw redirect("/news");

  // Guests always see the maintenance page — no redirect back to login/news.
  // They use "Check Again" button which re-hits this loader.
  // If maintenance is fully off they'll get to news/login from other entry points.

  return json({ message: ks.message }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export default function MaintenancePage() {
  const { message } = useLoaderData<typeof loader>();
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#fff7ed 0%,white 60%)", padding: "24px", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ background: "white", borderRadius: "16px", padding: "40px 32px", maxWidth: "420px", width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,.1)" }}>
        <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔧</div>
        <h1 style={{ fontFamily: "'Baloo 2',cursive", fontWeight: "800", fontSize: "22px", color: "#1c1917", marginBottom: "12px" }}>
          Under Maintenance
        </h1>
        <p style={{ fontSize: "14px", color: "#78716c", lineHeight: "1.6", marginBottom: "24px" }}>
          {message}
        </p>
        {/* Full page reload re-hits the server loader; redirects out if maintenance lifted */}
        <a
          // href="/maintenance"
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#f97316", color: "white", textDecoration: "none", borderRadius: "9999px", padding: "12px 28px", fontSize: "14px", fontWeight: "600" }}
        >
          🔄 Check Again
        </a>
        <div style={{ fontSize: "12px", color: "#a8a29e", marginTop: "20px" }}>
          Sant Nirankari Mission — Sevadal Attendance
        </div>
        {/* Discreet SA entry — faint dot only SA knows about */}
        <div style={{ marginTop: "32px" }}>
          <Link to="/auth/super-login" style={{ fontSize: "11px", color: "#e5e0db", textDecoration: "none" }} aria-label="Admin access">·</Link>
        </div>
      </div>
    </div>
  );
}
