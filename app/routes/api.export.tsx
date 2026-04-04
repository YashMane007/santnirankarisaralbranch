/**
 * Standalone export resource route — outside admin layout.
 * Supports CSV and PDF with column selection.
 * Never returns HTML — always a file download.
 */
import { type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/session.server";
import { getAttendanceForExport, getAbsentList } from "~/lib/db.server";
import { generateAttendancePdf, fmtIST, type AttendancePdfOptions } from "~/lib/pdf.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { getAppSettings } from "~/lib/appsettings.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";

function todayIST() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }

function csvEsc(v: any): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

const ALL_CSV_COLUMNS = [
  { key: "date",         label: "Date",          get: (r: any) => r.date },
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
  { key: "marked_by",    label: "Marked By Name", get: (r: any) => r.marked_by_name ?? "Self" },
];

function buildCSV(records: any[], columns: string[]): string {
  const cols = columns.includes("all") ? ALL_CSV_COLUMNS : ALL_CSV_COLUMNS.filter(c => columns.includes(c.key));
  const header = cols.map(c => c.label).join(",");
  const rows = records.map(r => cols.map(c => csvEsc(c.get(r))).join(","));
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
  const records  = await getAttendanceForExport(DB, from, to);

  // Audit
  await logAudit(DB, {
    actorId: session.memberId, actorName: session.memberName,
    actorRole: session.isSuperAdmin ? "super_admin" : "admin",
    action: "export_downloaded",
    details: { from, to, format, columns, count: records.length },
    ip: getClientIp(request),
  });

  if (format === "pdf") {
    const absent = await getAbsentList(DB, to);
    const pdfRows = records.map(r => ({
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
