import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  json,
  redirect,
} from "@remix-run/cloudflare";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { getMemberById } from "~/lib/db.server";
import { verifyPin } from "~/lib/auth.server";
import { commitSession, getSession } from "~/lib/session.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { checkRateLimit } from "~/lib/ratelimit.server";


export const meta: MetaFunction = () => [
  { title: "Login — Sevadal Attendance" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const secret = context.cloudflare.env.SESSION_SECRET;
  const session = await getSession(request, secret);
  if (session.get("memberId")) {
    const isAdmin = session.get("isAdmin");
    // throw redirect(isAdmin ? "/admin" : "/dashboard");
    throw redirect(isAdmin ? "/admin" : "/news");
  }
  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;

  // Rate limit: 10 attempts per minute per IP
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown";
  const rl = await checkRateLimit(DB, `login:ip:${ip}`, 10, 60);
  if (!rl.allowed) {
    return json(
      { error: "Too many login attempts. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  const form = await request.formData();
  const memberId = (form.get("memberId") as string | null)?.trim().toUpperCase();
  const pin = form.get("pin") as string | null;

  if (!memberId) {
    return json({ error: "Member ID is required." }, { status: 400 });
  }

  const member = await getMemberById(DB, memberId);

  if (!member || !member.is_active) {
    // Generic message — don't reveal whether ID exists
    return json({ error: "Invalid Member ID or PIN." }, { status: 401 });
  }

  // If PIN not set yet → redirect to setup (no PIN needed to proceed)
  if (!member.pin_set) {
    // Store the member id temporarily in the URL (not session — PIN not verified yet)
    throw redirect(`/auth/setup-pin?id=${encodeURIComponent(memberId)}`);
  }

  if (!pin) {
    return json({ error: "PIN is required." }, { status: 400 });
  }

  const ok = await verifyPin(pin, member.pin_hash!, member.pin_salt!);
  if (!ok) {
    return json({ error: "Invalid Member ID or PIN." }, { status: 401 });
  }

  const cookieHeader = await commitSession(request, SESSION_SECRET, {
    memberId: member.id,
    isAdmin: member.is_admin === 1 || member.is_super_admin === 1,
    isSuperAdmin: member.is_super_admin === 1,
    memberName: member.name,
  });

  const isAnyAdmin = member.is_admin === 1 || member.is_super_admin === 1;

  // Audit log the login
  await logAudit(DB, {
    actorId: member.id,
    actorName: member.name,
    actorRole: member.is_super_admin === 1 ? "super_admin" : member.is_admin === 1 ? "admin" : "member",
    action: "login",
    ip: getClientIp(request),
  });

  throw redirect(isAnyAdmin ? "/admin" : "/news", {
    headers: { "Set-Cookie": cookieHeader },
  });
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">🙏</div>
          <div className="auth-logo-title">Sevadal Attendance</div>
          <div className="auth-logo-sub">Sant Nirankari Mission</div>
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
              placeholder="e.g. SNM-001 or 1001"
              autoCapitalize="characters"
              autoComplete="username"
              autoFocus
              required
              style={{ textTransform: "uppercase" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pin">
              4-Digit PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              className={`form-input${actionData?.error ? " error" : ""}`}
              placeholder="Enter your PIN (or leave empty for first login)"
              inputMode="numeric"
              maxLength={4}
              autoComplete="current-password"
            />
            <span className="form-hint">First time? Leave PIN empty and click Login.</span>
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
              "Login"
            )}
          </button>
        </Form>

        {/* YM */}
        <div style={{ marginTop: "16px" }}>
           <Link to="/news" className="btn btn-secondary btn-lg btn-full">
             View News & Notices →
            </Link>
       </div>
        {/* YM */}

        <p
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--gray-400)",
            marginTop: "20px",
          }}
        >
          Don't have a PIN yet? Use your Member ID to set one on first login.
        </p>
      </div>
    </div>
  );
}
