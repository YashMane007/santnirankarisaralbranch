/**
 * Lightweight PDF generator — pure JavaScript, no Node APIs.
 * Works in Cloudflare Workers edge runtime.
 * Generates attendance report PDFs.
 */

// PDF object counter
let objCounter = 0;
function nextObj() { return ++objCounter; }

function pdfStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function encodeWin1252(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "?");
}

interface PdfPage {
  content: string[];
  width: number;
  height: number;
}

class PdfBuilder {
  private objects: Map<number, string> = new Map();
  private pages: number[] = [];
  private catalogId = 0;
  private pagesId = 0;
  private fontId = 0;
  private boldFontId = 0;

  constructor() {
    objCounter = 0;
    this.pagesId = nextObj();
    this.catalogId = nextObj();
    this.fontId = nextObj();
    this.boldFontId = nextObj();

    this.objects.set(this.fontId,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`
    );
    this.objects.set(this.boldFontId,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`
    );
  }

  addPage(page: PdfPage): void {
    const contentId = nextObj();
    const pageId = nextObj();
    const contentStr = page.content.join("\n");
    const contentBytes = new TextEncoder().encode(contentStr);
    this.objects.set(contentId,
      `<< /Length ${contentBytes.length} >>\nstream\n${contentStr}\nendstream`
    );
    this.objects.set(pageId,
      `<< /Type /Page /Parent ${this.pagesId} 0 R ` +
      `/MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 ${this.fontId} 0 R /F2 ${this.boldFontId} 0 R >> >> >>`
    );
    this.pages.push(pageId);
  }

  build(): Uint8Array {
    this.objects.set(this.pagesId,
      `<< /Type /Pages /Kids [${this.pages.map(p => `${p} 0 R`).join(" ")}] /Count ${this.pages.length} >>`
    );
    this.objects.set(this.catalogId,
      `<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`
    );
    const lines: string[] = ["%PDF-1.4"];
    const offsets: Map<number, number> = new Map();
    let offset = lines[0].length + 1;
    const sorted = Array.from(this.objects.entries()).sort((a, b) => a[0] - b[0]);
    for (const [id, content] of sorted) {
      offsets.set(id, offset);
      const obj = `${id} 0 obj\n${content}\nendobj\n`;
      lines.push(obj);
      offset += new TextEncoder().encode(obj).length;
    }
    const xrefOffset = offset;
    const xrefLines: string[] = [`xref\n0 ${sorted[sorted.length - 1][0] + 1}`];
    xrefLines.push("0000000000 65535 f ");
    let xrefPos = 1;
    for (const [id] of sorted) {
      while (xrefPos < id) { xrefLines.push("0000000000 65535 f "); xrefPos++; }
      const off = offsets.get(id)!;
      xrefLines.push(String(off).padStart(10, "0") + " 00000 n ");
      xrefPos++;
    }
    lines.push(xrefLines.join("\n"));
    lines.push(`trailer\n<< /Size ${sorted[sorted.length - 1][0] + 1} /Root ${this.catalogId} 0 R >>`);
    lines.push(`startxref\n${xrefOffset}\n%%EOF`);
    return new TextEncoder().encode(lines.join("\n"));
  }
}

// ─── Attendance Report PDF ────────────────────────────────────────────────────

export interface AttendancePdfRow {
  date?: string;          // YYYY-MM-DD — rendered as "Fri, 1 May(5), 2026"
  memberName: string;
  memberId: string;
  sevaRole: string | null;
  sessionLabel: string | null;
  location: string | null;
  timeIST: string;
  markedBy: string;
  adminMarkedAt?: string | null; // "Sun, 3 May, 2026 (9:30AM)" — only when admin marked
}

export interface AttendancePdfOptions {
  date: string;
  orgName: string;
  appName: string;
  presentRows: AttendancePdfRow[];
  absentCount: number;
  totalActive: number;
  columns: string[];
}

/**
 * Format YYYY-MM-DD as "Fri, 1 May(5), 2026"
 */
export function fmtDayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}(${d.getMonth() + 1}), ${d.getFullYear()}`;
}

// "date" key maps to the new Day/Date column. Must come before name so column
// order is logical. Column key "date" is shared with CSV — no override issues.
const ALL_COLUMNS = [
  { key: "sr_no",           label: "Sr.No",          width: 25  },
  { key: "date",             label: "Day / Date",     width: 80  },
  { key: "name",             label: "Name",           width: 95  },
  { key: "id",               label: "Member ID",      width: 58  },
  { key: "seva_role",        label: "Seva Role",      width: 72  },
  { key: "session",          label: "Session",        width: 65  },
  { key: "location",         label: "Location",       width: 70  },
  { key: "time",             label: "Time (IST)",     width: 48  },
  { key: "marked_by",        label: "Marked By",      width: 68  },
  { key: "admin_marked_at",  label: "Admin Marked At",width: 85  },
];

export function generateAttendancePdf(opts: AttendancePdfOptions): Uint8Array {
  const pdf = new PdfBuilder();
  const W = 842, H = 595; // A4 landscape
  const margin = 40;
  const usableW = W - 2 * margin;

  const activeCols = ALL_COLUMNS.filter(c =>
    c.key === "sr_no" ||                          // ADD THIS condition
    opts.columns.includes("all") || opts.columns.includes(c.key)
  );

  const totalColW = activeCols.reduce((s, c) => s + c.width, 0);
  const scale = usableW / totalColW;
  const cols = activeCols.map(c => ({ ...c, width: Math.floor(c.width * scale) }));

  const rowsPerPage = 28;
  const pages = Math.ceil(opts.presentRows.length / rowsPerPage) || 1;

  for (let p = 0; p < pages; p++) {
    const content: string[] = [];
    let y = H - margin;

    content.push(`BT /F2 14 Tf ${margin} ${y} Td (${pdfStr(encodeWin1252(opts.appName))}) Tj ET`);
    y -= 18;
    content.push(`BT /F1 10 Tf ${margin} ${y} Td (${pdfStr(encodeWin1252(opts.orgName))}) Tj ET`);
    y -= 14;
    content.push(`BT /F1 10 Tf ${margin} ${y} Td (Attendance Report - ${pdfStr(opts.date)}) Tj ET`);
    y -= 10;
    content.push(`BT /F1 9 Tf ${margin} ${y} Td (Present: ${opts.presentRows.length}  |  Absent: ${opts.absentCount}  |  Total: ${opts.totalActive}  |  Rate: ${opts.totalActive > 0 ? Math.round(opts.presentRows.length / opts.totalActive * 100) : 0}%  |  Page ${p + 1}/${pages}) Tj ET`);
    y -= 8;
    content.push(`${margin} ${y} m ${W - margin} ${y} l S`);
    y -= 16;

    // Column headers
    let x = margin;
    for (const col of cols) {
      content.push(`BT /F2 8 Tf ${x + 2} ${y} Td (${pdfStr(col.label)}) Tj ET`);
      x += col.width;
    }
    y -= 4;
    content.push(`${margin} ${y} m ${W - margin} ${y} l S`);
    y -= 14;

    const startIdx = p * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, opts.presentRows.length);
    const pageRows = opts.presentRows.slice(startIdx, endIdx);

    let rowNum = startIdx;
    for (const row of pageRows) {
      x = margin;
      if (rowNum % 2 === 0) {
        content.push(`0.97 0.97 0.95 rg ${margin} ${y - 2} ${usableW} 13 re f 0 0 0 rg`);
      }

      const cells: { key: string; value: string }[] = [
        { key: "sr_no",     value: String(rowNum + 1) },
        { key: "date",      value: row.date ? fmtDayDate(row.date) : "-" },
        { key: "name",      value: row.memberName },
        { key: "id",        value: row.memberId },
        { key: "seva_role", value: row.sevaRole ?? "-" },
        { key: "session",   value: row.sessionLabel ?? "-" },
        { key: "location",  value: row.location ?? "-" },
        { key: "time",      value: row.timeIST },
        { key: "marked_by", value: row.markedBy },
        { key: "admin_marked_at", value: row.adminMarkedAt ?? "-" },
      ].filter(cell => cols.some(c => c.key === cell.key));

      for (let ci = 0; ci < cells.length; ci++) {
        const col = cols[ci];
        const val = encodeWin1252(cells[ci].value ?? "");
        content.push(`BT /F1 8 Tf ${x + 2} ${y} Td (${pdfStr(val)}) Tj ET`);
        x += col.width;
      }

      y -= 14;
      rowNum++;
    }

    content.push(`0.7 0.7 0.7 rg`);
    content.push(`BT /F1 7 Tf ${margin} 28 Td (Generated by ${pdfStr(encodeWin1252(opts.appName))} - ${pdfStr(encodeWin1252(opts.orgName))}) Tj ET`);
    content.push(`0 0 0 rg`);

    pdf.addPage({ content, width: W, height: H });
  }

  return pdf.build();
}

/** IST time formatter */
export function fmtIST(iso: string | null): string {
  if (!iso) return "-";
  const u = iso.endsWith("Z") ? iso : iso + "Z";
  return new Date(u).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata"
  });
}

/** Convert "HH:MM" 24hr string to "H:MMAM/PM" — e.g. "14:52" → "2:52PM" */
export function fmtTime12hr(t: string | null): string {
  if (!t) return "-";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m}${ampm}`;
}

/** Short datetime for PDF cells — "8 May 2026 4:01PM" (no parens, fits 85px) */
export function fmtShortDatetime(date: string | null, time24: string | null): string {
  if (!date || !time24) return "-";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date(date + "T12:00:00");
  const [hh, mm] = time24.split(":");
  let h = parseInt(hh);
  const ap = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${h}:${mm}${ap}`;
}

/** Full IST datetime formatter — "Sun, 3 May, 2026 (5:15PM)" */
export function fmtISTFull(date: string | null, markedAt: string | null): string {
  if (!markedAt) return date ? fmtDayDate(date) : "—";
  const u = markedAt.endsWith("Z") ? markedAt : markedAt + "Z";
  const d = new Date(u);
  const days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // Use date param for calendar info (avoids tz drift on day boundary)
  const dObj = date ? new Date(date + "T12:00:00") : d;
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).replace(" am"," AM").replace(" pm"," PM").replace("am","AM").replace("pm","PM");
  return `${days[dObj.getDay()]}, ${dObj.getDate()} ${months[dObj.getMonth()]}, ${dObj.getFullYear()} (${timeStr})`;
}
