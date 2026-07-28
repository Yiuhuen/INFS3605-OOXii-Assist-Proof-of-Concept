import { AMBIGUOUS_MANUAL_VALUES } from "./fieldExtraction";
import { LANGUAGE_LABELS } from "./insights";
import { exportQcStatus, fieldQcReason, qcReasonSummary, recordNeedsQc } from "./qc";
import { NOT_TESTED_FIELD_VALUE, UNKNOWN_FIELD_VALUE } from "./types";
import type { FieldConfidence, FieldConfidenceLevel, ManualExtractedFields, SyncStatus, TestRecord } from "./types";

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const SYNC_STATUS_SLUGS: Record<SyncStatus, string> = {
  Synced: "synced",
  "Local only": "local_only",
  "Pending sync": "pending_sync",
  Failed: "failed"
};

/** "rerecorded" only once a Rerecord has actually produced the saved attempt (attempt 2+) — attempt 1 with rerecord_used still false is plain "recorded". */
function recordingModeOf(record: TestRecord) {
  if (record.recording_status === "manual_override") return "manual_override";
  if (record.rerecord_used && record.recording_attempt_number > 1) return "rerecorded";
  return "recorded";
}

/** Language display name — a demo record's language_pack_label override wins (for illustrative outreach variety), otherwise the real LanguageCode's display name. */
function languagePackLabel(record: TestRecord) {
  return record.language_pack_label.trim() || LANGUAGE_LABELS[record.language] || record.language;
}

/** Empty/UNKNOWN internal sentinel → a controlled, human-readable display phrase for clinical CSV columns. Internal field_source/field_confidence/requires_review/qc_reason still carry the precise machine-readable signal (see auditRowsForRecord) — this is display-only. */
function displayValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === UNKNOWN_FIELD_VALUE) return "Not captured";
  return trimmed;
}

function transcriptAvailability(record: TestRecord) {
  return {
    transcript_available: Boolean(record.raw_transcript_text.trim()) || Boolean(record.corrected_transcript_text.trim()),
    raw_transcript_present: Boolean(record.raw_transcript_text.trim()),
    corrected_transcript_present: Boolean(record.corrected_transcript_text.trim())
  };
}

/**
 * A. OOXii Data Longlist — the core operational dataset for QC, training,
 * stock, and export-readiness reporting: one row per record. Anonymous
 * client IDs only — never includes name, DOB, phone, address, or GPS,
 * because TestRecord/ClientRecord never collect them (see lib/types.ts).
 * Demographic fields (age_band/gender) live only on client_snapshot and are
 * deliberately excluded from this export by default.
 */
export const LONGLIST_CSV_COLUMNS = [
  "record_id",
  "anonymous_client_id",
  "created_at",
  "outreach_session",
  "tester_label",
  "language_pack",
  "deployment_site",
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected_dispensed",
  "right_lens_selected",
  "left_lens_selected",
  "right_astigmatism_present",
  "right_toric_power",
  "right_toric_axis",
  "left_astigmatism_present",
  "left_toric_power",
  "left_toric_axis",
  "short_sighted_test_performed",
  "short_sighted_right_result",
  "short_sighted_left_result",
  "short_sighted_both_eyes_result",
  "short_sighted_notes",
  "additional_notes_non_personal",
  "recording_mode",
  "recording_success",
  "recording_attempt_number",
  "rerecord_used",
  "capture_confidence",
  "qc_required",
  "qc_status",
  "qc_reason_summary",
  "export_ready",
  "saved_locally",
  "sync_status",
  "demo_record",
  "demo_dataset_version"
] as const;

function longlistRow(record: TestRecord) {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const needsQc = recordNeedsQc(record);
  return [
    record.id,
    record.client_id,
    record.created_at,
    record.outreach_session,
    record.tester_id,
    languagePackLabel(record),
    record.deployment_site,
    displayValue(effective.current_glasses),
    displayValue(effective.cataract_history_confirmed),
    displayValue(effective.right_eye_distance_result),
    displayValue(effective.left_eye_distance_result),
    displayValue(effective.final_readable_line),
    displayValue(effective.comfort_response),
    displayValue(effective.glasses_selected),
    displayValue(effective.right_lens_selected),
    displayValue(effective.left_lens_selected),
    displayValue(effective.right_astigmatism_present),
    displayValue(effective.right_toric_power),
    displayValue(effective.right_toric_axis),
    displayValue(effective.left_astigmatism_present),
    displayValue(effective.left_toric_power),
    displayValue(effective.left_toric_axis),
    displayValue(effective.short_sighted_test_performed),
    displayValue(effective.short_sighted_right_result),
    displayValue(effective.short_sighted_left_result),
    displayValue(effective.short_sighted_both_eyes_result),
    displayValue(effective.short_sighted_notes),
    effective.additional_notes.trim() || "No additional non-personal notes",
    recordingModeOf(record),
    record.recording_status === "recorded",
    record.recording_attempt_number,
    record.rerecord_used,
    record.confidence_score,
    needsQc,
    exportQcStatus(record),
    qcReasonSummary(record),
    !needsQc,
    true,
    SYNC_STATUS_SLUGS[record.sync_status],
    record.demo_record,
    record.demo_dataset_version
  ];
}

export function recordsToLonglistCsv(records: TestRecord[]) {
  const rows = records.map(longlistRow);
  return [LONGLIST_CSV_COLUMNS, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * B. Full Non-Personal Audit Longlist — long/tidy format: one row per
 * (record, field) pair across the 21 manual/draft fields (see
 * AUDIT_FIELD_KEYS below), carrying the
 * field-level evidence trail (source, confidence, evidence quote, QC reason,
 * prompt coverage) the OOXii Data Longlist above deliberately omits. Still
 * anonymous-ID only and never includes name, DOB, phone, address, or GPS.
 */
export const AUDIT_CSV_COLUMNS = [
  "record_id",
  "anonymous_client_id",
  "demo_record",
  "demo_dataset_version",
  "created_at",
  "outreach_session",
  "tester_label",
  "language_pack",
  "deployment_site",
  "field_name",
  "field_value",
  "field_source",
  "field_confidence",
  "field_status",
  "evidence_quote",
  "manually_edited",
  "requires_review",
  "qc_reason",
  "prompt_step_id",
  "prompt_viewed",
  "prompt_recorded",
  "recording_mode",
  "recording_success",
  "recording_attempt_number",
  "rerecord_used",
  "transcript_available",
  "raw_transcript_present",
  "corrected_transcript_present",
  "saved_locally",
  "sync_status",
  "export_ready"
] as const;

/** Audit-only translation of the internal FieldConfidence.source enum to the export's plainer vocabulary. "manual" splits into manual_entry/reviewed_manual_entry — see fieldSourceLabel below. */
const FIELD_SOURCE_LABELS: Record<Exclude<FieldConfidence["source"], "manual">, string> = {
  transcript: "transcript",
  corrected_transcript: "corrected_transcript",
  unknown: "not_captured"
};

/**
 * manual_entry when the field never had transcript evidence behind it (a
 * Review-screen dropdown/free-text value filled in from nothing);
 * reviewed_manual_entry when a transcript-derived value was reviewed and
 * corrected — distinguished by whether FieldConfidence.evidence survived the
 * edit, which it always does when there was any to carry forward (see
 * editExtractedField/updateQcRecord in app/page.tsx).
 */
function fieldSourceLabel(meta: FieldConfidence | undefined): string {
  if (!meta) return "not_captured";
  if (meta.source === "manual") return meta.evidence ? "reviewed_manual_entry" : "manual_entry";
  return FIELD_SOURCE_LABELS[meta.source];
}

/** Best-effort numeric translation of the qualitative confidence tier for the audit export's numeric field_confidence column. */
const CONFIDENCE_NUMERIC: Record<FieldConfidenceLevel, number> = { high: 0.95, medium: 0.75, low: 0.5, unknown: 0 };

/** Short, stable step-id label per field for the audit export — not the app's internal PromptStep ids, just a readable slug. */
const PROMPT_STEP_LABELS: Record<keyof ManualExtractedFields, string> = {
  current_glasses: "current_glasses",
  cataract_history_confirmed: "cataract_history",
  right_eye_distance_result: "right_eye",
  left_eye_distance_result: "left_eye",
  final_readable_line: "final_line",
  comfort_response: "comfort",
  glasses_selected: "glasses_selected",
  right_lens_selected: "right_lens_selected",
  left_lens_selected: "left_lens_selected",
  right_astigmatism_present: "right_astigmatism",
  right_toric_power: "right_toric_power",
  right_toric_axis: "right_toric_axis",
  left_astigmatism_present: "left_astigmatism",
  left_toric_power: "left_toric_power",
  left_toric_axis: "left_toric_axis",
  short_sighted_test_performed: "short_sighted_test",
  short_sighted_right_result: "short_sighted_right",
  short_sighted_left_result: "short_sighted_left",
  short_sighted_both_eyes_result: "short_sighted_both_eyes",
  short_sighted_notes: "short_sighted_notes",
  additional_notes: "additional_notes"
};

/** The 3 fields with a real, step-scoped PromptStep id in the active language pack (see lib/languagePacks.ts) — coverage for every other field is derived from the record-level has_unvisited_prompts/recording_status flags instead. */
const REAL_PACK_STEP_ID: Partial<Record<keyof ManualExtractedFields, string>> = {
  right_eye_distance_result: "right-distance",
  left_eye_distance_result: "left-distance",
  glasses_selected: "glasses-check"
};

/** field_status vocabulary per the record-model spec: suggested / reviewed / unknown / needs_review / manual_edit / not_tested. */
function fieldStatus(record: TestRecord, meta: FieldConfidence | undefined): string {
  if (!meta || !meta.value.trim()) return "unknown";
  // Optional short-sighted module (spec §8): "Not tested" is a captured,
  // confident state — never unknown/needs_review, regardless of qc_status.
  if (meta.value.trim() === NOT_TESTED_FIELD_VALUE) return "not_tested";
  // Mirrors ReviewScreen.tsx's deriveFieldStatus: "Unclear"/"Client
  // unsure" always read as needs_review, even once dropdown-selected — the
  // on-screen status and this export must never disagree.
  if (AMBIGUOUS_MANUAL_VALUES.has(meta.value.trim())) return "needs_review";
  if (record.qc_status === "Approved") return "reviewed";
  if (meta.source === "manual") return "manual_edit";
  if (meta.requiresReview || meta.confidence === "low") return "needs_review";
  return "suggested";
}

/** Whether this field's prompt was viewed/captured-in-audio — real per-step marker lookup for the 3 pack-scoped fields, record-level flags for the rest (see REAL_PACK_STEP_ID doc comment). */
function promptCoverage(record: TestRecord, key: keyof ManualExtractedFields): { viewed: boolean; recorded: boolean } {
  const stepId = REAL_PACK_STEP_ID[key];
  if (stepId) {
    const viewed = record.prompt_markers.some((marker) => marker.stepId === stepId);
    const recorded = record.prompt_markers.some((marker) => marker.stepId === stepId && marker.capturedDuringRecording);
    return { viewed, recorded };
  }
  return { viewed: !record.has_unvisited_prompts, recorded: record.recording_status === "recorded" };
}

const AUDIT_FIELD_KEYS: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected",
  "right_lens_selected",
  "left_lens_selected",
  "right_astigmatism_present",
  "right_toric_power",
  "right_toric_axis",
  "left_astigmatism_present",
  "left_toric_power",
  "left_toric_axis",
  "short_sighted_test_performed",
  "short_sighted_right_result",
  "short_sighted_left_result",
  "short_sighted_both_eyes_result",
  "short_sighted_notes",
  "additional_notes"
];

function auditRowsForRecord(record: TestRecord) {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const needsQc = recordNeedsQc(record);
  const shared = [
    record.id,
    record.client_id,
    record.demo_record,
    record.demo_dataset_version,
    record.created_at,
    record.outreach_session,
    record.tester_id,
    languagePackLabel(record),
    record.deployment_site
  ];
  const transcript = transcriptAvailability(record);
  const trailing = [
    recordingModeOf(record),
    record.recording_status === "recorded",
    record.recording_attempt_number,
    record.rerecord_used,
    transcript.transcript_available,
    transcript.raw_transcript_present,
    transcript.corrected_transcript_present,
    true,
    SYNC_STATUS_SLUGS[record.sync_status],
    !needsQc
  ];

  return AUDIT_FIELD_KEYS.map((key) => {
    const meta = effective.field_confidence?.[key];
    const coverage = promptCoverage(record, key);
    return [
      ...shared,
      key,
      displayValue(meta?.value ?? ""),
      fieldSourceLabel(meta),
      meta ? CONFIDENCE_NUMERIC[meta.confidence] : 0,
      fieldStatus(record, meta),
      meta?.evidence ?? "",
      meta?.source === "manual",
      meta?.requiresReview ?? false,
      fieldQcReason(record, key),
      PROMPT_STEP_LABELS[key],
      coverage.viewed,
      coverage.recorded,
      ...trailing
    ];
  });
}

export function recordsToAuditCsv(records: TestRecord[]) {
  const rows = records.flatMap(auditRowsForRecord);
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
