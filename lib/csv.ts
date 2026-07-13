import type { TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export const CSV_COLUMNS = [
  "client_id",
  "tester_id",
  "language",
  "created_at",
  "sync_status",
  "qc_status",
  "confidence_score",
  "missing_fields",
  "raw_transcript_text",
  "corrected_transcript_text",
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

export function recordsToCsv(records: TestRecord[]) {
  const headers = CSV_COLUMNS;

  const rows = records.map((record) => {
    const effective = record.edited_extracted_json ?? record.extracted_json;
    return [
      record.client_id,
      record.tester_id,
      record.language,
      record.created_at,
      record.sync_status,
      record.qc_status,
      record.confidence_score,
      record.missing_fields.join("; "),
      record.raw_transcript_text,
      record.corrected_transcript_text,
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

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
