/**
 * Admin Layout — single sidebar source of truth.
 * All /admin/* child routes render via <Outlet />.
 * This eliminates the nav-shuffling bug: sidebar defined ONCE here.
 */
import { type LoaderFunctionArgs, json, redirect } from "@remix-run/cloudflare";
import { Form, Link, Outlet, useLocation, useRouteLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdmin } from "~/lib/session.server";
import { getKillSwitch, shouldBlock } from "~/lib/killswitch.server";
import { getAppSettings } from "~/lib/appsettings.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const ks = await getKillSwitch(DB);
  if (shouldBlock(ks, session.isSuperAdmin ? "super" : "admin")) {
    throw redirect("/maintenance");
  }
  const appSettings = await getAppSettings(DB);
  return json({ adminName: session.memberName, isSuperAdmin: session.isSuperAdmin, adminId: session.memberId, banner: appSettings.announcement_banner });
}

export type AdminLayoutData = { adminName: string; isSuperAdmin: boolean; adminId: string; banner: string };

export function useAdminLayout(): AdminLayoutData {
  return useRouteLoaderData("routes/admin") as AdminLayoutData;
}

function buildNav(isSuperAdmin: boolean) {
  const links = [
    { to: "/admin",            label: "Dashboard",      icon: "📊", exact: true },
    { to: "/admin/members",    label: "Members",        icon: "👥" },
    { to: "/admin/locations",  label: "Locations",      icon: "📍" },
    { to: "/admin/attendance", label: "Attendance",     icon: "📋" },
    { to: "/admin/export",     label: "Export Data",     icon: "📥" },
  ];
  // SA is NOT counted in attendance → no "My Attendance" link for SA
  if (!isSuperAdmin) links.push({ to: "/admin/mark-self", label: "My Attendance", icon: "✅" });
  // All admins
  links.push({ to: "/admin/announcements", label: "Announcements", icon: "📢" });
  links.push({ to: "/admin/audit-log",     label: "Audit Log",     icon: "📜" });

  if  (isSuperAdmin) links.push(
    { to: "/admin/satsang-types", label: "Satsang Types", icon: "🏛️" },
    { to: "/admin/seva-roles",    label: "Seva Roles",    icon: "⚡"  },
    { to: "/admin/permissions",   label: "Permissions",   icon: "🔐"  },
    { to: "/admin/settings",      label: "Settings",      icon: "⚙️"  },
  );
  return links;
}

function SidebarInner({ adminName, isSuperAdmin, onLinkClick }: { adminName:string; isSuperAdmin:boolean; onLinkClick?:()=>void }) {
  const loc = useLocation();
  const nav  = buildNav(isSuperAdmin);
  const active = (to: string, exact=false) =>
    exact ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");

  return (
    <>
      <div className="admin-sidebar__brand">
        <div className="admin-sidebar__brand-logo">
          <div className="admin-sidebar__logo-mark">🙏</div>
          <div>
            <div className="admin-sidebar__brand-name">Sevadal Admin</div>
            <div className="admin-sidebar__brand-sub">Sant Nirankari Mission</div>
          </div>
        </div>
      </div>

      <nav className="admin-sidebar__nav">
        {nav.map(({ to, label, icon, exact }) => (
          <Link key={to} to={to} onClick={onLinkClick} title={label}
            className={`admin-sidebar__link${active(to, exact) ? " active" : ""}`}>
            <span style={{ fontSize:"16px", flexShrink:0 }}>{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__user">
          <span className={`admin-role-badge ${isSuperAdmin?"super":"normal"}`}>
            {isSuperAdmin ? "Super Admin" : "Admin"}
          </span>
          <span className="admin-sidebar__user-name">{adminName}</span>
        </div>
        <Form method="post" action="/auth/logout">
          <button type="submit" className="admin-sidebar__link" style={{ color:"#f87171", width:"100%" }} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Logout</span>
          </button>
        </Form>
      </div>
    </>
  );
}

export default function AdminLayout() {
  const { adminName, isSuperAdmin, banner } = useRouteLoaderData("routes/admin") as AdminLayoutData;
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <div className="admin-shell">
      {/* Desktop sidebar */}
      <aside className="admin-sidebar admin-sidebar--desktop">
        <SidebarInner adminName={adminName} isSuperAdmin={isSuperAdmin} />
      </aside>

      {/* Mobile backdrop */}
      {open && <div className="mobile-overlay" onClick={() => setOpen(false)} />}

      {/* Mobile drawer */}
      <aside className={`admin-sidebar admin-sidebar--mobile${open ? " open" : ""}`}>
        <SidebarInner adminName={adminName} isSuperAdmin={isSuperAdmin} onLinkClick={() => setOpen(false)} />
      </aside>

      {/* Hamburger button — mobile only */}
      <button className="hamburger-btn" onClick={() => setOpen(o => !o)} aria-label="Menu" title="Open menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Content rendered by child routes */}
      <div className="admin-main">
        {banner && (
          <div style={{background:"var(--saffron-600)",color:"white",textAlign:"center",padding:"7px 16px",fontSize:"13px",fontWeight:"500"}}>
            📢 {banner}
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
