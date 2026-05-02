import {
  createCookieSessionStorage,
  redirect,
} from "@remix-run/cloudflare";

export type SessionData = {
  memberId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  memberName: string;
};

export function getSessionStorage(secret: string, request?: Request) {
  const isHttps = request ? request.url.startsWith("https://") : process.env.NODE_ENV === "production";
  return createCookieSessionStorage<SessionData>({
    cookie: {
      name: "__sevadal",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      secure: isHttps,
    },
  });
}

export async function getSession(request: Request, secret: string) {
  const storage = getSessionStorage(secret, request);
  return storage.getSession(request.headers.get("Cookie"));
}

export async function destroySession(request: Request, secret: string) {
  const storage = getSessionStorage(secret, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return storage.destroySession(session);
}

export async function commitSession(request: Request, secret: string, data: SessionData) {
  const storage = getSessionStorage(secret, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("memberId", data.memberId);
  session.set("isAdmin", data.isAdmin);
  session.set("isSuperAdmin", data.isSuperAdmin);
  session.set("memberName", data.memberName);
  return storage.commitSession(session);
}

/**
 * Require any authenticated member.
 * Re-checks DB on every request — if member is deactivated, force logout.
 * If role changed, updates session in-place.
 */
export async function requireMember(request: Request, secret: string, db?: D1Database): Promise<SessionData> {
  const session = await getSession(request, secret);
  const memberId = session.get("memberId");
  if (!memberId) throw redirect("/auth/login");

  // If DB provided, do live status check
  if (db) {
    const member = await db.prepare("SELECT id, name, is_admin, is_super_admin, is_active FROM members WHERE id = ?")
      .bind(memberId).first<{ id: string; name: string; is_admin: number; is_super_admin: number; is_active: number }>();

    if (!member || !member.is_active) {
      // Member deactivated — show deactivated screen (do NOT force logout to login page)
      const storage = getSessionStorage(secret, request);
      const destroyHeader = await storage.destroySession(session);
      throw redirect("/account-deactivated", { headers: { "Set-Cookie": destroyHeader } });
    }

    // Return live data from DB (not stale session)
    return {
      memberId: member.id,
      isAdmin: member.is_admin === 1 || member.is_super_admin === 1,
      isSuperAdmin: member.is_super_admin === 1,
      memberName: member.name,
    };
  }

  return {
    memberId,
    isAdmin: session.get("isAdmin") ?? false,
    isSuperAdmin: session.get("isSuperAdmin") ?? false,
    memberName: session.get("memberName") ?? "",
  };
}

/** Require admin or super admin. */
export async function requireAdmin(request: Request, secret: string, db?: D1Database): Promise<SessionData> {
  const s = await requireMember(request, secret, db);
  if (!s.isAdmin && !s.isSuperAdmin) throw redirect("/dashboard");
  return s;
}

/** Require super admin only. */
export async function requireSuperAdmin(request: Request, secret: string, db?: D1Database): Promise<SessionData> {
  const s = await requireMember(request, secret, db);
  if (!s.isSuperAdmin) throw redirect("/admin");
  return s;
}
