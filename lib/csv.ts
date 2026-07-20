import type { TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * A. OOXii Data Longlist — the core operational dataset for QC and reporting:
 * captured/confirmed fields plus client snapshot demographics. Deliberately
 * excludes raw transcript text/segments and internal audit metadata (see the
 * Full Non-Personal Audit Longlist below). Anonymous client IDs only — never
 * includes name, DOB, phone, address, or GPS because the app never collects
 * them.
 */
export const LONGLIST_CSV_COLUMNS = [
  "client_id",
  "tester_id",
  "test_date",
  "deployment_site",
  "age_band",
  "gender",
  "cataract_history",
  "current_glasses",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "glasses_selected",
  "comfort_response",
  "additional_notes",
  "qc_status",
  "sync_status"
] as const;

function longlistRow(record: TestRecord) {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  return [
    record.client_id,
    record.tester_id,
    record.created_at,
    record.client_snapshot.location_site,
    record.client_snapshot.age_band,
    record.client_snapshot.gender,
    effective.cataract_history_confirmed,
    effective.current_glasses,
    effective.right_eye_distance_result,
    effective.left_eye_distance_result,
    effective.final_readable_line,
    effective.glasses_selected,
    effective.comfort_response,
    effective.additional_notes,
    record.qc_status,
    record.sync_status
  ];
}

export function recordsToLonglistCsv(records: TestRecord[]) {
  const rows = records.map(longlistRow);
  return [LONGLIST_CSV_COLUMNS, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * B. Full Non-Personal Audit Longlist — every OOXii Data Longlist column plus
 * the fuller audit trail: transcript content (raw/English-processing/
 * corrected), confidence and missing-field detail, edit/QC-verification
 * flags, recording and sync metadata, and unclear-segment detail. Still
 * anonymous-ID only and never includes name, DOB, phone, address, or GPS —
 * but because it carries spoken/written content, handle this export more
 * carefully than the core data longlist above.
 */
export const AUDIT_CSV_COLUMNS = [
  ...LONGLIST_CSV_COLUMNS,
  "language",
  "raw_transcript_language",
  "raw_transcript_text",
  "english_processing_transcript",
  "corrected_transcript_text",
  "confidence_score",
  "missing_fields",
  "edited_by_user",
  "requires_qc_verification",
  "recording_status",
  "manual_override_reason",
  "unclear_segments",
  "prompt_markers",
  "has_unvisited_prompts",
  "processing_status",
  "sync_attempts",
  "created_at",
  "updated_at"
] as const;

function auditRow(record: TestRecord) {
  return [
    ...longlistRow(record),
    record.language,
    record.raw_transcript_language,
    record.raw_transcript_text,
    record.english_processing_transcript,
    record.corrected_transcript_text,
    record.confidence_score,
    record.missing_fields.join("; "),
    record.edited_by_user ? "yes" : "no",
    record.requires_qc_verification ? "yes" : "no",
    record.recording_status,
    record.manual_override_reason,
    JSON.stringify(record.unclear_segments),
    JSON.stringify(record.prompt_markers),
    record.has_unvisited_prompts ? "yes" : "no",
    record.processing_status,
    record.sync_attempts,
    record.created_at,
    record.updated_at
  ];
}

export function recordsToAuditCsv(records: TestRecord[]) {
  const rows = records.map(auditRow);
  return [AUDIT_CSV_COLUMNS, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
