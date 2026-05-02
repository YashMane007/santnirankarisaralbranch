import { type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdmin } from "~/lib/session.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";

export const meta: MetaFunction = () => [{ title: "Export — Sevadal Admin" }];

function todayIST()    { return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function firstOfMonth(){ const d=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"})); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }

const COLUMN_DEFS = [
  { key:"sr_no",        label:"Sr. No."       },
  { key:"date",         label:"Date"          },
  { key:"day",          label:"Day"           },   // NEW — Fri, 1 May(5), 2026
  { key:"id",           label:"Member ID"     },
  { key:"name",         label:"Name"          },
  { key:"seva_role",    label:"Seva Role"     },
  { key:"session",      label:"Session"       },
  { key:"satsang_type", label:"Satsang Type"  },
  { key:"location",     label:"Location"      },
  { key:"time",         label:"Time (IST)"    },
  { key:"distance",     label:"Distance (m)"  },
  { key:"accuracy",     label:"Accuracy (m)"  },
  { key:"lat",          label:"Latitude"      },
  { key:"lng",          label:"Longitude"     },
  { key:"marked_by_id", label:"Marked By ID"  },
  { key:"marked_by",    label:"Marked By Name"},
];

const STORAGE_KEY = "sevadal_export_cols";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  const today = todayIST();
  return json({ defaultFrom: firstOfMonth(), defaultTo: today, hasExportPerm: can(perms, "export_data") });
}

export default function AdminExportPage() {
  const { defaultFrom, defaultTo, hasExportPerm } = useLoaderData<typeof loader>();
  const [format, setFormat] = useState<"csv"|"pdf">("csv");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set(COLUMN_DEFS.map(c => c.key)));
  const [showColPicker, setShowColPicker] = useState(false);
  const today = todayIST();

  // IMPORTANT: useEffect must be BEFORE any conditional return — hooks must
  // be called unconditionally. Moving it here fixes the "something went wrong"
  // crash when hasExportPerm flips while the admin is on this page.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedCols(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  if (!hasExportPerm) return (
    <>
      <div className="admin-topbar"><h1 className="admin-topbar__title">📥 Export CSV / PDF</h1></div>
      <div className="admin-content"><div className="alert alert-error">You do not have permission to export data.</div></div>
    </>
  );

  const saveAndClose = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedCols))); } catch {}
    setShowColPicker(false);
  };

  const selectAll = () => setSelectedCols(new Set(COLUMN_DEFS.map(c => c.key)));
  const clearAll  = () => setSelectedCols(new Set());
  const toggle    = (k: string) => setSelectedCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const colParam = selectedCols.size === COLUMN_DEFS.length ? "all" : Array.from(selectedCols).join(",");
  const downloadUrl = `/api/export?from=${from}&to=${to}&format=${format}&columns=${encodeURIComponent(colParam)}`;

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">Export Attendance</h1>
      </div>
      <div className="admin-content">
        <div className="card" style={{ maxWidth:"560px" }}>
          <div className="card-header"><h3>Download Report</h3></div>
          <div className="card-body" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

            {/* Format selector */}
            <div>
              <div className="form-label" style={{ marginBottom:"10px" }}>Format</div>
              <div style={{ display:"flex", gap:"12px" }}>
                {(["csv","pdf"] as const).map(f => (
                  <label key={f} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"12px 20px", border:`2px solid ${format===f?"var(--primary)":"var(--gray-200)"}`, borderRadius:"var(--radius-sm)", cursor:"pointer", flex:1, background:format===f?"var(--primary-light)":"white", transition:"all .15s" }}>
                    <input type="radio" name="format" value={f} checked={format===f} onChange={()=>setFormat(f)} style={{ accentColor:"var(--primary)" }} />
                    <div>
                      <div style={{ fontWeight:"600" }}>{f === "csv" ? "📊 Excel / CSV" : "📄 PDF"}</div>
                      <div style={{ fontSize:"11px", color:"var(--gray-400)" }}>{f === "csv" ? "Opens in Excel, Google Sheets" : "Formatted report, printable"}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
              <div className="form-group">
                <label className="form-label">From *</label>
                <input type="date" className="form-input" value={from} onChange={e=>setFrom(e.target.value)} max={today} />
              </div>
              <div className="form-group">
                <label className="form-label">To *</label>
                <input type="date" className="form-input" value={to} onChange={e=>setTo(e.target.value)} max={today} min={from} />
              </div>
            </div>

            {/* Column selector toggle */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                <div className="form-label" style={{ margin:0 }}>Columns ({selectedCols.size}/{COLUMN_DEFS.length} selected)</div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowColPicker(true)} title="Choose which columns to include in the download">
                  ✏️ Choose Columns
                </button>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                {COLUMN_DEFS.filter(c => selectedCols.has(c.key)).map(c => (
                  <span key={c.key} className="badge badge-primary" style={{ fontSize:"11px" }}>{c.label}</span>
                ))}
                {selectedCols.size === 0 && <span style={{ fontSize:"12px", color:"var(--error)" }}>⚠️ No columns selected</span>}
              </div>
              <div style={{ fontSize:"11px", color:"var(--gray-400)", marginTop:"6px" }}>Your column choice is remembered in this browser.</div>
            </div>

            {/* Download button */}
            <a
              href={selectedCols.size > 0 ? downloadUrl : "#"}
              className={`btn btn-primary btn-lg btn-full${selectedCols.size === 0 ? " btn-disabled" : ""}`}
              style={{ textDecoration:"none", ...(selectedCols.size === 0 ? { opacity:0.5, pointerEvents:"none" } : {}) }}
              title={`Download ${format.toUpperCase()} file — opens in ${format === "csv" ? "Excel" : "PDF viewer"}`}
            >
              📥 Download {format.toUpperCase()}
            </a>

            {/* Quick exports */}
            <div style={{ borderTop:"1px solid var(--gray-100)", paddingTop:"14px" }}>
              <div style={{ fontSize:"12px", color:"var(--gray-500)", marginBottom:"8px" }}>Quick exports</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                <a href={`/api/export?from=${today}&to=${today}&format=csv&columns=${encodeURIComponent(colParam)}`} className="btn btn-secondary btn-sm" title="Download today's attendance as CSV">Today CSV</a>
                <a href={`/api/export?from=${today}&to=${today}&format=pdf&columns=${encodeURIComponent(colParam)}`} className="btn btn-secondary btn-sm" title="Download today's attendance as PDF">Today PDF</a>
                <a href={`/api/export?from=${firstOfMonth()}&to=${today}&format=csv&columns=${encodeURIComponent(colParam)}`} className="btn btn-secondary btn-sm" title="Download this month's attendance as CSV">This Month CSV</a>
              </div>
            </div>
          </div>
        </div>

        {/* Column reference card */}
        <div className="card" style={{ maxWidth:"560px", marginTop:"16px" }}>
          <div className="card-body">
            <div style={{ fontWeight:"700", marginBottom:"10px" }}>Available Columns</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px", fontSize:"13px", color:"var(--gray-600)" }}>
              {COLUMN_DEFS.map(c => (
                <div key={c.key} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                  <span style={{ color: selectedCols.has(c.key) ? "var(--primary)" : "var(--gray-300)" }}>›</span>
                  <span style={{ opacity: selectedCols.has(c.key) ? 1 : 0.4 }}>{c.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:"12px", fontSize:"12px", color:"var(--gray-400)" }}>
              CSV opens in Excel and Google Sheets with UTF-8 BOM. PDF is A4 formatted report. Times are IST. Day column format: Fri, 1 May(5), 2026.
            </div>
          </div>
        </div>
      </div>

      {/* Column picker modal */}
      {showColPicker && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) saveAndClose(); }}>
          <div className="modal-box" style={{ maxWidth:"440px" }}>
            <div className="modal-header">
              <h3>Choose Columns</h3>
              <button className="modal-close" type="button" onClick={saveAndClose} title="Close and save">✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display:"flex", gap:"10px", marginBottom:"16px" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={selectAll} title="Select all columns">Select All</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll} title="Clear all columns">Clear All</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                {COLUMN_DEFS.map(c => (
                  <label key={c.key} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", borderRadius:"var(--radius-sm)", border:`1.5px solid ${selectedCols.has(c.key) ? "var(--primary)" : "var(--gray-200)"}`, background:selectedCols.has(c.key) ? "var(--primary-light)" : "white", cursor:"pointer", fontSize:"13px" }}>
                    <input type="checkbox" checked={selectedCols.has(c.key)} onChange={() => toggle(c.key)} style={{ accentColor:"var(--primary)", width:"15px", height:"15px" }} />
                    {c.label}
                  </label>
                ))}
              </div>
              <div style={{ marginTop:"12px", fontSize:"12px", color:"var(--gray-400)" }}>
                {selectedCols.size} of {COLUMN_DEFS.length} columns selected. Your choice will be remembered in this browser.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary btn-md" onClick={clearAll}>Clear All</button>
              <button type="button" className="btn btn-primary btn-md" onClick={saveAndClose} title="Save selection and close">Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
