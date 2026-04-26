/**
 * /auth/super-login
 *
 * A low-profile login page exclusively for Super Admins.
 * Accessible even when the kill switch is fully ON (both members & admins blocked).
 * Regular members/admins are rejected here — they must use /auth/login.
 * Not linked from any public page; SA knows this URL.
 */
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  json,
  redirect,
} from "@remix-run/cloudflare";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { getMemberById } from "~/lib/db.server";
import { verifyPin } from "~/lib/auth.server";
import { commitSession, getSession } from "~/lib/session.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { checkRateLimit } from "~/lib/ratelimit.server";

export const meta: MetaFunction = () => [
  { title: "Admin Access — Sevadal" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { SESSION_SECRET } = context.cloudflare.env;
  const session = await getSession(request, SESSION_SECRET);

  // Already logged in as super admin → go to admin
  if (session.get("memberId") && session.get("isSuperAdmin")) {
    throw redirect("/admin");
  }
  // Already logged in but not SA → kick out to normal area
  if (session.get("memberId")) {
    throw redirect("/dashboard");
  }

  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;

  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown";
  // Stricter rate limit for this endpoint — 5 attempts per minute
  const rl = await checkRateLimit(DB, `super-login:ip:${ip}`, 5, 60);
  if (!rl.allowed) {
    return json(
      { error: "Too many attempts. Please wait." },
      { status: 429 }
    );
  }

  const form = await request.formData();
  const memberId = (form.get("memberId") as string | null)?.trim().toUpperCase();
  const pin = form.get("pin") as string | null;

  if (!memberId || !pin) {
    return json({ error: "Member ID and PIN are required." }, { status: 400 });
  }

  const member = await getMemberById(DB, memberId);

  // Only super admins allowed — use same generic error to avoid enumeration
  if (!member || !member.is_active || member.is_super_admin !== 1) {
    return json({ error: "Access denied." }, { status: 403 });
  }

  if (!member.pin_hash || !member.pin_salt) {
    return json({ error: "PIN not configured for this account." }, { status: 403 });
  }

  const ok = await verifyPin(pin, member.pin_hash, member.pin_salt);
  if (!ok) {
    return json({ error: "Access denied." }, { status: 403 });
  }

  const cookieHeader = await commitSession(request, SESSION_SECRET, {
    memberId: member.id,
    isAdmin: true,
    isSuperAdmin: true,
    memberName: member.name,
  });

  await logAudit(DB, {
    actorId: member.id,
    actorName: member.name,
    actorRole: "super_admin",
    action: "login",
    details: { via: "super-login" },
    ip: getClientIp(request),
  });

  throw redirect("/admin", {
    headers: { "Set-Cookie": cookieHeader },
  });
}

export default function SuperLoginPage() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">🔐</div>
          <div className="auth-logo-title">Admin Access</div>
          <div className="auth-logo-sub" style={{ color: "var(--error)", fontWeight: 600, fontSize: "12px" }}>
            Super Admin Only
          </div>
        </div>

        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="memberId">
              Member ID
            </label>
            <input
              id="memberId"
              name="memberId"
              type="text"
              className={`form-input${actionData?.error ? " error" : ""}`}
              placeholder="Super Admin Member ID"
              autoCapitalize="characters"
              autoComplete="username"
              autoFocus
              required
              style={{ textTransform: "uppercase" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pin">
              PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              className={`form-input${actionData?.error ? " error" : ""}`}
              placeholder="4-digit PIN"
              inputMode="numeric"
              maxLength={4}
              autoComplete="current-password"
              required
            />
          </div>

          {actionData?.error && (
            <div className="alert alert-error" role="alert">
              <span>⚠️</span>
              <span>{actionData.error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" style={{ borderTopColor: "white" }} />
                Verifying…
              </>
            ) : (
              "Access Admin Panel"
            )}
          </button>
        </Form>

        <p
          style={{
            textAlign: "center",
            fontSize: "11px",
            color: "var(--gray-400)",
            marginTop: "20px",
          }}
        >
          This page is for Super Admins only. Unauthorized access attempts are logged.
        </p>
      </div>
    </div>
  );
}
