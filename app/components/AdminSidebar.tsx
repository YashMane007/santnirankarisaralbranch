import { Form, Link } from "@remix-run/react";

interface Props {
  activePath: string;
  adminName: string;
  isSuperAdmin: boolean;
}

export function AdminSidebar({ activePath, adminName, isSuperAdmin }: Props) {
  const navLinks = [
    { to: "/admin", label: "Dashboard", icon: "📊", exact: true },
    { to: "/admin/members", label: "Members", icon: "👥" },
    { to: "/admin/locations", label: "Locations", icon: "📍" },
    { to: "/admin/attendance", label: "Attendance", icon: "📋" },
    { to: "/admin/export", label: "Export CSV", icon: "📥" },
    ...(isSuperAdmin
      ? [
          { to: "/admin/satsang-types", label: "Satsang Types", icon: "🏛️" },
          { to: "/admin/seva-roles", label: "Seva Roles", icon: "⚡" },
        ]
      : []),
  ];

  return (
    <aside className="admin-sidebar">
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
        {navLinks.map(({ to, label, icon, exact }) => {
          const isActive = exact ? activePath === to : activePath.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`admin-sidebar__link${isActive ? " active" : ""}`}
            >
              <span style={{ fontSize: "16px" }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="admin-sidebar__footer">
        <div
          style={{
            fontSize: "11px",
            color: "var(--gray-400)",
            paddingLeft: "10px",
            marginBottom: "6px",
          }}
        >
          {isSuperAdmin && (
            <span
              style={{
                background: "var(--saffron-600)",
                color: "white",
                borderRadius: "4px",
                padding: "1px 6px",
                fontSize: "10px",
                fontWeight: "700",
                marginRight: "6px",
              }}
            >
              SUPER ADMIN
            </span>
          )}
          <strong style={{ color: "white" }}>{adminName}</strong>
        </div>
        <Form method="post" action="/auth/logout">
          <button
            type="submit"
            className="admin-sidebar__link"
            style={{ color: "#f87171", width: "100%" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </Form>
      </div>
    </aside>
  );
}
