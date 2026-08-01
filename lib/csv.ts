import { AMBIGUOUS_MANUAL_VALUES, FIELD_DISPLAY_LABELS } from "./fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "./transcriptQuality";
import { LANGUAGE_LABELS } from "./insights";
import { fieldQcReason, qcReasonSummary, qcStatusLabel, recordNeedsQc } from "./qc";
import { NOT_CAPTURED_FIELD_VALUE, NOT_TESTED_FIELD_VALUE, UNKNOWN_FIELD_VALUE } from "./types";
import type { FieldConfidence, FieldConfidenceLevel, ManualExtractedFields, SyncStatus, TestRecord } from "./types";

/**
 * ---------------------------------------------------------------------------
 * The two OOXii Assist longlist exports.
 * ---------------------------------------------------------------------------
 * A. OOXii Data Longlist   — one row per test RECORD. The operational view:
 *    what was captured, right/left lens data, optional-test status, QC state
 *    and export readiness. For council/NGO/OOXii operations reporting.
 * B. Full Audit Longlist   — one row per captured/reviewed FIELD. The
 *    traceability layer: source, evidence quote, confidence, manual edits,
 *    QC reason and review status. This is how the app avoids treating
 *    speech-to-text output as unquestioned truth.
 *
 * Neither export ever includes a name, DOB, phone number, street address, or
 * GPS coordinate — those fields do not exist on TestRecord/ClientRecord at
 * all (see lib/types.ts), and assertNoPersonalFields below re-checks every
 * header list at build time as a runtime guard.
 *
 * Value vocabulary (deliberate, never blank):
 *  - "Missing"      — an expected field the capture failed to produce.
 *  - "Not tested"   — an optional module that was deliberately not performed.
 *  - "Not recorded" — an optional value that simply never came up (normal).
 * ---------------------------------------------------------------------------
 */

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** "id"/"qc" are acronyms and stay fully uppercase; only the first word is otherwise capitalised (sentence case). Shared by the on-screen field checklists (ExportScreen) and the XLSX column headers (lib/xlsx.ts) so both never disagree. */
const ACRONYM_WORDS = new Set(["id", "qc"]);

export function readableColumn(column: string) {
  return column
    .split("_")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYM_WORDS.has(lower)) return lower.toUpperCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

/** Exact column-name denylist for personal/identifying data — shared with scripts/test-demo-data.ts. Deliberately exact-match, not substring: legitimate metadata columns like "field_name" must never false-positive on "name". */
export const FORBIDDEN_EXPORT_COLUMNS: ReadonlySet<string> = new Set([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "client_name",
  "tester_name",
  "dob",
  "date_of_birth",
  "phone",
  "phone_number",
  "contact",
  "address",
  "exact_address",
  "street_address",
  "home_address",
  "gps",
  "gps_coordinates",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "location"
]);

/** Runtime privacy guard — throws if a personal-data column ever sneaks into an export header list. Called by both longlist builders on every build. */
export function assertNoPersonalFields(headers: readonly string[]) {
  for (const header of headers) {
    if (FORBIDDEN_EXPORT_COLUMNS.has(header.toLowerCase())) {
      throw new Error(`Export blocked: column "${header}" is a forbidden personal-data field.`);
    }
  }
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

/* ---------------------------------------------------------------------------
 * Shared per-field status/source/value derivation — used identically by both
 * longlists so the operational row and the audit trail can never disagree
 * about the same field.
 * ------------------------------------------------------------------------- */

/** Audit vocabulary per the longlist spec: captured / missing / check / not_tested / optional / edited / reviewed. */
export type AuditFieldStatus = "captured" | "missing" | "check" | "not_tested" | "optional" | "edited" | "reviewed";

/**
 * Field-status policy, in precedence order:
 *  - "not_tested"  — the optional module was deliberately not performed.
 *  - "missing"     — expected capture failed (high-risk field empty, or an
 *                    optional-module field explicitly flagged incomplete).
 *  - "optional"    — an optional value that simply never came up. Never QC.
 *  - "check"       — present but not yet trustworthy (ambiguous answer,
 *                    low confidence, or flagged requiresReview).
 *  - "edited"      — manually entered/corrected, not yet QC-approved.
 *  - "reviewed"    — the record has been QC-approved.
 *  - "captured"    — clean transcript-derived value awaiting nothing.
 */
function auditFieldStatus(record: TestRecord, key: keyof ManualExtractedFields, meta: FieldConfidence | undefined): AuditFieldStatus {
  const value = (meta?.value ?? "").trim();
  if (value === NOT_TESTED_FIELD_VALUE) return "not_tested";
  if (!value || value === UNKNOWN_FIELD_VALUE) {
    if (meta?.requiresReview) return "missing";
    if (HIGH_RISK_SET.has(key)) return "missing";
    return "optional";
  }
  // "Not captured" (short-sighted performed-flag ambiguity) and the Review
  // screen's explicitly-ambiguous dropdown answers always read as check —
  // mirrors ReviewScreen.tsx's deriveFieldStatus so screen and export never
  // disagree.
  if (value === NOT_CAPTURED_FIELD_VALUE || AMBIGUOUS_MANUAL_VALUES.has(value)) return "check";
  if (record.qc_status === "Approved") return "reviewed";
  if (meta?.source === "manual") return "edited";
  if (meta?.requiresReview || meta?.confidence === "low") return "check";
  return "captured";
}

/**
 * Deliberate, never-blank export value for a field given its status —
 * "Missing" for failed expected capture, "Not tested" for a deliberately
 * skipped optional module, "Not recorded" for an optional value that never
 * came up, otherwise the captured value itself.
 */
export function normaliseExportValue(value: string, status: AuditFieldStatus): string {
  if (status === "not_tested") return NOT_TESTED_FIELD_VALUE;
  if (status === "missing") return "Missing";
  if (status === "optional") return "Not recorded";
  const trimmed = value.trim();
  return !trimmed || trimmed === UNKNOWN_FIELD_VALUE ? "Missing" : trimmed;
}

/**
 * Field-source vocabulary per the longlist spec:
 *  - transcript_auto_fill    — value extracted from the (raw or corrected) transcript.
 *  - reviewed_manual_entry   — a transcript-derived value the tester reviewed and
 *                              corrected; the original evidence quote is preserved.
 *  - manual_fallback         — manually entered with no transcript evidence at all.
 *  - not_applicable          — optional module not performed / value never came up.
 *  - not_captured            — expected capture failed; there is no source to cite.
 * ("live_capture_preview" and "imported_demo_data" are reserved: live capture
 * feeds the recording screen preview but saved records always re-extract from
 * the transcript, and demo records keep their simulated per-field sources with
 * the demo_record column as the disclosure.)
 */
function auditFieldSource(status: AuditFieldStatus, meta: FieldConfidence | undefined): string {
  if (status === "not_tested" || status === "optional") return "not_applicable";
  if (status === "missing") return "not_captured";
  if (!meta) return "not_captured";
  if (meta.source === "manual") return meta.evidence ? "reviewed_manual_entry" : "manual_fallback";
  if (meta.source === "unknown") return "not_applicable";
  return "transcript_auto_fill";
}

const HIGH_RISK_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

/** Best-effort numeric translation of the qualitative confidence tier for the audit export's numeric field_confidence column. */
const CONFIDENCE_NUMERIC: Record<FieldConfidenceLevel, number> = { high: 0.95, medium: 0.75, low: 0.5, unknown: 0 };

interface FieldExportInfo {
  meta: FieldConfidence | undefined;
  status: AuditFieldStatus;
  value: string;
  source: string;
}

function fieldExportInfo(record: TestRecord, key: keyof ManualExtractedFields): FieldExportInfo {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const meta = effective.field_confidence?.[key];
  const status = auditFieldStatus(record, key, meta);
  return { meta, status, value: normaliseExportValue(meta?.value ?? "", status), source: auditFieldSource(status, meta) };
}

/* ---------------------------------------------------------------------------
 * A. OOXii Data Longlist — one row per record.
 * ------------------------------------------------------------------------- */

export const LONGLIST_CSV_COLUMNS = [
  // Record identity
  "record_id",
  "client_id",
  "tester_id",
  "clinic_id",
  "session_number",
  "started_at",
  "completed_at",
  "active_test_module",
  "record_status",
  // Location / session — city/state/country level ONLY, never street/GPS
  "country",
  "state",
  "city",
  "offline_created",
  "pending_sync",
  // Core capture
  "current_glasses",
  "cataract_history",
  "right_eye_line",
  "left_eye_line",
  "both_eyes_line",
  "final_readable_line",
  "comfort_response",
  // Glasses / dispensing — right/left always split, toric/axis explicit
  "right_lens_selected",
  "left_lens_selected",
  "right_astigmatism",
  "right_toric_power",
  "right_axis",
  "left_astigmatism",
  "left_toric_power",
  "left_axis",
  "glasses_dispensed_status",
  "frame_colour",
  "frame_size",
  "frame_type",
  // Optional tests — "Not tested" is a real value, never a blank
  "short_sighted_test_performed",
  "short_sighted_right_result",
  "short_sighted_left_result",
  "short_sighted_both_eyes_result",
  "short_sighted_notes_status",
  // Review / QC / export
  "capture_summary",
  "review_status",
  "qc_required",
  "qc_reason_summary",
  "export_ready",
  "reviewed_by",
  "reviewed_at",
  // Completion checklist + non-personal comment
  "checklist_results_card_completed",
  "checklist_care_instructions_given",
  "checklist_return_if_problem",
  "checklist_regular_eye_health_checks",
  "non_personal_session_comment",
  // Provenance
  "language_pack",
  "recording_mode",
  "capture_confidence",
  "sync_status",
  "demo_record",
  "demo_dataset_version"
] as const;

/** The 7 fields "capture_summary" counts — the core clinical capture every completed record is expected to have. */
const CORE_CAPTURE_KEYS: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
];

const CORE_CAPTURE_SHORT_LABELS: Partial<Record<keyof ManualExtractedFields, string>> = {
  current_glasses: "current glasses",
  cataract_history_confirmed: "cataract history",
  right_eye_distance_result: "right eye line",
  left_eye_distance_result: "left eye line",
  final_readable_line: "final line",
  comfort_response: "comfort",
  glasses_selected: "glasses selected"
};

function captureSummary(record: TestRecord): string {
  const missing = CORE_CAPTURE_KEYS.filter((key) => fieldExportInfo(record, key).status === "missing");
  const captured = CORE_CAPTURE_KEYS.length - missing.length;
  if (missing.length === 0) return `${captured}/${CORE_CAPTURE_KEYS.length} core fields captured`;
  return `${captured}/${CORE_CAPTURE_KEYS.length} core fields captured · missing: ${missing.map((key) => CORE_CAPTURE_SHORT_LABELS[key] ?? key).join(", ")}`;
}

/** "Dispensed — +1.00 reading glasses" / "Not dispensed" / "Missing" — the dispensing outcome, distinct from the per-eye lens split columns. */
function glassesDispensedStatus(info: FieldExportInfo): string {
  if (info.status === "missing") return "Missing";
  if (/^no glasses/i.test(info.value)) return "Not dispensed";
  return `Dispensed — ${info.value}`;
}

/** Frame details only exist when glasses were actually dispensed — "Not applicable" otherwise, "Not recorded" when dispensed but never noted. */
function frameValue(dispensed: boolean, value: string | undefined): string {
  if (!dispensed) return "Not applicable";
  return value?.trim() ? value : "Not recorded";
}

function shortSightedNotesStatus(record: TestRecord): string {
  const performed = fieldExportInfo(record, "short_sighted_test_performed");
  if (performed.value !== "Yes") return NOT_TESTED_FIELD_VALUE;
  const notes = record.edited_extracted_json?.short_sighted_notes ?? record.extracted_json.short_sighted_notes;
  return notes.trim() && notes.trim() !== NOT_TESTED_FIELD_VALUE ? "Notes recorded" : "None recorded";
}

/** Reviewer stamp — only once a human has actually corrected/approved the record; empty (not fabricated) before that. */
function reviewerStamp(record: TestRecord): { reviewedBy: string; reviewedAt: string } {
  if (record.qc_status !== "Approved" && record.qc_status !== "Corrected") return { reviewedBy: "", reviewedAt: "" };
  return {
    reviewedBy: record.operational?.reviewed_by || record.tester_id,
    reviewedAt: record.operational?.reviewed_at || record.updated_at
  };
}

function checklistValue(value: boolean | undefined): string {
  if (value === undefined) return "Not recorded";
  return value ? "Yes" : "No";
}

function longlistRow(record: TestRecord): Array<string | number | boolean> {
  const op = record.operational;
  const needsQc = recordNeedsQc(record);
  const info = (key: keyof ManualExtractedFields) => fieldExportInfo(record, key);
  const glassesInfo = info("glasses_selected");
  const dispensed = glassesInfo.status !== "missing" && !/^no glasses/i.test(glassesInfo.value);
  const { reviewedBy, reviewedAt } = reviewerStamp(record);
  return [
    record.id,
    record.client_id,
    record.tester_id,
    op?.clinic_id || record.deployment_site,
    op?.session_number ?? "",
    record.recording_started_at || record.created_at,
    op?.completed_at || record.updated_at,
    op?.active_test_module || "wheel_paddle",
    record.status,
    op?.region_country || "Not recorded",
    op?.region_state || "Not recorded",
    op?.region_city || "Not recorded",
    record.connection_status === "offline",
    record.sync_status === "Pending sync",
    info("current_glasses").value,
    info("cataract_history_confirmed").value,
    info("right_eye_distance_result").value,
    info("left_eye_distance_result").value,
    info("both_eyes_line").value,
    info("final_readable_line").value,
    info("comfort_response").value,
    info("right_lens_selected").value,
    info("left_lens_selected").value,
    info("right_astigmatism_present").value,
    info("right_toric_power").value,
    info("right_toric_axis").value,
    info("left_astigmatism_present").value,
    info("left_toric_power").value,
    info("left_toric_axis").value,
    glassesDispensedStatus(glassesInfo),
    frameValue(dispensed, op?.frame_colour),
    frameValue(dispensed, op?.frame_size),
    frameValue(dispensed, op?.frame_type),
    info("short_sighted_test_performed").value,
    info("short_sighted_right_result").value,
    info("short_sighted_left_result").value,
    info("short_sighted_both_eyes_result").value,
    shortSightedNotesStatus(record),
    captureSummary(record),
    qcStatusLabel(record.qc_status),
    needsQc,
    qcReasonSummary(record),
    !needsQc,
    reviewedBy,
    reviewedAt,
    checklistValue(op?.checklist_results_card_completed),
    checklistValue(op?.checklist_care_instructions_given),
    checklistValue(op?.checklist_return_if_problem),
    checklistValue(op?.checklist_regular_eye_health_checks),
    op?.session_comment?.trim() || "No comment",
    languagePackLabel(record),
    recordingModeOf(record),
    record.confidence_score,
    SYNC_STATUS_SLUGS[record.sync_status],
    record.demo_record,
    record.demo_dataset_version
  ];
}

export interface LonglistTable {
  columns: readonly string[];
  rows: Array<Array<string | number | boolean>>;
}

/** OOXii Data Longlist — one row per record. Runs the personal-field guard on every build. */
export function buildOoxiiDataLonglist(records: TestRecord[]): LonglistTable {
  assertNoPersonalFields(LONGLIST_CSV_COLUMNS);
  return { columns: LONGLIST_CSV_COLUMNS, rows: records.map(longlistRow) };
}

export function recordsToLonglistCsv(records: TestRecord[]) {
  const table = buildOoxiiDataLonglist(records);
  return [table.columns as readonly unknown[], ...table.rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/* ---------------------------------------------------------------------------
 * B. Full Audit Longlist — one row per (record, field) pair.
 * ------------------------------------------------------------------------- */

export const AUDIT_CSV_COLUMNS = [
  "audit_row_id",
  "record_id",
  "client_id",
  "field_group",
  "field_name",
  "field_label",
  "field_value",
  "field_status",
  "field_source",
  "field_confidence",
  "evidence_quote",
  "transcript_line_number",
  "prompt_step",
  "prompt_label",
  "manually_edited",
  "original_extracted_value",
  "reviewed_value",
  "reviewer_action",
  "requires_review",
  "qc_reason",
  "reviewed_at",
  "export_ready",
  "prompt_viewed",
  "prompt_recorded",
  "demo_record",
  "demo_dataset_version"
] as const;

/** Which spec field-group each audit row belongs to: Core / Vision / Glasses / Astigmatism / Optional tests / Completion. */
const FIELD_GROUPS: Record<keyof ManualExtractedFields, string> = {
  current_glasses: "Core",
  cataract_history_confirmed: "Core",
  right_eye_distance_result: "Vision",
  left_eye_distance_result: "Vision",
  both_eyes_line: "Vision",
  final_readable_line: "Vision",
  comfort_response: "Vision",
  glasses_selected: "Glasses",
  right_lens_selected: "Glasses",
  left_lens_selected: "Glasses",
  right_astigmatism_present: "Astigmatism",
  right_toric_power: "Astigmatism",
  right_toric_axis: "Astigmatism",
  left_astigmatism_present: "Astigmatism",
  left_toric_power: "Astigmatism",
  left_toric_axis: "Astigmatism",
  short_sighted_test_performed: "Optional tests",
  short_sighted_right_result: "Optional tests",
  short_sighted_left_result: "Optional tests",
  short_sighted_both_eyes_result: "Optional tests",
  short_sighted_notes: "Optional tests",
  additional_notes: "Completion"
};

/** Short, stable step slug per field for the audit export — not the app's internal PromptStep ids, just a readable identifier. */
const PROMPT_STEP_LABELS: Record<keyof ManualExtractedFields, string> = {
  current_glasses: "current_glasses",
  cataract_history_confirmed: "cataract_history",
  right_eye_distance_result: "right_eye",
  left_eye_distance_result: "left_eye",
  both_eyes_line: "both_eyes",
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

/** Human-readable prompt label per field — which guided step the value belongs to. */
const PROMPT_LABELS: Record<keyof ManualExtractedFields, string> = {
  current_glasses: "Glasses check — current glasses",
  cataract_history_confirmed: "Intro — cataract history",
  right_eye_distance_result: "Right eye — distance check",
  left_eye_distance_result: "Left eye — distance check",
  both_eyes_line: "Both eyes — line check",
  final_readable_line: "Final readable line",
  comfort_response: "Glasses check — comfort",
  glasses_selected: "Glasses check — selection",
  right_lens_selected: "Glasses check — right lens",
  left_lens_selected: "Glasses check — left lens",
  right_astigmatism_present: "Astigmatism — right eye",
  right_toric_power: "Astigmatism — right toric power",
  right_toric_axis: "Astigmatism — right axis",
  left_astigmatism_present: "Astigmatism — left eye",
  left_toric_power: "Astigmatism — left toric power",
  left_toric_axis: "Astigmatism — left axis",
  short_sighted_test_performed: "Optional — short-sighted test",
  short_sighted_right_result: "Optional — short-sighted right eye",
  short_sighted_left_result: "Optional — short-sighted left eye",
  short_sighted_both_eyes_result: "Optional — short-sighted both eyes",
  short_sighted_notes: "Optional — short-sighted notes",
  additional_notes: "Completion — additional notes"
};

/** The 3 fields with a real, step-scoped PromptStep id in the active language pack (see lib/languagePacks.ts) — coverage for every other field is derived from the record-level has_unvisited_prompts/recording_status flags instead. */
const REAL_PACK_STEP_ID: Partial<Record<keyof ManualExtractedFields, string>> = {
  right_eye_distance_result: "right-distance",
  left_eye_distance_result: "left-distance",
  glasses_selected: "glasses-check"
};

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

export const AUDIT_FIELD_KEYS: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "both_eyes_line",
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

/**
 * 1-based index of the transcript sentence containing this field's evidence
 * quote — "" when there is no evidence, or when the quote cannot be located
 * (never fabricated). Uses the same transcript the extraction read from.
 */
function transcriptLineNumber(record: TestRecord, evidence: string | undefined): number | "" {
  if (!evidence?.trim()) return "";
  const source = record.corrected_transcript_text.trim() || record.english_processing_transcript.trim() || record.raw_transcript_text.trim();
  if (!source) return "";
  const sentences = source.split(/(?<=[.?!])\s+/);
  const needle = evidence.trim().toLowerCase();
  const index = sentences.findIndex((sentence) => sentence.toLowerCase().includes(needle));
  return index === -1 ? "" : index + 1;
}

/**
 * Evidence-quote policy (never fabricate evidence): the extraction's own
 * quote when there is one — a reviewed manual correction keeps the ORIGINAL
 * quote so the audit trail survives the edit; the literal "No transcript
 * evidence" for a manual value that never had any; empty for fields with
 * nothing to cite (missing / not tested / never mentioned).
 */
function evidenceQuote(info: FieldExportInfo): string {
  if (info.meta?.evidence?.trim()) return info.meta.evidence;
  if (info.meta?.source === "manual" && info.meta.value.trim()) return "No transcript evidence";
  return "";
}

/** The original extracted value / reviewed value / reviewer action triple — populated only when the tester actually changed this field during review. */
function reviewTrail(record: TestRecord, key: keyof ManualExtractedFields): { original: string; reviewed: string; action: string } {
  const originalMeta = record.extracted_json.field_confidence?.[key];
  const editedMeta = record.edited_extracted_json?.field_confidence?.[key];
  const originalValue = (originalMeta?.value ?? "").trim();
  const editedValue = (editedMeta?.value ?? "").trim();
  if (record.edited_extracted_json && editedMeta && editedValue !== originalValue) {
    return { original: originalValue || "Missing", reviewed: editedValue, action: "corrected_value" };
  }
  if (record.qc_status === "Approved") return { original: "", reviewed: "", action: "confirmed" };
  return { original: "", reviewed: "", action: "" };
}

function auditRowsForRecord(record: TestRecord): Array<Array<string | number | boolean>> {
  const needsQc = recordNeedsQc(record);
  const { reviewedAt } = reviewerStamp(record);
  return AUDIT_FIELD_KEYS.map((key) => {
    const info = fieldExportInfo(record, key);
    const coverage = promptCoverage(record, key);
    const trail = reviewTrail(record, key);
    return [
      `${record.id}:${key}`,
      record.id,
      record.client_id,
      FIELD_GROUPS[key],
      key,
      FIELD_DISPLAY_LABELS[key],
      info.value,
      info.status,
      info.source,
      info.meta ? CONFIDENCE_NUMERIC[info.meta.confidence] : 0,
      evidenceQuote(info),
      transcriptLineNumber(record, info.meta?.evidence),
      PROMPT_STEP_LABELS[key],
      PROMPT_LABELS[key],
      info.meta?.source === "manual",
      trail.original,
      trail.reviewed,
      trail.action,
      info.meta?.requiresReview ?? false,
      fieldQcReason(record, key),
      reviewedAt,
      !needsQc,
      coverage.viewed,
      coverage.recorded,
      record.demo_record,
      record.demo_dataset_version
    ];
  });
}

/** Full Audit Longlist — one row per (record, field). Runs the personal-field guard on every build. */
export function buildFullAuditLonglist(records: TestRecord[]): LonglistTable {
  assertNoPersonalFields(AUDIT_CSV_COLUMNS);
  return { columns: AUDIT_CSV_COLUMNS, rows: records.flatMap(auditRowsForRecord) };
}

export function recordsToAuditCsv(records: TestRecord[]) {
  const table = buildFullAuditLonglist(records);
  return [table.columns as readonly unknown[], ...table.rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
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
