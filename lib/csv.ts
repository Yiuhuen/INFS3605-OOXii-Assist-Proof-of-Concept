import type { TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export const CSV_COLUMNS = [
  "record_id",
  "client_id",
  "tester_id",
  "language",
  "age_band",
  "gender",
  "location_site",
  "cataract_history",
  "currently_has_glasses",
  "sync_status",
  "qc_status",
  "needs_qc",
  "recording_status",
  "manual_override_reason",
  "confidence_score",
  "missing_fields",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected",
  "cataract_history_confirmed",
  "additional_notes",
  "edited_by_user",
  "requires_qc_verification",
  "extraction_source",
  "raw_transcript_text",
  "corrected_transcript_text",
  "created_at"
] as const;

export function recordsToCsv(records: TestRecord[]) {
  const headers = CSV_COLUMNS;

  const rows = records.map((record) => {
    const effective = record.edited_extracted_json ?? record.extracted_json;
    return [
      record.id,
      record.client_id,
      record.tester_id,
      record.language,
      record.client_snapshot.age_band,
      record.client_snapshot.gender,
      record.client_snapshot.location_site,
      record.client_snapshot.cataract_history,
      record.client_snapshot.currently_has_glasses,
      record.sync_status,
      record.qc_status,
      record.needs_qc ? "yes" : "no",
      record.recording_status,
      record.manual_override_reason,
      record.confidence_score,
      record.missing_fields.join("; "),
      effective.right_eye_distance_result,
      effective.left_eye_distance_result,
      effective.final_readable_line,
      effective.comfort_response,
      effective.glasses_selected,
      effective.cataract_history_confirmed,
      effective.additional_notes,
      record.edited_by_user ? "yes" : "no",
      record.requires_qc_verification ? "yes" : "no",
      record.extraction_source,
      record.raw_transcript_text,
      record.corrected_transcript_text,
      record.created_at
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
