import {
  type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction,
  json, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler,
} from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useState } from "react";
import { requireAdmin } from "~/lib/session.server";
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from "~/lib/db.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { useConfirm } from "~/components/ConfirmModal";
import { getAdminPermissions, can } from "~/lib/permissions.server";

export const meta: MetaFunction = () => [{ title: "Announcements — Sevadal Admin" }];

function parseAttachments(raw: string | null): { key: string; name: string; type?: string }[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw.startsWith("[") ? [] : [{ key: raw, name: "Attachment", type: "image" }]; }
}
function isImage(key: string) { return /\.(jpg|jpeg|png|webp|gif)$/i.test(key); }

const AUDIENCE_OPTIONS = [
  { val: "public",  label: "🌐 Everyone", desc: "Guests, members and admins" },
  { val: "members", label: "👥 Members",  desc: "Logged-in members and admins" },
  { val: "admins",  label: "🔐 Admins",   desc: "Admins only" },
];
const AUDIENCE_MAP: Record<string, string> = {
  public: "🌐 Everyone", all: "🌐 Everyone", members: "👥 Members", admins: "🔐 Admins",
};

export async function loader({ context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  return json({ announcements: await listAnnouncements(DB) });
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const { DB, SESSION_SECRET, BUCKET } = context.cloudflare.env;
    const session = await requireAdmin(request, SESSION_SECRET, DB);
    const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
    if (!can(perms, "manage_announcements")) {
      return json({ error: "You do not have permission to manage announcements." });
    }
    const ip = getClientIp(request);
    const ct = request.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const handler = unstable_createMemoryUploadHandler({ maxPartSize: 10_000_000 });
      const form = await unstable_parseMultipartFormData(request, handler);
      const intent = form.get("intent") as string;

      const saveAttachments = async (existingJson?: string) => {
        const existing = existingJson ? parseAttachments(existingJson) : [];
        const files = form.getAll("files") as File[];
        const newAtts: { key: string; name: string; type: string }[] = [];
        for (const file of files) {
          if (!file || file.size === 0) continue;
          if (!BUCKET) continue;
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
          const key = `announcements/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          await BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
          newAtts.push({ key, name: file.name, type: file.type });
        }
        return JSON.stringify([...existing, ...newAtts]);
      };

      // Checkboxes — array of values
      const showToArray = (form.get("show_to_array") as string) || "[]";
      let showToArrayParsed: string[] = [];
      try {
        showToArrayParsed = JSON.parse(showToArray);
      } catch {
        showToArrayParsed = [];
      }

      if (intent === "create") {
        const title = (form.get("title") as string)?.trim();
        if (!title) return json({ error: "Title is required." });
        const expiresAt = (form.get("expires_at") as string) || undefined;
        await createAnnouncement(DB, {
          title,
          body: (form.get("body") as string)?.trim() || undefined,
          image_key: await saveAttachments(),
          type: (form.get("type") as string) || "notice",
          show_to: showToArrayParsed,
          is_pinned: form.get("is_pinned") === "1",
          created_by: session.memberId,
          expires_at: expiresAt,
        });
        await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: session.isSuperAdmin ? "super_admin" : "admin", action: "announcement_created", ip });
        return json({ success: "Announcement created." });
      }

      if (intent === "edit") {
        const id = parseInt(form.get("id") as string);
        const attachmentsJson = await saveAttachments((form.get("existingAttachments") as string) || "[]");
        const title = (form.get("title") as string)?.trim();
        const body  = (form.get("body") as string)?.trim();
        const expiresAt = (form.get("expires_at") as string) || undefined;
        await updateAnnouncement(DB, id, {
          title:      title   || undefined,
          body:       body    || undefined,
          is_active:  form.get("is_active")  === "1" ? 1 : 0,
          is_pinned:  form.get("is_pinned")  === "1" ? 1 : 0,
          show_to:    showToArrayParsed,
          expires_at: expiresAt,
        });
        await DB.prepare("UPDATE announcements SET image_key = ? WHERE id = ?").bind(attachmentsJson, id).run();
        await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: session.isSuperAdmin ? "super_admin" : "admin", action: "announcement_updated", targetType: "announcement", targetId: String(id), ip });
        return json({ success: "Announcement updated." });
      }
    }

    const form = await request.formData();
    const intent = form.get("intent") as string;
    if (intent === "toggle") {
      const id = parseInt(form.get("id") as string);
      const cur = form.get("current") === "1";
      await updateAnnouncement(DB, id, { is_active: cur ? 0 : 1 });
      return json({ success: cur ? "Hidden." : "Visible." });
    }
    if (intent === "pin") {
      const id = parseInt(form.get("id") as string);
      const pinned = form.get("pinned") === "1";
      await updateAnnouncement(DB, id, { is_pinned: pinned ? 0 : 1 });
      return json({ success: pinned ? "Unpinned." : "Pinned." });
    }
    if (intent === "delete-attachment") {
      const id = parseInt(form.get("id") as string);
      const keyToRemove = form.get("attachmentKey") as string;
      const ann = await DB.prepare("SELECT image_key FROM announcements WHERE id = ?").bind(id).first<{ image_key: string }>();
      if (ann) {
        const atts = parseAttachments(ann.image_key).filter(a => a.key !== keyToRemove);
        await DB.prepare("UPDATE announcements SET image_key = ? WHERE id = ?").bind(JSON.stringify(atts), id).run();
        try { if (BUCKET) await BUCKET.delete(keyToRemove); } catch {}
      }
      return json({ success: "Attachment removed." });
    }
    if (intent === "delete") {
      const id = parseInt(form.get("id") as string);
      const ann = await DB.prepare("SELECT image_key FROM announcements WHERE id = ?").bind(id).first<{ image_key: string }>();
      if (ann?.image_key) for (const att of parseAttachments(ann.image_key)) { try { if (BUCKET) await BUCKET.delete(att.key); } catch {} }
      await deleteAnnouncement(DB, id);
      await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: session.isSuperAdmin ? "super_admin" : "admin", action: "announcement_deleted", ip: getClientIp(request) });
      return json({ success: "Deleted." });
    }
    return json({ error: "Unknown intent." });
  } catch (err: any) {
    console.error("Announcement action error:", err);
    return json({ error: `Server error: ${err?.message ?? String(err)}` });
  }
}

// ─── Toast popup ──────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: type === "success" ? "#16a34a" : "#dc2626",
      color: "white", padding: "12px 22px", borderRadius: "9999px",
      fontSize: "14px", fontWeight: "600", boxShadow: "0 6px 24px rgba(0,0,0,.25)",
      display: "flex", alignItems: "center", gap: "10px", maxWidth: "90vw",
      animation: "slideUp .2s ease",
    }}>
      <span>{type === "success" ? "✅" : "⚠️"} {message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "16px", padding: "0 0 0 4px", lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ─── Radio group for audience ─────────────────────────────────────────────────
function AudienceCheckboxes({ defaultValue }: { defaultValue?: string | null }) {
  // Parse the JSON array from show_to_array, or fall back to old show_to logic
  let initialChecked = { guest: false, member: false, admin: false };
  
  if (defaultValue) {
    try {
      const arr = JSON.parse(defaultValue);
      if (Array.isArray(arr)) {
        initialChecked = {
          guest: arr.includes("guest"),
          member: arr.includes("member"),
          admin: arr.includes("admin"),
        };
      }
    } catch {
      // Legacy format - map old single values to checkboxes
      if (defaultValue === "public" || defaultValue === "all") {
        initialChecked = { guest: true, member: true, admin: true };
      } else if (defaultValue === "members") {
        initialChecked = { guest: false, member: true, admin: true };
      } else if (defaultValue === "admins") {
        initialChecked = { guest: false, member: false, admin: true };
      }
    }
  }
  
  const [checked, setChecked] = useState(initialChecked);
  
  // Convert checked state to JSON array string for form submission
  const arrayValue = JSON.stringify(
    Object.entries(checked).filter(([, v]) => v).map(([k]) => k)
  );
  
  const toggleCheckbox = (key: "guest" | "member" | "admin") => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  const CHECKBOX_OPTIONS = [
    { key: "guest", label: "🌐 Guests", desc: "Anyone (public, no login)" },
    { key: "member", label: "👥 Members", desc: "Logged-in members and admins" },
    { key: "admin", label: "🔐 Admins", desc: "Admins only" },
  ];
  
  return (
    <div className="form-group">
      <label className="form-label">Visible to (select one or more)</label>
      <input type="hidden" name="show_to_array" value={arrayValue} />
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
        {CHECKBOX_OPTIONS.map(opt => (
          <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", border: `1.5px solid ${checked[opt.key as keyof typeof checked] ? "var(--primary)" : "var(--gray-200)"}`, borderRadius: "var(--radius-sm)", cursor: "pointer", background: checked[opt.key as keyof typeof checked] ? "var(--primary-light)" : "white" }}>
            <input 
              type="checkbox" 
              checked={checked[opt.key as keyof typeof checked]} 
              onChange={() => toggleCheckbox(opt.key as "guest" | "member" | "admin")} 
              style={{ width: "15px", height: "15px", accentColor: "var(--primary)" }} 
            />
            <div>
              <div style={{ fontSize: "13px", fontWeight: "600" }}>{opt.label}</div>
              <div style={{ fontSize: "11px", color: "var(--gray-400)" }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>
      <div style={{ fontSize: "11px", color: "var(--gray-500)", marginTop: "8px", fontStyle: "italic" }}>Leave all unchecked to make this invisible to everyone.</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminAnnouncementsPage() {
  const { announcements } = useLoaderData<typeof loader>();
  const ad = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const { confirm, ConfirmDialog } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [editAnn, setEditAnn] = useState<typeof announcements[0] | null>(null);
  const [viewAnn, setViewAnn] = useState<any | null>(null);
  const [viewImgIdx, setViewImgIdx] = useState(0);
  const [filterAudience, setFilterAudience] = useState("all");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Show toast on action result, close modals on success
  useEffect(() => {
    if (ad?.success) {
      setToast({ message: ad.success, type: "success" });
      setShowAdd(false);
      setEditAnn(null);
    } else if (ad?.error) {
      setToast({ message: ad.error, type: "error" });
    }
  }, [ad]);

  const filteredAnnouncements = filterAudience === "all"
    ? announcements
    : announcements.filter(a => (a.show_to === filterAudience) || (filterAudience === "public" && a.show_to === "all"));

  // ── Attachment thumbnails ─────────────────────────────────────────────────
  const AttachmentPreviews = ({ attachmentsJson, annId, allowDelete = false }: { attachmentsJson: string | null; annId?: number; allowDelete?: boolean }) => {
    const atts = parseAttachments(attachmentsJson);
    if (!atts.length) return null;
    return (
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
        {atts.map((att) => (
          <div key={att.key} style={{ position: "relative" }}>
            {isImage(att.key) ? (
              <img src={`/api/photo/${encodeURIComponent(att.key)}`} alt={att.name}
                style={{ width: "80px", height: "70px", objectFit: "cover", borderRadius: "6px", cursor: "pointer", border: "1px solid var(--gray-200)" }}
                onClick={() => { setViewAnn({ atts, title: "" }); setViewImgIdx(atts.indexOf(att)); }}
              />
            ) : (
              <a href={`/api/photo/${encodeURIComponent(att.key)}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "70px", background: "var(--gray-100)", borderRadius: "6px", fontSize: "10px", color: "var(--gray-600)", border: "1px solid var(--gray-200)", textDecoration: "none", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "20px" }}>📄</span>
                <span style={{ maxWidth: "72px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
              </a>
            )}
            {allowDelete && annId && (
              <Form method="post" style={{ position: "absolute", top: "-6px", right: "-6px" }}>
                <input type="hidden" name="intent" value="delete-attachment" />
                <input type="hidden" name="id" value={annId} />
                <input type="hidden" name="attachmentKey" value={att.key} />
                <button type="submit" style={{ width: "18px", height: "18px", borderRadius: "50%", background: "var(--error)", color: "white", border: "none", cursor: "pointer", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </Form>
            )}
          </div>
        ))}
      </div>
    );
  };

  // ── Form used for both Create and Edit ────────────────────────────────────
  const AnnouncementForm = ({ isEdit = false, ann = null as any }) => {
    const atts = ann ? parseAttachments(ann.image_key) : [];
    return (
      <Form method="post" encType="multipart/form-data">
        <div className="modal-body">
          <input type="hidden" name="intent" value={isEdit ? "edit" : "create"} />
          {isEdit && <input type="hidden" name="id" value={ann?.id} />}
          {isEdit && <input type="hidden" name="existingAttachments" value={ann?.image_key ?? "[]"} />}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input name="title" type="text" className="form-input" defaultValue={ann?.title ?? ""} required />
            </div>
            <div className="form-group">
              <label className="form-label">Body text</label>
              <textarea name="body" className="form-textarea" rows={3} style={{ resize: "vertical" }} defaultValue={ann?.body ?? ""} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select name="type" className="form-select" defaultValue={ann?.type ?? "notice"}>
                  <option value="notice">📌 Notice</option>
                  <option value="poster">🎯 Poster</option>
                  <option value="contact">👤 Contact</option>
                  <option value="gallery">🖼️ Gallery</option>
                </select>
              </div>
              <AudienceCheckboxes defaultValue={ann?.show_to_array ?? ann?.show_to} />
            </div>
            <div className="form-group">
              <label className="form-label">Attachments (images, PDF — multiple)</label>
              <input name="files" type="file" accept="*/*" multiple className="form-input" style={{ padding: "8px" }} />
              <span className="form-hint">Max 10MB per file.</span>
              {isEdit && atts.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "12px", color: "var(--gray-500)", marginBottom: "4px" }}>Current (click ✕ to remove):</div>
                  <AttachmentPreviews attachmentsJson={ann?.image_key} annId={ann?.id} allowDelete />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Expires on (optional)</label>
              <input name="expires_at" type="datetime-local" className="form-input" defaultValue={ann?.expires_at ?? ""} />
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input type="checkbox" name="is_pinned" value="1" defaultChecked={ann?.is_pinned === 1} style={{ width: "15px", height: "15px" }} />
                <span style={{ fontSize: "13px" }}>Pin to top</span>
              </label>
              {isEdit && (
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input type="checkbox" name="is_active" value="1" defaultChecked={ann?.is_active !== 0} style={{ width: "15px", height: "15px" }} />
                  <span style={{ fontSize: "13px" }}>Visible to audience</span>
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary btn-md" onClick={() => { setShowAdd(false); setEditAnn(null); }}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save Changes" : "Create"}</button>
        </div>
      </Form>
    );
  };

  // ── Image lightbox ────────────────────────────────────────────────────────
  const ImageLightbox = ({ atts, idx, title, onClose, onNav }: { atts: any[]; idx: number; title: string; onClose: () => void; onNav: (i: number) => void }) => {
    const imgs = atts.filter(a => isImage(a.key));
    if (!imgs.length) return null;
    const cur = idx % imgs.length;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 9998, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
        <button type="button" onClick={onClose} style={{ position: "absolute", top: "16px", right: "20px", background: "none", border: "none", color: "white", fontSize: "28px", cursor: "pointer" }}>✕</button>
        {imgs.length > 1 && <div style={{ position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,.7)", fontSize: "13px" }}>{cur + 1} / {imgs.length}</div>}
        <img src={`/api/photo/${encodeURIComponent(imgs[cur].key)}`} alt={title} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: "8px" }} />
        {imgs.length > 1 && <>
          <button type="button" onClick={e => { e.stopPropagation(); onNav((cur - 1 + imgs.length) % imgs.length); }} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "white", borderRadius: "50%", width: "44px", height: "44px", fontSize: "20px", cursor: "pointer" }}>‹</button>
          <button type="button" onClick={e => { e.stopPropagation(); onNav((cur + 1) % imgs.length); }} style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "white", borderRadius: "50%", width: "44px", height: "44px", fontSize: "20px", cursor: "pointer" }}>›</button>
          <div style={{ position: "absolute", bottom: "16px", display: "flex", gap: "6px", overflowX: "auto", maxWidth: "90vw" }}>
            {imgs.map((img, i) => <img key={img.key} src={`/api/photo/${encodeURIComponent(img.key)}`} alt="" onClick={e => { e.stopPropagation(); onNav(i); }} style={{ width: "52px", height: "44px", objectFit: "cover", borderRadius: "4px", cursor: "pointer", border: `2px solid ${i === cur ? "var(--primary)" : "rgba(255,255,255,.3)"}`, opacity: i === cur ? 1 : 0.55 }} />)}
          </div>
        </>}
      </div>
    );
  };

  return (
    <>
      {/* Slide-up animation */}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>

      <div className="admin-topbar">
        <h1 className="admin-topbar__title">📢 Announcements</h1>
        <button className="btn btn-primary btn-md" onClick={() => setShowAdd(true)}>+ New</button>
      </div>
      <div className="admin-content">

        {/* Audience filter tabs */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {[{ val: "all", label: "All" }, { val: "public", label: "🌐 Everyone" }, { val: "members", label: "👥 Members" }, { val: "admins", label: "🔐 Admins" }].map(opt => (
            <button key={opt.val} type="button" onClick={() => setFilterAudience(opt.val)}
              className={`btn btn-sm ${filterAudience === opt.val ? "btn-primary" : "btn-secondary"}`}>
              {opt.label}
              {opt.val !== "all" && (
                <span style={{ marginLeft: "5px", background: "rgba(0,0,0,.15)", borderRadius: "9999px", padding: "1px 6px", fontSize: "10px" }}>
                  {announcements.filter(a => a.show_to === opt.val || (opt.val === "public" && a.show_to === "all")).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredAnnouncements.length === 0 && (
            <div className="card"><div className="empty-state"><div className="empty-state__icon">📢</div><div className="empty-state__text">No announcements{filterAudience !== "all" ? " for this audience" : ""} yet.</div></div></div>
          )}
          {filteredAnnouncements.map(a => {
            const atts = parseAttachments(a.image_key);
            const firstImg = atts.find(att => isImage(att.key));
            return (
              <div key={a.id} className="card" style={{ opacity: a.is_active ? 1 : 0.6 }}>
                <div className="card-body" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  {firstImg && (
                    <img src={`/api/photo/${encodeURIComponent(firstImg.key)}`} alt={a.title}
                      style={{ width: "90px", height: "70px", objectFit: "contain", borderRadius: "8px", flexShrink: 0, cursor: "pointer", background: "var(--gray-50)", border: "1px solid var(--gray-100)" }}
                      onClick={() => { setViewAnn({ atts, title: a.title }); setViewImgIdx(0); }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                      {a.is_pinned ? <span className="badge badge-warning" style={{ fontSize: "10px" }}>📌 Pinned</span> : null}
                      <span className={`badge ${a.is_active ? "badge-success" : "badge-error"}`} style={{ fontSize: "10px" }}>{a.is_active ? "Visible" : "Hidden"}</span>
                      <span className="badge badge-gray" style={{ fontSize: "10px" }}>{AUDIENCE_MAP[a.show_to] ?? a.show_to}</span>
                      {atts.length > 0 && <span className="badge badge-primary" style={{ fontSize: "10px" }}>📎 {atts.length} file{atts.length > 1 ? "s" : ""}</span>}
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "14px", cursor: "pointer" }} onClick={() => { setViewAnn({ atts, title: a.title, body: a.body }); setViewImgIdx(0); }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: "12px", color: "var(--gray-500)", marginTop: "3px", lineHeight: "1.4" }}>{a.body.slice(0, 100)}{a.body.length > 100 ? "…" : ""}</div>}
                    <div style={{ fontSize: "11px", color: "var(--gray-400)", marginTop: "5px" }}>{new Date(a.created_at + "Z").toLocaleDateString("en-IN")}</div>
                  </div>
                  <div style={{ display: "flex", gap: "5px", flexShrink: 0, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setViewAnn({ atts, title: a.title, body: a.body }); setViewImgIdx(0); }} title="Preview">👁️</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditAnn(a as any)} title="Edit">✏️</button>
                    <Form method="post">
                      <input type="hidden" name="intent" value="pin" /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="pinned" value={a.is_pinned ? "1" : "0"} />
                      <button type="submit" className="btn btn-sm btn-secondary" title={a.is_pinned ? "Unpin" : "Pin"}>{a.is_pinned ? "📍" : "📌"}</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="current" value={a.is_active ? "1" : "0"} />
                      <button type="submit" className={`btn btn-sm ${a.is_active ? "btn-secondary" : "btn-outline"}`}>{a.is_active ? "Hide" : "Show"}</button>
                    </Form>
                    <Form method="post" onSubmit={async e => { e.preventDefault(); if (await confirm(`Delete "${a.title}"?`, { danger: true, confirmLabel: "Delete", title: "Delete Announcement" })) (e.target as HTMLFormElement).submit(); }}>
                      <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="btn btn-sm btn-danger">🗑</button>
                    </Form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {ConfirmDialog}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Create Modal */}
      {showAdd && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal-box" style={{ maxWidth: "540px" }}>
            <div className="modal-header"><h3>New Announcement</h3><button className="modal-close" type="button" onClick={() => setShowAdd(false)}>✕</button></div>
            <AnnouncementForm />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editAnn && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditAnn(null); }}>
          <div className="modal-box" style={{ maxWidth: "540px" }}>
            <div className="modal-header"><h3>Edit — {editAnn.title}</h3><button className="modal-close" type="button" onClick={() => setEditAnn(null)}>✕</button></div>
            <AnnouncementForm isEdit ann={editAnn} />
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {viewAnn && (
        <ImageLightbox
          atts={viewAnn.atts ?? []}
          idx={viewImgIdx}
          title={viewAnn.title ?? ""}
          onClose={() => setViewAnn(null)}
          onNav={setViewImgIdx}
        />
      )}
    </>
  );
}
