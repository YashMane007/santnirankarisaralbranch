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
  // Simple ASCII safe encoding
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
    // Pages object
    this.objects.set(this.pagesId,
      `<< /Type /Pages /Kids [${this.pages.map(p => `${p} 0 R`).join(" ")}] /Count ${this.pages.length} >>`
    );

    // Catalog
    this.objects.set(this.catalogId,
      `<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`
    );

    // Build PDF bytes
    const lines: string[] = ["%PDF-1.4"];
    const offsets: Map<number, number> = new Map();
    let offset = lines[0].length + 1;

    // Sort objects by ID
    const sorted = Array.from(this.objects.entries()).sort((a, b) => a[0] - b[0]);

    for (const [id, content] of sorted) {
      offsets.set(id, offset);
      const obj = `${id} 0 obj\n${content}\nendobj\n`;
      lines.push(obj);
      offset += new TextEncoder().encode(obj).length;
    }

    // Cross-reference table
    const xrefOffset = offset;
    const xrefLines: string[] = [`xref\n0 ${sorted[sorted.length - 1][0] + 1}`];
    xrefLines.push("0000000000 65535 f ");

    let xrefPos = 1;
    for (const [id] of sorted) {
      while (xrefPos < id) {
        xrefLines.push("0000000000 65535 f ");
        xrefPos++;
      }
      const off = offsets.get(id)!;
      xrefLines.push(String(off).padStart(10, "0") + " 00000 n ");
      xrefPos++;
    }

    lines.push(xrefLines.join("\n"));
    lines.push(`trailer\n<< /Size ${sorted[sorted.length - 1][0] + 1} /Root ${this.catalogId} 0 R >>`);
    lines.push(`startxref\n${xrefOffset}\n%%EOF`);

    const finalStr = lines.join("\n");
    return new TextEncoder().encode(finalStr);
  }
}

// ─── Attendance Report PDF ────────────────────────────────────────────────────

export interface AttendancePdfRow {
  memberName: string;
  memberId: string;
  sevaRole: string | null;
  sessionLabel: string | null;
  location: string | null;
  timeIST: string;
  markedBy: string;
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

const ALL_COLUMNS = [
  { key: "name",       label: "Name",        width: 100 },
  { key: "id",         label: "Member ID",   width: 65  },
  { key: "seva_role",  label: "Seva Role",   width: 80  },
  { key: "session",    label: "Session",     width: 80  },
  { key: "location",   label: "Location",    width: 90  },
  { key: "time",       label: "Time (IST)",  width: 60  },
  { key: "marked_by",  label: "Marked By",   width: 80  },
];

export function generateAttendancePdf(opts: AttendancePdfOptions): Uint8Array {
  const pdf = new PdfBuilder();
  const W = 595, H = 842; // A4
  const margin = 40;
  const usableW = W - 2 * margin;

  const activeCols = ALL_COLUMNS.filter(c =>
    opts.columns.includes("all") || opts.columns.includes(c.key)
  );

  // Scale columns to fit
  const totalColW = activeCols.reduce((s, c) => s + c.width, 0);
  const scale = usableW / totalColW;
  const cols = activeCols.map(c => ({ ...c, width: Math.floor(c.width * scale) }));

  const rowsPerPage = 28;
  const pages = Math.ceil(opts.presentRows.length / rowsPerPage) || 1;

  for (let p = 0; p < pages; p++) {
    const content: string[] = [];
    let y = H - margin;

    // Header
    content.push(`BT /F2 14 Tf ${margin} ${y} Td (${pdfStr(encodeWin1252(opts.appName))}) Tj ET`);
    y -= 18;
    content.push(`BT /F1 10 Tf ${margin} ${y} Td (${pdfStr(encodeWin1252(opts.orgName))}) Tj ET`);
    y -= 14;
    content.push(`BT /F1 10 Tf ${margin} ${y} Td (Attendance Report - ${pdfStr(opts.date)}) Tj ET`);
    y -= 10;

    // Summary bar
    content.push(`BT /F1 9 Tf ${margin} ${y} Td (Present: ${opts.presentRows.length}  |  Absent: ${opts.absentCount}  |  Total: ${opts.totalActive}  |  Rate: ${opts.totalActive > 0 ? Math.round(opts.presentRows.length / opts.totalActive * 100) : 0}%  |  Page ${p + 1}/${pages}) Tj ET`);
    y -= 8;

    // Divider line
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

    // Rows
    const startIdx = p * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, opts.presentRows.length);
    const pageRows = opts.presentRows.slice(startIdx, endIdx);

    let rowNum = startIdx;
    for (const row of pageRows) {
      x = margin;

      // Alternate row background
      if (rowNum % 2 === 0) {
        content.push(`0.97 0.97 0.95 rg ${margin} ${y - 2} ${usableW} 13 re f 0 0 0 rg`);
      }

      const cells: { key: string; value: string }[] = [
        { key: "name",      value: row.memberName },
        { key: "id",        value: row.memberId },
        { key: "seva_role", value: row.sevaRole ?? "-" },
        { key: "session",   value: row.sessionLabel ?? "-" },
        { key: "location",  value: row.location ?? "-" },
        { key: "time",      value: row.timeIST },
        { key: "marked_by", value: row.markedBy },
      ].filter(cell => cols.some(c => c.key === cell.key));

      for (let ci = 0; ci < cells.length; ci++) {
        const col = cols[ci];
        const val = encodeWin1252(cells[ci].value ?? "");
        // Truncate to fit column
        const maxChars = Math.floor(col.width / 5.5);
        const display = val.length > maxChars ? val.slice(0, maxChars - 1) + "..." : val;
        content.push(`BT /F1 8 Tf ${x + 2} ${y} Td (${pdfStr(display)}) Tj ET`);
        x += col.width;
      }

      y -= 14;
      rowNum++;
    }

    // Footer
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
