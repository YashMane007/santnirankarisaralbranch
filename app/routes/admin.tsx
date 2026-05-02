/**
 * Admin Layout — single sidebar source of truth.
 * All /admin/* child routes render via <Outlet />.
 * This eliminates the nav-shuffling bug: sidebar defined ONCE here.
 */
import { type LoaderFunctionArgs, json, redirect } from "@remix-run/cloudflare";
import { Form, Link, Outlet, useLocation, useRouteLoaderData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdmin } from "~/lib/session.server";
import { getKillSwitch, shouldBlock } from "~/lib/killswitch.server";
import { getAppSettings } from "~/lib/appsettings.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const ks = await getKillSwitch(DB);
  if (shouldBlock(ks, session.isSuperAdmin ? "super" : "admin")) {
    throw redirect("/maintenance");
  }
  const appSettings = await getAppSettings(DB);
  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  return json({
    adminName:            session.memberName,
    isSuperAdmin:         session.isSuperAdmin,
    adminId:              session.memberId,
    banner:               appSettings.announcement_banner,
    canViewMembers:       can(perms, "view_members")       || session.isSuperAdmin,
    canViewLocations:     can(perms, "view_locations")     || session.isSuperAdmin,
    canViewAttendance:    can(perms, "view_attendance")    || session.isSuperAdmin,
    canExport:            can(perms, "export_data")        || session.isSuperAdmin,
    canViewAnnouncements: can(perms, "view_announcements") || session.isSuperAdmin,
    canViewAuditLog:      can(perms, "view_audit_log")     || session.isSuperAdmin,
  });
}

export type AdminLayoutData = {
  adminName:            string;
  isSuperAdmin:         boolean;
  adminId:              string;
  banner:               string;
  canViewMembers:       boolean;
  canViewLocations:     boolean;
  canViewAttendance:    boolean;
  canExport:            boolean;
  canViewAnnouncements: boolean;
  canViewAuditLog:      boolean;
};

export function useAdminLayout(): AdminLayoutData {
  return useRouteLoaderData("routes/admin") as AdminLayoutData;
}

function buildNav(isSuperAdmin: boolean, p: AdminLayoutData) {
  const links = [
    { to: "/admin",             label: "Dashboard",      icon: "📊", exact: true },
    p.canViewMembers       && { to: "/admin/members",       label: "Members",       icon: "👥" },
    p.canViewLocations     && { to: "/admin/locations",     label: "Locations",     icon: "📍" },
    p.canViewAttendance    && { to: "/admin/attendance",    label: "Attendance",    icon: "📋" },
    p.canExport            && { to: "/admin/export",        label: "Export Data",   icon: "📥" },
    // SA is NOT counted in attendance — no "My Attendance" link for SA
    !isSuperAdmin          && { to: "/admin/mark-self",     label: "My Attendance", icon: "✅" },
    p.canViewAnnouncements && { to: "/admin/announcements", label: "Announcements", icon: "📢" },
    p.canViewAuditLog      && { to: "/admin/audit-log",     label: "Audit Log",     icon: "📜" },
  ].filter(Boolean) as { to: string; label: string; icon: string; exact?: boolean }[];

  if (isSuperAdmin) links.push(
    { to: "/admin/satsang-types", label: "Satsang Types", icon: "🏛️" },
    { to: "/admin/seva-roles",    label: "Seva Roles",    icon: "⚡"  },
    { to: "/admin/permissions",   label: "Permissions",   icon: "🔐"  },
    { to: "/admin/settings",      label: "Settings",      icon: "⚙️"  },
  );
  return links;
}

function SidebarInner({
  adminName, isSuperAdmin, onLinkClick, layoutData,
}: {
  adminName: string;
  isSuperAdmin: boolean;
  onLinkClick?: () => void;
  layoutData: AdminLayoutData;
}) {
  const loc = useLocation();
  const nav  = buildNav(isSuperAdmin, layoutData);
  const active = (to: string, exact = false) =>
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
          <Link
            key={to}
            to={to}
            onClick={onLinkClick}
            title={label}
            className={`admin-sidebar__link${active(to, exact) ? " active" : ""}`}
          >
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__user">
          <span className={`admin-role-badge ${isSuperAdmin ? "super" : "normal"}`}>
            {isSuperAdmin ? "Super Admin" : "Admin"}
          </span>
          <span className="admin-sidebar__user-name">{adminName}</span>
        </div>
        <Form method="post" action="/auth/logout">
          <button
            type="submit"
            className="admin-sidebar__link"
            style={{ color: "#f87171", width: "100%" }}
            title="Logout"
          >
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

function AdminLoadingBar() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "3px", zIndex: 9999,
      background: "linear-gradient(90deg,var(--saffron-400),var(--saffron-700),var(--saffron-400))",
      backgroundSize: "400px 100%",
      animation: "shimmer 1.2s infinite linear",
    }}/>
  );
}

export default function AdminLayout() {
  const layoutData = useRouteLoaderData("routes/admin") as AdminLayoutData;
  const { adminName, isSuperAdmin, banner } = layoutData;
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <div className="admin-shell">
      {/* Desktop sidebar */}
      <aside className="admin-sidebar admin-sidebar--desktop">
        <SidebarInner adminName={adminName} isSuperAdmin={isSuperAdmin} layoutData={layoutData} />
      </aside>

      {/* Mobile backdrop */}
      {open && <div className="mobile-overlay" onClick={() => setOpen(false)} />}

      {/* Mobile drawer */}
      <aside className={`admin-sidebar admin-sidebar--mobile${open ? " open" : ""}`}>
        <SidebarInner
          adminName={adminName}
          isSuperAdmin={isSuperAdmin}
          onLinkClick={() => setOpen(false)}
          layoutData={layoutData}
        />
      </aside>

      {/* Hamburger button — mobile only */}
      <button
        className="hamburger-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Menu"
        title="Open menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Content rendered by child routes */}
      <div className="admin-main" style={{ position: "relative" }}>
        {banner && (
          <div style={{
            background: "var(--saffron-600)", color: "white", textAlign: "center",
            padding: "7px 16px", fontSize: "13px", fontWeight: "500",
          }}>
            📢 {banner}
          </div>
        )}
        <AdminLoadingBar />
        <Outlet />
      </div>
    </div>
  );
}