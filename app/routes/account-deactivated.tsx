import { type MetaFunction } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Account Deactivated — Sevadal" }];

export default function AccountDeactivatedPage() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-logo">
          <div className="auth-logo-mark">🔒</div>
          <div className="auth-logo-title">Account Deactivated</div>
          <div className="auth-logo-sub">Sant Nirankari Mission</div>
        </div>

        <div style={{
          background: "var(--error-light)",
          border: "1px solid var(--error)",
          borderRadius: "var(--radius-sm)",
          padding: "16px",
          marginBottom: "24px",
          color: "#b91c1c",
          fontSize: "14px",
          lineHeight: "1.6",
        }}>
          <strong>Your account has been deactivated.</strong><br />
          Please contact your administrator to restore access.
        </div>

        {/* <Link to="/auth/login" className="btn btn-primary btn-lg btn-full" style={{ textDecoration: "none" }}> */}
          {/* ← Back to Login */}
        <Link to="" className="btn btn-primary btn-lg btn-full" style={{ textDecoration: "none" }}>
          Refresh
        </Link>
      </div>
    </div>
  );
}
