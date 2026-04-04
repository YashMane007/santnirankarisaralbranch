import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getKillSwitch } from "~/lib/killswitch.server";
import { getSession } from "~/lib/session.server";

export const meta: MetaFunction = () => [{ title: "Under Maintenance — Sevadal" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const ks = await getKillSwitch(DB);
  // Super admin always bypasses
  const session = await getSession(request, SESSION_SECRET);
  const isSuperAdmin = session.get("isSuperAdmin");
  if (isSuperAdmin) {
    const { redirect } = await import("@remix-run/cloudflare");
    throw redirect("/admin");
  }
  return json({ message: ks.message }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    }
  });
}

export default function MaintenancePage() {
  const { message } = useLoaderData<typeof loader>();
  return (
    <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(160deg,#fff7ed 0%,white 60%)", padding:"24px", fontFamily:"'DM Sans',sans-serif" }}>
      {/* Push a history entry so the back button stays on this page */}
      <script dangerouslySetInnerHTML={{ __html: `
        history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', function() {
          history.pushState(null, '', window.location.href);
        });
      `}} />
      <div style={{ background:"white", borderRadius:"16px", padding:"40px 32px", maxWidth:"420px", width:"100%", textAlign:"center", boxShadow:"0 10px 30px rgba(0,0,0,.1)" }}>
        <div style={{ fontSize:"52px", marginBottom:"16px" }}>🔧</div>
        <h1 style={{ fontFamily:"'Baloo 2',cursive", fontWeight:"800", fontSize:"22px", color:"#1c1917", marginBottom:"12px" }}>
          Under Maintenance
        </h1>
        <p style={{ fontSize:"14px", color:"#78716c", lineHeight:"1.6", marginBottom:"24px" }}>
          {message}
        </p>
        <button
          onClick={() => { window.location.href = "/"; }}
          style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:"#f97316", color:"white", border:"none", borderRadius:"9999px", padding:"12px 28px", fontSize:"14px", fontWeight:"600", cursor:"pointer" }}
        >
          🔄 Refresh
        </button>
        <div style={{ fontSize:"12px", color:"#a8a29e", marginTop:"20px" }}>
          Sant Nirankari Mission — Sevadal Attendance
        </div>
      </div>
    </div>
  );
}
