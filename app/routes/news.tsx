import { type LoaderFunctionArgs, type MetaFunction, json, redirect } from "@remix-run/cloudflare"; //redirect + YM
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { listAnnouncements } from "~/lib/db.server";
import { getAppSettings } from "~/lib/appsettings.server";
import { getSession } from "~/lib/session.server";
import { getKillSwitch, shouldBlock } from "~/lib/killswitch.server";// YM
import { getMemberById, getTodayAttendanceAll, getMemberMonthAttendanceCount, getMemberTotalAttendanceCount, getMemberAttendanceHistory, markAttendance, listLocations, getActiveSchedulesForDate, listSevaRoles, getLocationsWithAnySchedule, type ScheduleWithLocation } from "~/lib/db.server"; //YM
import { requireMember } from "~/lib/session.server"; //YM
import PWAInstallPrompt from "~/components/PWAInstallPrompt";

//YM
// function todayISO() { return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
// function nowHHMM() { return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Kolkata"}).replace(".",":"); }
// function formatTimeIST(iso:string|null){if(!iso)return"";const u=iso.endsWith("Z")?iso:iso+"Z";return new Date(u).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"});}
// function formatDateIST(iso:string){return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}
// function isScheduleActiveNow(s:ScheduleWithLocation,hhmm:string){if(s.all_day)return true;if(!s.start_time||!s.end_time)return true;return hhmm>=s.start_time&&hhmm<=s.end_time;}

// export async function loaderr({ request, context }: LoaderFunctionArgs) {
//   const { DB, SESSION_SECRET } = context.cloudflare.env;
//   const session = await requireMember(request, SESSION_SECRET, DB);
//   if (session.isAdmin || session.isSuperAdmin) throw redirect("/admin");

//   const ks = await getKillSwitch(DB);
//   const blocked = shouldBlock(ks, "member");
//   if (blocked) throw redirect("/maintenance");

//   const today = todayISO();
//   const [member, todayRecords, monthCount, totalCount, history, locations, schedules, sevaRoles, allScheduledLocationIds, announcements, appSettings] =
//     await Promise.all([
//       getMemberById(DB,session.memberId), getTodayAttendanceAll(DB,session.memberId,today),
//       getMemberMonthAttendanceCount(DB,session.memberId,today.slice(0,7)),
//       getMemberTotalAttendanceCount(DB,session.memberId),
//       getMemberAttendanceHistory(DB,session.memberId,10),
//       listLocations(DB,true), getActiveSchedulesForDate(DB,today), listSevaRoles(DB,true),
//       getLocationsWithAnySchedule(DB),
//       listAnnouncements(DB, { activeOnly: true, showTo: "member" }),
//       getAppSettings(DB),
//     ]);
//   if (!member) throw redirect("/auth/logout");
//   return json({ member, todayRecords, monthCount, totalCount, history, locations, schedules, sevaRoles, today, allScheduledLocationIds, announcements, appSettings });
// }
//YM

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.appName ?? "Sevadal"} — News & Notices` },
];

function parseAttachments(raw: string | null): { key: string; name: string; type?: string }[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw.startsWith("[") ? [] : [{ key: raw, name: "Image" }]; }
}
function isImage(key: string) { return /\.(jpg|jpeg|png|webp|gif)$/i.test(key); }

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await getSession(request, SESSION_SECRET);
  const memberId    = session.get("memberId");
  const isAdmin     = session.get("isAdmin") || session.get("isSuperAdmin");
  const isSuperAdmin = session.get("isSuperAdmin");

  // Kill switch checks — use static import (dynamic import with ~/aliases broken on CF Workers)
  if (!isSuperAdmin) {
    const ks = await getKillSwitch(DB);
    if (!memberId && ks.blockGuests)              throw redirect("/maintenance"); // guests
    if (memberId && !isAdmin && ks.blockMembers)  throw redirect("/maintenance"); // logged-in members
  }

  const [settings, announcements] = await Promise.all([
    getAppSettings(DB),
    listAnnouncements(DB, { activeOnly: true, showTo: memberId ? "member" : "guest" }),
  ]);
  const headers: HeadersInit = {};
  // Cache public news for guests at the edge — 60s fresh, 5min stale
  if (!memberId) {
    headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=300";
  }

  return json({
    announcements,
    appName: settings.app_name,
    orgName: settings.org_name,
    banner: settings.announcement_banner,
    footerText: settings.footer_text,
    isMember: !!memberId && !isAdmin,
    isAdmin:  !!isAdmin,
  }, { headers });
}

export default function NewsPage() {
  const { announcements, appName, orgName, banner, footerText, isMember, isAdmin } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [lightbox, setLightbox] = useState<{ imgs: { key: string; name: string }[]; idx: number } | null>(null);

  if (nav.state === "loading") {
    return (
      <div className="member-shell">
        <header style={{ background: "white", borderBottom: "1px solid var(--gray-100)", position: "sticky", top: 0, zIndex: 50, height: "56px", display: "flex", alignItems: "center", padding: "0 16px" }}>
          <div className="skeleton" style={{ width: 140, height: 20 }}/>
        </header>
        <main style={{ maxWidth: "680px", margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="skeleton skeleton-title" style={{ width: "40%" }}/>
          {[0,1,2].map(i=>(
            <div key={i} className="card" style={{ overflow: "hidden" }}>
              <div className="skeleton skeleton-img"/>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="skeleton skeleton-title" style={{ width: "70%" }}/>
                <div className="skeleton skeleton-text"/>
                <div className="skeleton skeleton-text" style={{ width: "80%" }}/>
                <div className="skeleton skeleton-text" style={{ width: "30%", marginTop: 4 }}/>
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  const openLightbox = (imgs: { key: string; name: string }[], idx = 0) => setLightbox({ imgs, idx });
  const closeLightbox = () => setLightbox(null);

  return (
    // <div style={{ minHeight: "100dvh", background: "var(--gray-50)", fontFamily: "var(--font-body)" }}> {/* YM */}
    <div className="member-shell">

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid var(--gray-100)", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <div style={{ maxWidth: "680px", margin: "0 auto", padding: "0 16px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg,var(--saffron-500),var(--saffron-700))", borderRadius: "8px", display: "grid", placeItems: "center", fontFamily: "var(--font-heading)", fontWeight: "800", color: "white", fontSize: "14px" }}>🙏</div>
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px" }}>{appName}</div>
              <div style={{ fontSize: "11px", color: "var(--gray-400)" }}>{orgName}</div>
            </div>
          </div>
          {!isMember && !isAdmin && <Link to="/auth/login" className="btn btn-primary btn-sm">Login →</Link>}
          {isMember && <Link to="/dashboard" className="btn btn-secondary btn-sm">← Attendance</Link>}
          {isAdmin  && <Link to="/admin"     className="btn btn-secondary btn-sm">← Admin</Link>}
        </div>
      </header>

      {/* Banner */}
      {banner && (
        <div style={{ background: "var(--saffron-600)", color: "white", textAlign: "center", padding: "8px 16px", fontSize: "13px", fontWeight: "500" }}>
          📢 {banner}
        </div>
      )}

      {/* Content */}
      <main style={{ maxWidth: "680px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: "800", marginBottom: "4px" }}>
          News & Notices
        </h1>
        <p style={{ fontSize: "13px", color: "var(--gray-400)", marginBottom: "24px" }}>{orgName}</p>

        {announcements.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--gray-400)" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📢</div>
            <div>No announcements yet.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {announcements.map(a => {
            const atts = parseAttachments(a.image_key);
            const imgs = atts.filter(x => isImage(x.key));
            const files = atts.filter(x => !isImage(x.key));
            return (
              <div key={a.id} className="card" style={{ overflow: "hidden", border: a.is_pinned ? "1.5px solid var(--primary)" : undefined }}>

                {/* First image — full width, clickable */}
                {imgs.length > 0 && (
                  <div style={{ position: "relative", cursor: "pointer" }} onClick={() => openLightbox(imgs, 0)}>
                    <img
                      src={`/api/photo/${encodeURIComponent(imgs[0].key)}`}
                      alt={a.title}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", maxHeight: "280px", objectFit: "contain", background: "var(--gray-50)", display: "block" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {'UNCMT' == 'CMT' && ( 
                      <div>
                    {/* Eye / view button overlay */}
                    <button
                      type="button"
                      onClick={ev => { ev.stopPropagation(); openLightbox(imgs, 0); }}
                      style={{ position: "absolute", bottom: "8px", right: "8px", background: "rgba(0,0,0,.55)", color: "white", border: "none", borderRadius: "20px", padding: "5px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", backdropFilter: "blur(4px)" }}
                    >
                      👁️ {imgs.length > 1 ? `View ${imgs.length} photos` : "View"}
                    </button>
                    </div>
                    )}
                  </div>
                )}

                {/* Thumbnail strip for multi-image */}
                {imgs.length > 1 && (
                  <div style={{ display: "flex", gap: "4px", padding: "6px 10px", background: "var(--gray-50)", borderBottom: "1px solid var(--gray-100)", overflowX: "auto" }}>
                    {imgs.map((img, i) => (
                      <img key={img.key} src={`/api/photo/${encodeURIComponent(img.key)}`} alt=""
                        loading="lazy" decoding="async"
                        onClick={() => openLightbox(imgs, i)}
                        style={{ height: "48px", width: "60px", objectFit: "cover", borderRadius: "4px", cursor: "pointer", flexShrink: 0, border: "2px solid transparent" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ))}
                  </div>
                )}

                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    {a.is_pinned ? <span className="badge badge-warning" style={{ fontSize: "10px" }}>📌 Pinned</span> : null}
                    <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "17px", margin: 0 }}>{a.title}</h2>
                  </div>
                  {a.body && <p style={{ fontSize: "14px", lineHeight: "1.7", color: "var(--gray-700)", whiteSpace: "pre-wrap", marginBottom: "10px" }}>{a.body}</p>}

                  {/* File attachments */}
                  {files.length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {files.map(f => (
                        <a key={f.key} href={`/api/photo/${encodeURIComponent(f.key)}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--primary-light)", borderRadius: "var(--radius-full)", color: "var(--primary)", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>
                          📎 {f.name}
                        </a>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                    <div style={{ fontSize: "11px", color: "var(--gray-400)" }}>
                      {new Date(a.created_at + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      {a.expires_at ? ` · Until ${new Date(a.expires_at + "Z").toLocaleDateString("en-IN")}` : ""}
                    </div>

                    {'UNCMT' == 'UNCMT' && (
                    <div>
                    {/* Eye button in card footer too */}
                    {imgs.length > 0 && (
                      <button type="button" onClick={() => openLightbox(imgs, 0)}
                        style={{ background: "var(--primary-light)", color: "var(--primary)", border: "none", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                        👁️ {imgs.length > 1 ? `${imgs.length} photos` : "Photo"}
                      </button>
                    )}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Login CTA */}
        {!isMember && (
         <div style={{ marginTop: "40px", background: "linear-gradient(135deg,var(--saffron-50),white)", border: "1px solid var(--saffron-200)", borderRadius: "var(--radius-lg)", padding: "24px", textAlign: "center" }}>
           <div style={{ fontSize: "24px", marginBottom: "8px" }}>🙏</div>
           <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "16px", marginBottom: "6px" }}>Sevadal Member?</div>
           <div style={{ fontSize: "13px", color: "var(--gray-500)", marginBottom: "16px" }}>Login to mark your attendance and view your records.</div>
           <Link to="/auth/login" className="btn btn-primary btn-md">Login to Member Portal →</Link>
                   {/* YM */}
        <div>
          <PWAInstallPrompt />
        </div>
        {/* YM */}
         </div>
        )}
      </main>

      <footer style={{ borderTop: "1px solid var(--gray-100)", padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--gray-400)", marginTop: "32px" }}>
        {footerText}
      </footer>

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={closeLightbox}
        >
          {/* Close */}
          <button type="button" onClick={closeLightbox}
            style={{ position: "absolute", top: "16px", right: "20px", background: "none", border: "none", color: "white", fontSize: "28px", cursor: "pointer", lineHeight: 1 }}>✕</button>

          {/* Counter */}
          {lightbox.imgs.length > 1 && (
            <div style={{ position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,.7)", fontSize: "13px" }}>
              {lightbox.idx + 1} / {lightbox.imgs.length}
            </div>
          )}

          {/* Main image */}
          <img
            src={`/api/photo/${encodeURIComponent(lightbox.imgs[lightbox.idx].key)}`}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: "8px" }}
          />

          {/* Prev / Next arrows */}
          {lightbox.imgs.length > 1 && (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, idx: (l.idx - 1 + l.imgs.length) % l.imgs.length } : null); }}
                style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "white", borderRadius: "50%", width: "44px", height: "44px", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
              <button type="button" onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, idx: (l.idx + 1) % l.imgs.length } : null); }}
                style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "white", borderRadius: "50%", width: "44px", height: "44px", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
            </>
          )}

          {/* Thumbnail strip */}
          {lightbox.imgs.length > 1 && (
            <div style={{ position: "absolute", bottom: "16px", display: "flex", gap: "6px", overflowX: "auto", maxWidth: "90vw" }}>
              {lightbox.imgs.map((img, i) => (
                <img key={img.key} src={`/api/photo/${encodeURIComponent(img.key)}`} alt=""
                  onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, idx: i } : null); }}
                  style={{ width: "52px", height: "44px", objectFit: "cover", borderRadius: "4px", cursor: "pointer", border: `2px solid ${i === lightbox.idx ? "var(--primary)" : "rgba(255,255,255,.3)"}`, opacity: i === lightbox.idx ? 1 : 0.55 }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member bottom nav — shown when logged in as member */}
      {isMember && (
        <nav className="bottom-nav">
          <Link to="/dashboard" className="bottom-nav__item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            Attendance
          </Link>
          <Link to="/news" className="bottom-nav__item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            Notices
          </Link>
          <Link to="/profile" className="bottom-nav__item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Profile
          </Link>
        </nav>
      )}
    </div>
  );
}
