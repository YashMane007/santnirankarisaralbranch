import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Toast } from "~/components/Toast";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { requireSuperAdmin } from "~/lib/session.server";
import { getAppSettings, setSettings } from "~/lib/appsettings.server";
import { getKillSwitch, setKillSwitch } from "~/lib/killswitch.server";
import { wipeAuditLog, purgeOldAuditLogs, logAudit, getClientIp } from "~/lib/audit.server";
import { getMemberById } from "~/lib/db.server";
import { verifyPin } from "~/lib/auth.server";

export const meta: MetaFunction = () => [{ title: "Settings — Sevadal Admin" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  await requireSuperAdmin(request, SESSION_SECRET, DB);
  const [appSettings, ks] = await Promise.all([getAppSettings(DB), getKillSwitch(DB)]);
  // Estimate storage usage
  const [attCount, memberCount, auditCount, annCount, locHistCount] = await Promise.all([
    DB.prepare("SELECT COUNT(*) as c FROM attendance").first<{c:number}>(),
    DB.prepare("SELECT COUNT(*) as c FROM members").first<{c:number}>(),
    DB.prepare("SELECT COUNT(*) as c FROM audit_log").first<{c:number}>(),
    DB.prepare("SELECT COUNT(*) as c FROM announcements").first<{c:number}>(),
    DB.prepare("SELECT COUNT(*) as c FROM location_history").first<{c:number}>(),
  ]);
  const storageStats = {
    attendance: attCount?.c ?? 0,
    members: memberCount?.c ?? 0,
    auditLog: auditCount?.c ?? 0,
    announcements: annCount?.c ?? 0,
    locationHistory: locHistCount?.c ?? 0,
  };
  return json({ appSettings, ks, storageStats });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireSuperAdmin(request, SESSION_SECRET, DB);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "app-settings") {
    await setSettings(DB, {
      app_name: (form.get("app_name") as string)?.trim() || "Sevadal Attendance",
      org_name: (form.get("org_name") as string)?.trim() || "Sant Nirankari Mission",
      welcome_message: (form.get("welcome_message") as string)?.trim() || "",
      footer_text: (form.get("footer_text") as string)?.trim() || "",
      announcement_banner: (form.get("announcement_banner") as string)?.trim() || "",
    });
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "setting_changed", details: { section: "app-settings" }, ip: getClientIp(request) });
    return json({ success: "App settings saved." });
  }

  if (intent === "kill-switch") {
    const blockMembers = form.getAll("blockMembers").includes("1");
    const blockAdmins  = form.getAll("blockAdmins").includes("1");
    const blockLogin   = form.getAll("blockLogin").includes("1");
    const blockGuests  = form.getAll("blockGuests").includes("1");
    await setKillSwitch(DB, { blockMembers, blockAdmins, blockLogin, blockGuests, message: (form.get("message") as string)?.trim() || "Site is under maintenance." });
    return json({ success: "Kill switch saved." });
  }

  if (intent === "audit-settings") {
    await setSettings(DB, {
      audit_enabled: form.getAll("audit_enabled").includes("1") ? "1" : "0",
      audit_retention_days: (form.get("audit_retention_days") as string) || "0",
    });
    return json({ success: "Audit settings saved." });
  }

  if (intent === "purge-audit") {
    const days = parseInt(form.get("purge_days") as string) || 90;
    const deleted = await purgeOldAuditLogs(DB, days);
    return json({ success: `Purged ${deleted} audit entries older than ${days} days.` });
  }

  if (intent === "wipe-audit") {
    await wipeAuditLog(DB);
    return json({ success: "Audit log wiped." });
  }

  if (intent === "telegram-settings") {
    const days = ["mon","tue","wed","thu","fri","sat","sun"].filter(d => form.getAll(`day_${d}`).includes("1")).join(",");
    await setSettings(DB, {
      telegram_enabled: form.getAll("telegram_enabled").includes("1") ? "1" : "0",
      telegram_backup_time: (form.get("telegram_backup_time") as string) || "00:06",
      telegram_backup_days: days || "mon,tue,wed,thu,fri,sat,sun",
    });
    return json({ success: "Telegram settings saved." });
  }

  if (intent === "test-telegram") {
    const env = context.cloudflare.env as any;
    const botToken = (env.TELEGRAM_BOT_TOKEN as string) ?? "";
    const chatId   = (env.TELEGRAM_CHAT_ID as string) ?? "";
    if (!botToken) return json({ error: "TELEGRAM_BOT_TOKEN not set. Use .dev.vars locally or 'wrangler secret put TELEGRAM_BOT_TOKEN' for production." });
    if (!chatId)   return json({ error: "TELEGRAM_CHAT_ID not set. Use .dev.vars locally or 'wrangler secret put TELEGRAM_CHAT_ID' for production." });
    // Direct fetch to get error details
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "✅ <b>Test from Sevadal</b>\nTelegram backup is configured correctly!", parse_mode: "HTML" }),
      });
      const body = await res.json() as any;
      if (body.ok) return json({ success: "✅ Test message sent! Check your Telegram." });
      return json({ error: `Telegram API error: ${body.description ?? JSON.stringify(body)}` });
    } catch (err: any) {
      return json({ error: `Network error: ${err?.message ?? "unknown"}` });
    }
  }

  if (intent === "misc-settings") {
    await setSettings(DB, {
      location_history_enabled: form.getAll("location_history_enabled").includes("1") ? "1" : "0",
    });
    return json({ success: "Settings saved." });
  }

  if (intent === "wipe-database") {
    const confirmWord = (form.get("confirm_word") as string)?.trim();
    const pin = form.get("pin") as string;
    if (confirmWord !== "delete") return json({ wipeError: 'Type "delete" to confirm.' });
    const member = await getMemberById(DB, session.memberId);
    if (!member?.pin_hash || !member?.pin_salt) return json({ wipeError: "Cannot verify PIN." });
    const ok = await verifyPin(pin, member.pin_hash, member.pin_salt);
    if (!ok) return json({ wipeError: "PIN incorrect." });
    await DB.prepare("DELETE FROM attendance").run();
    await DB.prepare("DELETE FROM location_history").run();
    await DB.prepare("DELETE FROM session_history").run();
    await DB.prepare("DELETE FROM audit_log").run();
    await DB.prepare("DELETE FROM announcements").run();
    await DB.prepare("DELETE FROM rate_limits").run();
    await DB.prepare("DELETE FROM members WHERE id != ?").bind(session.memberId).run();
    await DB.prepare("DELETE FROM admin_permissions").run();
    await DB.prepare("DELETE FROM locations_schedules").run();
    await DB.prepare("DELETE FROM sqlite_sequence").run();
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "database_wiped", ip: getClientIp(request) });
    return json({ success: "Database wiped. Members, locations and settings preserved." });
  }

  return json({ error: "Unknown." });
}

export default function AdminSettingsPage() {
  const data = useLoaderData<typeof loader>();
  const { appSettings, ks } = data;
  const ad = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const sub = nav.state === "submitting";
  const [showWipe, setShowWipe] = useState(false);
  const anyKS = ks.blockMembers || ks.blockAdmins;
  const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
  const selectedDays = new Set(appSettings.telegram_backup_days.split(",").map((d:string) => d.trim()));

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card">
      <div className="card-header"><h3>{title}</h3></div>
      <div className="card-body">{children}</div>
    </div>
  );

  return (
    <>
      <div className="admin-topbar"><h1 className="admin-topbar__title">Site Settings</h1></div>
      <div className="admin-content" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {ad?.success && <div className="alert alert-success">OK {ad.success}</div>}
        {ad?.error   && <div className="alert alert-error">Error {ad.error}</div>}

        <Section title="App Identity">
          <Form method="post" preventScrollReset style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input type="hidden" name="intent" value="app-settings" />
            <div className="form-group"><label className="form-label">App Name</label><input name="app_name" type="text" className="form-input" defaultValue={appSettings.app_name} /></div>
            <div className="form-group"><label className="form-label">Organization Name</label><input name="org_name" type="text" className="form-input" defaultValue={appSettings.org_name} /></div>
            <div className="form-group"><label className="form-label">Welcome Message (shown on member dashboard)</label><input name="welcome_message" type="text" className="form-input" defaultValue={appSettings.welcome_message} /></div>
            <div className="form-group"><label className="form-label">Footer Text</label><input name="footer_text" type="text" className="form-input" defaultValue={appSettings.footer_text} /></div>
            <div className="form-group"><label className="form-label">Announcement Banner (top of every page — leave blank to hide)</label><input name="announcement_banner" type="text" className="form-input" defaultValue={appSettings.announcement_banner} placeholder="e.g. Satsang on Sunday 10 AM" /></div>
            <button type="submit" className="btn btn-primary btn-md" disabled={sub}>Save App Settings</button>
          </Form>
        </Section>

        <Section title="Kill Switch / Maintenance Mode">
          <div style={{ background: anyKS?"var(--error-light)":"var(--success-light)", border:`1px solid ${anyKS?"#fca5a5":"#86efac"}`, borderRadius:"var(--radius-sm)", padding:"12px 16px", marginBottom:"16px" }}>
            <div style={{ fontWeight:"700", color:anyKS?"var(--error)":"var(--success)" }}>{anyKS?"Maintenance Mode ACTIVE":"Site is LIVE"}</div>
            <div style={{ fontSize:"12px", color:"var(--gray-500)" }}>Super admins always bypass.</div>
          </div>
          <Form method="post" preventScrollReset style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
            <input type="hidden" name="intent" value="kill-switch" />
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Block Members</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Members see maintenance page</div></div>
              <input type="checkbox" name="blockMembers" value="1" defaultChecked={ks.blockMembers} style={{ width:"18px", height:"18px" }} />
            </label>
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Block Normal Admins</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Admins see maintenance page, SA bypass</div></div>
              <input type="checkbox" name="blockAdmins" value="1" defaultChecked={ks.blockAdmins} style={{ width:"18px", height:"18px" }} />
            </label>
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Block Login Page</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Redirect /auth/login → maintenance (use /auth/super-login to access)</div></div>
              <input type="checkbox" name="blockLogin" value="1" defaultChecked={ks.blockLogin} style={{ width:"18px", height:"18px" }} />
            </label>
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Block News / Guest Page</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Public visitors can't see /news — redirected to maintenance</div></div>
              <input type="checkbox" name="blockGuests" value="1" defaultChecked={ks.blockGuests} style={{ width:"18px", height:"18px" }} />
            </label>
            <div className="form-group"><label className="form-label">Maintenance Message</label><textarea name="message" className="form-textarea" rows={2} defaultValue={ks.message} /></div>
            <button type="submit" className="btn btn-primary btn-md" disabled={sub}>Save Kill Switch</button>
          </Form>
        </Section>

        <Section title="Telegram Backup">
          <div className="alert alert-info" style={{ marginBottom:"14px", fontSize:"12px", lineHeight:"1.8" }}>
            <strong>⚠️ Cloudflare Workers do NOT read <code>.env</code> files.</strong><br/>
            <strong>Local dev:</strong> create a file named <code>.dev.vars</code> (not <code>.env</code>) in the project root:<br/>
            <code style={{display:"block",background:"var(--gray-100)",padding:"6px 10px",borderRadius:"4px",margin:"6px 0",fontFamily:"monospace",fontSize:"11px",whiteSpace:"pre"}}>{"SESSION_SECRET=your-32-char-secret\nTELEGRAM_BOT_TOKEN=123456789:AABBccDDeeff...\nTELEGRAM_CHAT_ID=-100123456789\nBACKUP_SECRET=any-random-string"}</code>
            <strong>Production:</strong> run these commands once:<br/>
            <code style={{display:"block",background:"var(--gray-100)",padding:"6px 10px",borderRadius:"4px",margin:"6px 0",fontFamily:"monospace",fontSize:"11px",whiteSpace:"pre"}}>{"wrangler secret put TELEGRAM_BOT_TOKEN\nwrangler secret put TELEGRAM_CHAT_ID\nwrangler secret put BACKUP_SECRET"}</code>
            Last backup: <strong>{appSettings.telegram_last_backup ? new Date(appSettings.telegram_last_backup).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : "Never"}</strong>
          </div>
          <Form method="post" preventScrollReset style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
            <input type="hidden" name="intent" value="telegram-settings" />
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Enable Telegram Backup</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Send CSV+PDF daily</div></div>
              <input type="checkbox" name="telegram_enabled" value="1" defaultChecked={appSettings.telegram_enabled} style={{ width:"18px", height:"18px" }} />
            </label>
            <div className="form-group"><label className="form-label">Backup Time (IST)</label><input name="telegram_backup_time" type="time" className="form-input" defaultValue={appSettings.telegram_backup_time} /></div>
            <div className="form-group">
              <label className="form-label">Backup Days</label>
              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", marginTop:"6px" }}>
                {DAYS.map(d => (
                  <label key={d} style={{ display:"flex", alignItems:"center", gap:"4px", fontSize:"13px" }}>
                    <input type="checkbox" name={`day_${d}`} value="1" defaultChecked={selectedDays.has(d)} style={{ accentColor:"var(--primary)" }} />
                    {d.charAt(0).toUpperCase()+d.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:"10px" }}>
              <button type="submit" className="btn btn-primary btn-md" disabled={sub}>Save</button>
            </div>
          </Form>
          <Form method="post" preventScrollReset style={{ marginTop:"10px" }}>
            <input type="hidden" name="intent" value="test-telegram" />
            <button type="submit" className="btn btn-secondary btn-md" disabled={sub}>📨 Send Test Message</button>
          </Form>
          <div style={{ marginTop:"12px", fontSize:"12px", color:"var(--gray-400)" }}>Deploy the cron worker: see <code>cron-worker/</code> in your project for setup instructions.</div>
        </Section>

        <Section title="Audit Log">
          <Form method="post" preventScrollReset style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
            <input type="hidden" name="intent" value="audit-settings" />
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Enable Audit Logging</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Record all user actions</div></div>
              <input type="checkbox" name="audit_enabled" value="1" defaultChecked={appSettings.audit_enabled} style={{ width:"18px", height:"18px" }} />
            </label>
            <div className="form-group"><label className="form-label">Retention Days (0 = keep forever)</label><input name="audit_retention_days" type="number" min="0" className="form-input" defaultValue={appSettings.audit_retention_days} /></div>
            <button type="submit" className="btn btn-primary btn-md" disabled={sub}>Save</button>
          </Form>
          <div style={{ display:"flex", gap:"10px", marginTop:"14px", flexWrap:"wrap" }}>
            <Form method="post" preventScrollReset><input type="hidden" name="intent" value="purge-audit"/><input type="hidden" name="purge_days" value="90"/><button type="submit" className="btn btn-secondary btn-md" disabled={sub}>Purge &gt;90 days</button></Form>
            <Form method="post" preventScrollReset onSubmit={e=>{if(!confirm("Wipe entire audit log?"))e.preventDefault();}}><input type="hidden" name="intent" value="wipe-audit"/><button type="submit" className="btn btn-danger btn-md" disabled={sub}>Wipe All Logs</button></Form>
          </div>
        </Section>

        <Section title="Misc">
          <Form method="post" preventScrollReset style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
            <input type="hidden" name="intent" value="misc-settings" />
            <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px", border:"1px solid var(--gray-200)", borderRadius:"var(--radius-sm)" }}>
              <div><div style={{ fontWeight:"600" }}>Record GPS Location History</div><div style={{ fontSize:"12px", color:"var(--gray-400)" }}>Store member GPS path when marking attendance</div></div>
              <input type="checkbox" name="location_history_enabled" value="1" defaultChecked={appSettings.location_history_enabled} style={{ width:"18px", height:"18px" }} />
            </label>
            <button type="submit" className="btn btn-primary btn-md" disabled={sub}>Save</button>
          </Form>
        </Section>

        {/* Storage Stats */}
        <div className="card">
          <div className="card-header"><h3>💾 Storage Usage (Cloudflare Free Plan)</h3></div>
          <div className="card-body">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"12px", marginBottom:"16px" }}>
              {[
                { label:"Attendance Records", value:(data as any).storageStats?.attendance ?? 0, limit:"∞", icon:"📋" },
                { label:"Members", value:(data as any).storageStats?.members ?? 0, limit:"∞", icon:"👥" },
                { label:"Audit Entries", value:(data as any).storageStats?.auditLog ?? 0, limit:"∞", icon:"📜" },
                { label:"Announcements", value:(data as any).storageStats?.announcements ?? 0, limit:"∞", icon:"📢" },
                { label:"GPS History", value:(data as any).storageStats?.locationHistory ?? 0, limit:"∞", icon:"📍" },
              ].map(s=>(
                <div key={s.label} style={{ background:"var(--gray-50)", borderRadius:"var(--radius-sm)", padding:"12px", border:"1px solid var(--gray-100)" }}>
                  <div style={{ fontSize:"18px", marginBottom:"4px" }}>{s.icon}</div>
                  <div style={{ fontFamily:"var(--font-heading)", fontWeight:"800", fontSize:"22px" }}>{s.value.toLocaleString("en-IN")}</div>
                  <div style={{ fontSize:"11px", color:"var(--gray-400)", marginTop:"2px" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--info-light)", borderRadius:"var(--radius-sm)", padding:"12px", fontSize:"12px", color:"#1d4ed8" }}>
              <strong>Cloudflare Free Plan limits:</strong> D1 database: 5GB storage, 5M reads/day, 100K writes/day.
              R2 storage: 10GB for photos/files. At current usage you are well within free limits.
              To see exact usage, visit <strong>dash.cloudflare.com → D1 / R2</strong>.
            </div>
          </div>
        </div>

        <div className="card" style={{ border:"1px solid var(--error)" }}>
          <div className="card-header" style={{ background:"var(--error-light)" }}><h3 style={{ color:"var(--error)" }}>Danger Zone</h3></div>
          <div className="card-body">
            <p style={{ fontSize:"13px", color:"var(--gray-500)", marginBottom:"12px" }}>Permanently deletes attendance, audit logs, announcements and GPS history. Members and settings are preserved.</p>
            <button type="button" className="btn btn-danger btn-md" onClick={() => setShowWipe(true)}>Wipe Database</button>
          </div>
        </div>
      </div>

      {showWipe && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowWipe(false);}}>
          <div className="modal-box">
            <div className="modal-header"><h3 style={{ color:"var(--error)" }}>Confirm Database Wipe</h3><button className="modal-close" type="button" onClick={()=>setShowWipe(false)}>x</button></div>
            <Form method="post" preventScrollReset onSubmit={()=>setShowWipe(false)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="wipe-database" />
                <div className="alert alert-error" style={{ marginBottom:"14px" }}>This permanently deletes all attendance data. Cannot be undone.</div>
                <div className="form-group"><label className="form-label">Type "delete" *</label><input name="confirm_word" type="text" className="form-input" placeholder='delete' required /></div>
                <div className="form-group"><label className="form-label">Your PIN *</label><input name="pin" type="password" className="form-input" inputMode="numeric" maxLength={4} required /></div>
                {ad?.wipeError && <div className="alert alert-error">{ad.wipeError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-md" onClick={()=>setShowWipe(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger btn-md" disabled={sub}>Wipe Database</button>
              </div>
            </Form>
          </div>
        </div>
      )}
      <Toast message={(ad as any)?.error} type="error" />
      <Toast message={(ad as any)?.success} type="success" />
    </>
  );
}
