import type { TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * A. OOXii Data Longlist — the core operational dataset: captured fields,
 * client snapshot, and status flags for QC and reporting. Deliberately
 * excludes raw transcript text/segments (see Audit Longlist below). Still
 * anonymous-ID only; never includes name, DOB, phone, address, or GPS
 * because the app never collects them.
 */
export const LONGLIST_CSV_COLUMNS = [
  "client_id",
  "tester_id",
  "language",
  "created_at",
  "sync_status",
  "qc_status",
  "processing_status",
  "confidence_score",
  "missing_fields",
  "comfort_response",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "glasses_selected",
  "additional_notes",
  "edited_by_user",
  "requires_qc_verification",
  "record_id",
  "age_band",
  "gender",
  "location_site",
  "cataract_history",
  "currently_has_glasses",
  "needs_qc",
  "recording_status",
  "manual_override_reason",
  "extraction_source",
] as const;

export function recordsToLonglistCsv(records: TestRecord[]) {
  const headers = LONGLIST_CSV_COLUMNS;

  const rows = records.map((record) => {
    const effective = record.edited_extracted_json ?? record.extracted_json;
    return [
      record.client_id,
      record.tester_id,
      record.language,
      record.created_at,
      record.sync_status,
      record.qc_status,
      record.processing_status,
      record.confidence_score,
      record.missing_fields.join("; "),
      effective.comfort_response,
      effective.cataract_history_confirmed,
      effective.right_eye_distance_result,
      effective.left_eye_distance_result,
      effective.final_readable_line,
      effective.glasses_selected,
      effective.additional_notes,
      record.edited_by_user ? "yes" : "no",
      record.requires_qc_verification ? "yes" : "no",
      record.id,
      record.client_snapshot.age_band,
      record.client_snapshot.gender,
      record.client_snapshot.location_site,
      record.client_snapshot.cataract_history,
      record.client_snapshot.currently_has_glasses,
      record.needs_qc ? "yes" : "no",
      record.recording_status,
      record.manual_override_reason,
      record.extraction_source
    ];
  });

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * B. Full Non-Personal Audit Longlist — the fuller audit trail, including the
 * actual transcript content (raw + English processing + corrected), segment/
 * marker detail, and recording timestamps. Still anonymous-ID only and still
 * never includes name, DOB, phone, address, or GPS — but because it carries
 * spoken/written content, keep this export handled more carefully than the
 * core data longlist above.
 */
export const AUDIT_CSV_COLUMNS = [
  "record_id",
  "client_id",
  "tester_id",
  "language",
  "created_at",
  "updated_at",
  "sync_status",
  "qc_status",
  "needs_qc",
  "processing_status",
  "recording_status",
  "recording_started_at",
  "recording_stopped_at",
  "recording_duration_seconds",
  "extraction_source",
  "edited_by_user",
  "requires_qc_verification",
  "confidence_score",
  "missing_fields_count",
  "raw_transcript_language",
  "raw_transcript_text",
  "english_processing_transcript",
  "corrected_transcript_text",
  "transcript_segments",
  "prompt_markers",
  "unclear_segments",
  "manual_override_reason",
] as const;

export function recordsToAuditCsv(records: TestRecord[]) {
  const headers = AUDIT_CSV_COLUMNS;

  const rows = records.map((record) => [
    record.id,
    record.client_id,
    record.tester_id,
    record.language,
    record.created_at,
    record.updated_at,
    record.sync_status,
    record.qc_status,
    record.needs_qc ? "yes" : "no",
    record.processing_status,
    record.recording_status,
    record.recording_started_at,
    record.recording_stopped_at,
    record.recording_duration_seconds,
    record.extraction_source,
    record.edited_by_user ? "yes" : "no",
    record.requires_qc_verification ? "yes" : "no",
    record.confidence_score,
    record.missing_fields.length,
    record.raw_transcript_language,
    record.raw_transcript_text,
    record.english_processing_transcript,
    record.corrected_transcript_text,
    JSON.stringify(record.transcript_segments),
    JSON.stringify(record.prompt_markers),
    JSON.stringify(record.unclear_segments),
    record.manual_override_reason,
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
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
