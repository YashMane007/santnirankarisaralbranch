import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  json,
  redirect,
} from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getMemberById, setMemberPin } from "~/lib/db.server";
import { generateSalt, hashPin, isValidPin, isWeakPin } from "~/lib/auth.server";
import { commitSession } from "~/lib/session.server";
import { checkRateLimit } from "~/lib/ratelimit.server";

export const meta: MetaFunction = () => [
  { title: "Set Your PIN — Sevadal Attendance" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.toUpperCase();
  if (!id) throw redirect("/auth/login");
  return json({ memberId: id });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;

  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown";
  const rl = await checkRateLimit(DB, `setup-pin:ip:${ip}`, 10, 60);
  if (!rl.allowed) {
    return json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }

  const form = await request.formData();
  const memberId = (form.get("memberId") as string | null)?.trim().toUpperCase();
  const pin = form.get("pin") as string | null;
  const confirmPin = form.get("confirmPin") as string | null;

  if (!memberId || !pin || !confirmPin) {
    return json({ error: "All fields are required." }, { status: 400 });
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
  }

  if (isWeakPin(pin)) {
    return json(
      { error: "That PIN is too simple. Choose something less predictable." },
      { status: 400 }
    );
  }

  if (pin !== confirmPin) {
    return json({ error: "PINs do not match. Please try again." }, { status: 400 });
  }

  const member = await getMemberById(DB, memberId);
  if (!member || !member.is_active) {
    throw redirect("/auth/login");
  }

  // If PIN already set, don't allow re-setup this way — must use change PIN flow
  if (member.pin_set) {
    throw redirect("/auth/login");
  }

  const salt = await generateSalt();
  const pinHash = await hashPin(pin, salt);
  await setMemberPin(DB, memberId, pinHash, salt);

  const cookieHeader = await commitSession(request, SESSION_SECRET, {
    memberId: member.id,
    isAdmin: member.is_admin === 1 || member.is_super_admin === 1,
    isSuperAdmin: member.is_super_admin === 1,
    memberName: member.name,
  });

  const isAnyAdmin = member.is_admin === 1 || member.is_super_admin === 1;
  throw redirect(isAnyAdmin ? "/admin" : "/dashboard", {
    headers: { "Set-Cookie": cookieHeader },
  });
}

export default function SetupPinPage() {
  const { memberId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">🔐</div>
          <div className="auth-logo-title">Set Your PIN</div>
          <div className="auth-logo-sub">
            First login for <strong>{memberId}</strong>
          </div>
        </div>

        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-500)",
            marginBottom: "20px",
            lineHeight: "1.5",
            textAlign: "center",
          }}
        >
          Choose a 4-digit PIN to secure your account. You'll use this every time you log in.
        </p>

        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <input type="hidden" name="memberId" value={memberId} />

          <div className="form-group">
            <label className="form-label" htmlFor="pin">
              New PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              className={`form-input${actionData?.error ? " error" : ""}`}
              placeholder="4 digits"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              autoFocus
              required
            />
            <span className="form-hint">Avoid: 1234, 0000, 1111, etc.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPin">
              Confirm PIN
            </label>
            <input
              id="confirmPin"
              name="confirmPin"
              type="password"
              className={`form-input${actionData?.error ? " error" : ""}`}
              placeholder="Re-enter PIN"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
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
                Setting PIN…
              </>
            ) : (
              "Set PIN & Login"
            )}
          </button>
        </Form>
      </div>
    </div>
  );
}
