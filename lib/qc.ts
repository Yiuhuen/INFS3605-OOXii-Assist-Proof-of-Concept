import type { QCStatus, TestRecord } from "./types";

const qcStatusLabels: Record<QCStatus, string> = {
  Unreviewed: "Needs review",
  "In review": "In review",
  Corrected: "Edited",
  Approved: "Complete"
};

/** Friendlier copy for the raw QCStatus enum. The stored value never changes — this is display-only. */
export function qcStatusLabel(status: QCStatus): string {
  return qcStatusLabels[status] ?? status;
}

export type QcFilter = "needs_qc" | "edited" | "missing_fields" | "low_confidence" | "recording_issues" | "pending_sync" | "all";

export const qcFilters: Array<{ id: QcFilter; label: string }> = [
  { id: "needs_qc", label: "Needs QC" },
  { id: "edited", label: "Edited" },
  { id: "missing_fields", label: "Missing fields" },
  { id: "low_confidence", label: "Low confidence" },
  { id: "recording_issues", label: "Recording issues" },
  { id: "pending_sync", label: "Pending sync" },
  { id: "all", label: "All records" }
];

export function isLowConfidence(record: TestRecord) {
  return record.confidence_score < 0.7;
}

export function hasMissingFields(record: TestRecord) {
  return record.missing_fields.length > 0;
}

export function recordingIncomplete(record: TestRecord) {
  return record.recording_status !== "recorded";
}

export function recordNeedsQc(record: TestRecord) {
  // QC sign-off is terminal for data-quality issues, but sync problems remain
  // visible because the demo/export flows need to show pending local records.
  if (record.qc_status === "Approved" && record.sync_status === "Synced") return false;
  return (
    record.needs_qc ||
    record.requires_qc_verification ||
    record.edited_by_user ||
    isLowConfidence(record) ||
    hasMissingFields(record) ||
    recordingIncomplete(record) ||
    record.qc_status === "Unreviewed" ||
    record.sync_status === "Pending sync" ||
    record.sync_status === "Failed"
  );
}

export function qcReasons(record: TestRecord): string[] {
  if (record.qc_status === "Approved") return ["QC complete"];
  const reasons: string[] = [];
  if (recordingIncomplete(record)) reasons.push(`Recording ${record.recording_status.replace("_", " ")}`);
  if (isLowConfidence(record)) reasons.push("Low confidence");
  if (hasMissingFields(record)) reasons.push("Missing fields");
  if (record.edited_by_user) reasons.push("Edited by tester");
  if (record.sync_status === "Pending sync") reasons.push("Pending sync");
  if (record.sync_status === "Failed") reasons.push("Sync failed");
  if (record.qc_status === "Unreviewed") reasons.push("Unreviewed");
  return reasons;
}

export function filterRecords(records: TestRecord[], filter: QcFilter): TestRecord[] {
  switch (filter) {
    case "needs_qc":
      return records.filter(recordNeedsQc);
    case "edited":
      return records.filter((record) => record.edited_by_user);
    case "missing_fields":
      return records.filter(hasMissingFields);
    case "low_confidence":
      return records.filter(isLowConfidence);
    case "recording_issues":
      return records.filter(recordingIncomplete);
    case "pending_sync":
      return records.filter((record) => record.sync_status === "Pending sync");
    case "all":
    default:
      return records;
  }
}
