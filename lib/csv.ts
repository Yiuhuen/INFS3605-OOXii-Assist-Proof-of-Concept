import type { TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records: TestRecord[]) {
  const headers = [
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
    "confidence_score",
    "missing_fields",
    "right_eye_distance_result",
    "left_eye_distance_result",
    "final_readable_line",
    "comfort_response",
    "glasses_selected",
    "additional_notes",
    "created_at"
  ];

  const rows = records.map((record) => [
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
    record.confidence_score,
    record.missing_fields.join("; "),
    record.extracted_json.right_eye_distance_result,
    record.extracted_json.left_eye_distance_result,
    record.extracted_json.final_readable_line,
    record.extracted_json.comfort_response,
    record.extracted_json.glasses_selected,
    record.extracted_json.additional_notes,
    record.created_at
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
