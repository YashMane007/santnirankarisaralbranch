import { type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useAdminLayout } from "~/routes/admin";
import { getDailyStats, getMembersWithBirthdayToday, getAttendanceTrend } from "~/lib/db.server";
import { getAppSettings } from "~/lib/appsettings.server";

export const meta: MetaFunction = () => [{ title: "Dashboard — Sevadal Admin" }];
function todayISO() { return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function fmtDate(iso:string) { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); }

export async function loader({ context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  const today = todayISO();
  const [stats, birthdays, trend, settings] = await Promise.all([
    getDailyStats(DB, today),
    getMembersWithBirthdayToday(DB),
    getAttendanceTrend(DB, 14),
    getAppSettings(DB),
  ]);
  const absentCount = Math.max(0, stats.totalActive - stats.uniquePresentCount);
  const rate = stats.totalActive > 0 ? Math.round((stats.uniquePresentCount/stats.totalActive)*100) : 0;
  return json({ stats, absentCount, rate, today, birthdays, trend, settings });
}

// Simple inline bar chart component
function TrendChart({ data }: { data: {date:string;present:number}[] }) {
  if (!data.length) return <div style={{color:"var(--gray-400)",fontSize:"13px",padding:"16px",textAlign:"center"}}>No trend data yet</div>;
  const max = Math.max(...data.map(d => d.present), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:"3px", height:"80px", padding:"0 4px" }}>
      {data.map(d => {
        const h = Math.max(4, Math.round((d.present / max) * 70));
        return (
          <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"2px" }} title={`${d.date}: ${d.present} present`}>
            <div style={{ width:"100%", height:`${h}px`, background:"var(--primary)", borderRadius:"2px 2px 0 0", opacity:0.85 }} />
            <div style={{ fontSize:"9px", color:"var(--gray-400)", transform:"rotate(-45deg)", whiteSpace:"nowrap" }}>{d.date.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { stats, absentCount, rate, today, birthdays, trend, settings } = useLoaderData<typeof loader>();
  const layoutData = useAdminLayout();
  const isSuperAdmin = layoutData?.isSuperAdmin ?? false;

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">{settings.app_name}</h1>
        {/* suppressHydrationWarning: date formatting can differ between Node (server) and browser locale */}
        <span suppressHydrationWarning style={{fontSize:"13px",color:"var(--gray-400)"}}>{fmtDate(today)}</span>
      </div>
      <div className="admin-content">

        {/* Birthday alerts */}
        {birthdays.length > 0 && (
          <div className="card" style={{ background:"linear-gradient(135deg,#fef3c7,#fde68a)", border:"1px solid #f59e0b", marginBottom:"20px" }}>
            <div className="card-body">
              <div style={{ fontWeight:"700", color:"#92400e", marginBottom:"6px" }}>🎂 Birthdays Today!</div>
              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
                {birthdays.map(m => (
                  <span key={m.id} style={{ background:"white", borderRadius:"var(--radius-full)", padding:"4px 12px", fontSize:"13px", fontWeight:"500", color:"#92400e", border:"1px solid #f59e0b" }}>
                    🎉 {m.name} ({m.id})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="stat-grid" style={{marginBottom:"24px"}}>
          <div className="stat-tile stat-tile--accent" title="Unique members who marked today">
            <div className="stat-tile__label">Unique Present</div>
            <div className="stat-tile__value">{stats.uniquePresentCount}</div>
            <div className="stat-tile__sub">unique members</div>
          </div>
          <div className="stat-tile" title="Total session marks today (counts multi-session separately)">
            <div className="stat-tile__label">Session Records</div>
            <div className="stat-tile__value">{stats.sessionAttendanceCount}</div>
            <div className="stat-tile__sub">all sessions</div>
          </div>
          <div className="stat-tile stat-tile--error" title="Members not yet marked today">
            <div className="stat-tile__label">Absent</div>
            <div className="stat-tile__value">{absentCount}</div>
          </div>
          <div className="stat-tile stat-tile--success" title="Attendance rate today">
            <div className="stat-tile__label">Rate</div>
            <div className="stat-tile__value">{rate}%</div>
          </div>
          <div className="stat-tile" title="Total active members (SA excluded)">
            <div className="stat-tile__label">Active Members</div>
            <div className="stat-tile__value">{stats.totalActive}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"20px"}}>
          {/* Trend chart */}
          <div className="card">
            <div className="card-header"><h3>14-Day Attendance Trend</h3></div>
            <div style={{padding:"16px 12px 8px"}}><TrendChart data={trend as any} /></div>
          </div>

          <div className="card">
            <div className="card-header"><h3>By Seva Role</h3></div>
            {stats.byRole.length===0 ? <div className="empty-state" style={{padding:"32px"}}><div className="empty-state__text">No attendance yet today</div></div> : (
              <div className="table-wrap"><table><thead><tr><th>Role</th><th>Count</th></tr></thead><tbody>
                {stats.byRole.map(r=><tr key={r.seva_role}><td>{r.seva_role}</td><td><span className="badge badge-primary">{r.cnt}</span></td></tr>)}
              </tbody></table></div>
            )}
          </div>

          <div className="card">
            <div className="card-header"><h3>By Location</h3></div>
            {stats.byLocation.length===0 ? <div className="empty-state" style={{padding:"32px"}}><div className="empty-state__text">No attendance yet today</div></div> : (
              <div className="table-wrap"><table><thead><tr><th>Location</th><th>Count</th></tr></thead><tbody>
                {stats.byLocation.map(r=><tr key={r.location_name}><td>{r.location_name}</td><td><span className="badge badge-success">{r.cnt}</span></td></tr>)}
              </tbody></table></div>
            )}
          </div>
        </div>

        <div style={{display:"flex",gap:"12px",marginTop:"24px",flexWrap:"wrap"}}>
          <Link to="/admin/members"       className="btn btn-primary btn-md" title="Manage sevadal members">Members</Link>
          <Link to="/admin/attendance"    className="btn btn-secondary btn-md" title="View and manage attendance">Attendance</Link>
          <Link to="/admin/announcements" className="btn btn-secondary btn-md" title="Post notices and images to members">Announcements</Link>
          {!isSuperAdmin && <Link to="/admin/mark-self" className="btn btn-outline btn-md" title="Mark your own attendance">My Attendance</Link>}
          <a href={`/api/export?from=${today}&to=${today}&format=csv`} className="btn btn-secondary btn-md" title="Download today's CSV">Export Today</a>
        </div>
      </div>
    </>
  );
}
