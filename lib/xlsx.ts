import ExcelJS from "exceljs";
import { assertNoPersonalFields, buildOoxiiDataLonglist, readableColumn } from "./csv";
import type { TestRecord } from "./types";

/**
 * ---------------------------------------------------------------------------
 * OOXii Data Longlist — Excel (.xlsx) export.
 * ---------------------------------------------------------------------------
 * Presentation layer on top of lib/csv.ts's buildOoxiiDataLonglist: same
 * records, same columns, same privacy guard — this module only adds the
 * spreadsheet-specific formatting (readable headers, Yes/No booleans,
 * readable date/time cells, frozen header row, auto-filter) and the
 * browser file-delivery helpers (share sheet / download) used by the
 * Export screen. Never re-derives field values itself.
 * ---------------------------------------------------------------------------
 */

export const OOXII_DATA_LONGLIST_SHEET_NAME = "OOXii Data Longlist";
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Columns whose raw cell is a boolean flag — rendered as Yes/No in the spreadsheet. The CSV export keeps its own "true"/"false" convention (recordsToLonglistCsv); this only affects the XLSX presentation. */
const BOOLEAN_DISPLAY_COLUMNS = new Set(["offline_created", "pending_sync", "qc_required", "export_ready", "demo_record"]);

/** Columns holding a naive local timestamp ("YYYY-MM-DDTHH:MM:SS") — rendered as a readable date/time instead of raw ISO-ish text. */
const DATE_TIME_COLUMNS = new Set(["started_at", "completed_at", "reviewed_at"]);

function formatDateTimeCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Not recorded";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function displayCell(column: string, value: string | number | boolean): string | number {
  if (BOOLEAN_DISPLAY_COLUMNS.has(column) || typeof value === "boolean") return value ? "Yes" : "No";
  if (DATE_TIME_COLUMNS.has(column) && typeof value === "string") return formatDateTimeCell(value);
  return value;
}

export interface XlsxRows {
  headers: string[];
  rows: Array<Array<string | number>>;
}

/**
 * Presentation-formatted rows for the OOXii Data Longlist — same records and
 * column set as buildOoxiiDataLonglist (lib/csv.ts), with readable headers,
 * Yes/No booleans and human-readable date/time cells for the spreadsheet.
 * Re-runs the privacy guard on the underlying column list as an explicit,
 * visible check for the XLSX export path (defence in depth — buildOoxiiDataLonglist
 * already guards internally).
 */
export function buildOoxiiDataLonglistRows(records: TestRecord[]): XlsxRows {
  const table = buildOoxiiDataLonglist(records);
  assertNoPersonalFields(table.columns);
  const headers = table.columns.map(readableColumn);
  const rows = table.rows.map((row) => row.map((value, index) => displayCell(table.columns[index], value)));
  return { headers, rows };
}

/** 1-based column index -> spreadsheet letter (1 -> A, 27 -> AA). */
function columnLetter(n: number): string {
  let letters = "";
  let num = n;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    num = Math.floor((num - 1) / 26);
  }
  return letters;
}

function columnWidth(header: string, values: Array<string | number>): number {
  const longestValue = values.reduce((max: number, value) => Math.max(max, String(value).length), 0);
  return Math.min(Math.max(Math.max(header.length, longestValue) + 2, 10), 42);
}

/**
 * Builds the OOXii Data Longlist workbook — one worksheet, one row per
 * record, frozen header row, auto-filter, sensible column widths. Pure/
 * isomorphic (no DOM access) so it runs the same in the browser and in
 * scripts/test-demo-data.ts.
 */
export async function exportOoxiiDataLonglistXlsx(records: TestRecord[]): Promise<ExcelJS.Workbook> {
  const { headers, rows } = buildOoxiiDataLonglistRows(records);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OOXii Assist";

  const sheet = workbook.addWorksheet(OOXII_DATA_LONGLIST_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.columns = headers.map((header, index) => ({
    header,
    key: `col${index}`,
    width: columnWidth(header, rows.map((row) => row[index]))
  }));
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = `A1:${columnLetter(headers.length)}1`;

  return workbook;
}

/** Clear, timestamped, phone-friendly filename — mirrors the existing CSV export's date convention (app/page.tsx). */
export function ooxiiDataLonglistFilename(date: Date = new Date()): string {
  return `ooxii-data-longlist-${date.toISOString().slice(0, 10)}.xlsx`;
}

/**
 * Serialises a workbook to a real .xlsx File with the correct name and MIME
 * type. Uses only the ArrayBuffer + File/Blob globals (available in both
 * modern browsers and Node 20+), so this is directly unit-testable in
 * scripts/test-demo-data.ts without a DOM.
 */
export async function buildXlsxFile(workbook: ExcelJS.Workbook, filename: string): Promise<File> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], filename, { type: XLSX_MIME_TYPE });
}

export type XlsxDeliveryOutcome = "shared" | "downloaded" | "blocked";

/** Browser-only anchor download via an object URL — same pattern as lib/csv.ts's downloadCsv. */
function downloadFileViaAnchor(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Fires the mobile file-open UX for a generated .xlsx File, directly from
 * the caller's event-handler continuation (no artificial delay):
 *  1. Native share sheet when the browser supports sharing files
 *     (navigator.canShare/share) — most iOS Safari and Android browsers.
 *  2. Otherwise (or if the share attempt itself fails, including the user
 *     cancelling the sheet) a normal download via object URL + hidden
 *     anchor, so the user always ends up with the file one way or another.
 *  3. "blocked" only when the download attempt itself throws — the true
 *     last-resort failure.
 * Never throws — every failure resolves to "blocked" instead, so the caller
 * can show a plain-language fallback message rather than a raw error.
 */
export async function shareOrDownloadXlsxFile(file: File): Promise<XlsxDeliveryOutcome> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "OOXii Data Longlist", text: "OOXii Assist export" });
      return "shared";
    } catch {
      // Unsupported, denied, or the user cancelled the sheet — fall through to a plain download so they still get the file.
    }
  }
  try {
    downloadFileViaAnchor(file);
    return "downloaded";
  } catch {
    return "blocked";
  }
}
