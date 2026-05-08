/**
 * Standalone export resource route — outside admin layout.
 * Supports CSV and PDF with column selection.
 * Never returns HTML — always a file download.
 *
 * Rate limit: 10 exports per hour per IP.
 */
import { type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/session.server";
import { getAttendanceForExport, getAbsentList } from "~/lib/db.server";
import { generateAttendancePdf, fmtIST, fmtISTFull, fmtDayDate as fmtDayDateExport, fmtTime12hr, fmtShortDatetime, fmtDayDate, type AttendancePdfOptions } from "~/lib/pdf.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { getAppSettings } from "~/lib/appsettings.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";
import { checkRateLimit } from "~/lib/ratelimit.server";

function todayIST() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }

function csvEsc(v: any): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

const ALL_CSV_COLUMNS = [
  { key: "sr_no",        label: "Sr. No.",        get: (_r: any, i: number) => i + 1 },  // ADD — index passed below
  { key: "date",         label: "Date",           get: (r: any) => r.date },
//{ key: "day",          label: "Day",            get: (r: any) => r.date ? fmtDayDate(r.date) : "" },
  { key: "day",          label: "Day",            get: (r: any) => r.date? new Date(r.date).toLocaleDateString("en-US", { weekday: "long" }): ""},
  { key: "id",           label: "Member ID",      get: (r: any) => r.member_id },
  { key: "name",         label: "Name",           get: (r: any) => r.member_name },
  { key: "seva_role",    label: "Seva Role",      get: (r: any) => r.seva_role },
  { key: "session",      label: "Session",        get: (r: any) => r.session_label },
  { key: "satsang_type", label: "Satsang Type",   get: (r: any) => r.satsang_type },
  { key: "location",     label: "Location",       get: (r: any) => r.location_name },
  { key: "time",         label: "Time (IST)",     get: (r: any) => fmtIST(r.marked_at) },
  { key: "distance",     label: "Distance(m)",    get: (r: any) => r.distance_meters },
  { key: "accuracy",     label: "Accuracy(m)",    get: (r: any) => r.accuracy != null ? Math.round(r.accuracy) : "" },
  { key: "lat",          label: "Lat",            get: (r: any) => r.lat },
  { key: "lng",          label: "Lng",            get: (r: any) => r.lng },
  { key: "marked_by_id", label: "Marked By ID",   get: (r: any) => r.marked_by_id ?? "Self" },
  { key: "marked_by",        label: "Marked By Name",   get: (r: any) => r.marked_by_name ?? "Self" },
  { key: "admin_marked_date", label: "Admin Marked Date", get: (r: any) => r.admin_marked_date ?? "—" },
  { key: "admin_marked_time", label: "Admin Marked Time", get: (r: any) => r.admin_marked_time ? fmtTime12hr(r.admin_marked_time) : "—" },
];

function buildCSV(records: any[], columns: string[]): string {
  const cols = columns.includes("all") ? ALL_CSV_COLUMNS : ALL_CSV_COLUMNS.filter(c => columns.includes(c.key));
  const header = cols.map(c => c.label).join(",");
  // const rows = records.map(r => cols.map(c => csvEsc(c.get(r))).join(","));
  const rows = records.map((r, i) => cols.map(c => csvEsc(c.get(r, i))).join(","));  // ADD i here
  return "\uFEFF" + [header, ...rows].join("\r\n");
}

async function handleExport(request: Request, DB: D1Database, SESSION_SECRET: string) {
  let session: any;
  try { session = await requireAdmin(request, SESSION_SECRET, DB); }
  catch { return new Response("Unauthorized", { status: 401 }); }

  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  if (!can(perms, "export_data")) {
    return new Response("Forbidden: You do not have permission to export data.", { status: 403 });
  }

  // Rate limit: 10 exports per hour per IP
  const ip = getClientIp(request);
  const rl = await checkRateLimit(DB, `export:ip:${ip}`, 10, 3600);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many exports. Limit: 10 per hour. Try again later." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "3600" } }
    );
  }

  const isPost = request.method === "POST";
  let from: string, to: string, format: string, columns: string[];

  if (isPost) {
    const form = await request.formData();
    from    = form.get("from") as string;
    to      = form.get("to") as string;
    format  = (form.get("format") as string) || "csv";
    const rawCols = form.get("columns") as string;
    columns = rawCols ? rawCols.split(",").map(s => s.trim()) : ["all"];
  } else {
    const url = new URL(request.url);
    from    = url.searchParams.get("from") ?? todayIST();
    to      = url.searchParams.get("to") ?? todayIST();
    format  = url.searchParams.get("format") ?? "csv";
    const rawCols = url.searchParams.get("columns") ?? "all";
    columns = rawCols.split(",").map(s => s.trim());
  }

  if (!from || !to) return new Response("Missing from/to", { status: 400 });

  const settings = await getAppSettings(DB);
  const filterUrl = new URL(request.url);
  const filterSearch = filterUrl.searchParams.get("search") || undefined;
  const filterRole   = filterUrl.searchParams.get("role")   || undefined;
  const filterLoc    = filterUrl.searchParams.get("loc")    || undefined;
  const records  = await getAttendanceForExport(DB, from, to, { search: filterSearch, role: filterRole, loc: filterLoc });

  await logAudit(DB, {
    actorId: session.memberId, actorName: session.memberName,
    actorRole: session.isSuperAdmin ? "super_admin" : "admin",
    action: "export_downloaded",
    details: { from, to, format, columns, count: records.length },
    ip,
  });

  if (format === "pdf") {
    const absent = await getAbsentList(DB, to);
    const pdfRows = records.map(r => ({
      date: r.date,                          // for Day/Date column
      memberName: r.member_name ?? "—",
      memberId: r.member_id,
      sevaRole: r.seva_role,
      sessionLabel: r.session_label,
      location: r.location_name,
      timeIST: fmtIST(r.marked_at),
      markedBy: r.marked_by_id ? `${r.marked_by_name} (${r.marked_by_id})` : "Self",
    }));
    const pdfOpts: AttendancePdfOptions = {
      date: from === to ? from : `${from} to ${to}`,
      orgName: settings.org_name,
      appName: settings.app_name,
      presentRows: pdfRows,
      absentCount: absent.length,
      totalActive: pdfRows.length + absent.length,
      columns,
    };
    const pdfBytes = generateAttendancePdf(pdfOpts);
    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sevadalAttendance-${from}-to-${to}.pdf"`,
      },
    });
  }

  // CSV
  const csv = buildCSV(records, columns);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sevadalAttendance-${from}-to-${to}.csv"`,
    },
  });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  return handleExport(request, context.cloudflare.env.DB, context.cloudflare.env.SESSION_SECRET);
}
export async function action({ request, context }: ActionFunctionArgs) {
  return handleExport(request, context.cloudflare.env.DB, context.cloudflare.env.SESSION_SECRET);
}
