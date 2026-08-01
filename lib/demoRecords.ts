import { NOT_TESTED_FIELD_VALUE, REQUIRED_EXTRACTED_FIELDS } from "./types";
import type {
  ClientRecord,
  ExtractedFields,
  ExtractionSource,
  FieldConfidence,
  FieldConfidenceLevel,
  FieldConfidenceMap,
  LanguageCode,
  ManualExtractedFields,
  OperationalMeta,
  ProcessingStatus,
  PromptMarker,
  QCStatus,
  RecordingStatus,
  SyncStatus,
  TestRecord,
  TranscriptSegment
} from "./types";

/**
 * ---------------------------------------------------------------------------
 * Synthetic demo dataset v2 — never real client data.
 * ---------------------------------------------------------------------------
 * 6 deterministic, fully-synthetic TestRecords, one per presentation case:
 *
 *   R-001 C-811W  Case 1 — clean standard wheel/paddle capture, export ready.
 *   R-002 C-274K  Case 2 — astigmatism captured both eyes (toric + axis),
 *                          reviewed, export ready.
 *   R-003 C-352P  Case 3 — final readable line missing → QC required,
 *                          evidence exists for right/left only.
 *   R-004 C-489T  Case 4 — optional short-sighted test EXPLICITLY not
 *                          performed → "Not tested", no QC pressure; saved
 *                          offline → the one pending-sync record.
 *   R-005 C-560M  Case 5 — short-sighted test performed but left result
 *                          missing → QC required with a specific reason.
 *   R-006 C-638R  Case 6 — a transcript-extracted final line was unclear;
 *                          tester corrected it in Review → source becomes
 *                          reviewed_manual_entry, original evidence preserved.
 *
 * Rollup the Export screen shows for this dataset:
 *   6 records · 3 ready for export · 3 need review · 1 pending sync
 *
 * Every value is invented for demonstration: generated client IDs only
 * (C-811W…), tester labels only (never real names), region at city/state/
 * country level only — no name/DOB/phone/street address/GPS anywhere (those
 * fields do not exist on TestRecord/ClientRecord at all — see lib/types.ts).
 * Every record is tagged demo_record: true + demo_dataset_version so it can
 * be safely appended/cleared without ever touching a real tester's saved
 * records (see appendDemoRecords/clearDemoRecordsOnly in lib/storage.ts).
 *
 * Field-level values are authored directly (not run through
 * extractFieldsFromTranscript) so every record's QC outcome is deterministic
 * and reviewable by eye, but every value is chosen to be exactly what the
 * REAL lib/qc.ts predicates (recordNeedsQc, qcReviewIssues) would compute
 * from it — see the per-record comments below.
 * ---------------------------------------------------------------------------
 */

export const DEMO_DATASET_VERSION = "2026-08-ooxii-demo-v2";

const CREATED_AT = [
  "2026-07-29T09:00:00",
  "2026-07-29T09:15:00",
  "2026-07-29T09:30:00",
  "2026-07-29T09:45:00",
  "2026-07-29T10:00:00",
  "2026-07-29T10:15:00"
];

function field(
  value: string,
  source: FieldConfidence["source"],
  confidence: FieldConfidenceLevel,
  opts: Partial<Pick<FieldConfidence, "requiresReview" | "evidence" | "reason" | "stepId">> = {}
): FieldConfidence {
  return { value, source, confidence, requiresReview: opts.requiresReview ?? false, evidence: opts.evidence, reason: opts.reason, stepId: opts.stepId };
}

/** Optional module explicitly stated as not done (Case 4) — performed reads a captured "No" with evidence; every sub-field reads "Not tested" with requiresReview false. Mirrors lib/fieldExtraction.ts applyShortSightedOptionality. */
const SHORT_SIGHTED_EXPLICITLY_NOT_PERFORMED: Pick<
  ClinicalFields,
  "short_sighted_test_performed" | "short_sighted_right_result" | "short_sighted_left_result" | "short_sighted_both_eyes_result"
> = {
  short_sighted_test_performed: field("No", "corrected_transcript", "high", { evidence: "short-sighted test was not done today" }),
  short_sighted_right_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high"),
  short_sighted_left_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high"),
  short_sighted_both_eyes_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high")
};

/** Optional module never mentioned at all (the common case) — everything reads "Not tested", never Missing, never QC. Mirrors the extraction's default. */
const SHORT_SIGHTED_NOT_MENTIONED: Pick<
  ClinicalFields,
  "short_sighted_test_performed" | "short_sighted_right_result" | "short_sighted_left_result" | "short_sighted_both_eyes_result"
> = {
  short_sighted_test_performed: field(NOT_TESTED_FIELD_VALUE, "unknown", "high"),
  short_sighted_right_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high"),
  short_sighted_left_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high"),
  short_sighted_both_eyes_result: field(NOT_TESTED_FIELD_VALUE, "unknown", "high")
};

interface ClinicalFields {
  current_glasses: FieldConfidence;
  cataract_history_confirmed: FieldConfidence;
  right_eye_distance_result: FieldConfidence;
  left_eye_distance_result: FieldConfidence;
  both_eyes_line?: FieldConfidence;
  final_readable_line: FieldConfidence;
  comfort_response: FieldConfidence;
  glasses_selected: FieldConfidence;
  right_lens_selected?: FieldConfidence;
  left_lens_selected?: FieldConfidence;
  right_astigmatism_present?: FieldConfidence;
  right_toric_power?: FieldConfidence;
  right_toric_axis?: FieldConfidence;
  left_astigmatism_present?: FieldConfidence;
  left_toric_power?: FieldConfidence;
  left_toric_axis?: FieldConfidence;
  short_sighted_test_performed?: FieldConfidence;
  short_sighted_right_result?: FieldConfidence;
  short_sighted_left_result?: FieldConfidence;
  short_sighted_both_eyes_result?: FieldConfidence;
  short_sighted_notes?: FieldConfidence;
  additional_notes?: FieldConfidence;
}

const EMPTY_NOTE = field("", "unknown", "unknown");

function buildExtracted(fields: ClinicalFields, confidenceScore: number): ExtractedFields {
  const fieldConfidence: FieldConfidenceMap = { ...fields, additional_notes: fields.additional_notes ?? EMPTY_NOTE };
  const get = (key: keyof ManualExtractedFields) => fieldConfidence[key]?.value ?? "";
  const missing_fields = REQUIRED_EXTRACTED_FIELDS.filter((key) => !get(key as keyof ManualExtractedFields).trim());
  return {
    comfort_response: get("comfort_response"),
    cataract_history_confirmed: get("cataract_history_confirmed"),
    current_glasses: get("current_glasses"),
    right_eye_distance_result: get("right_eye_distance_result"),
    left_eye_distance_result: get("left_eye_distance_result"),
    both_eyes_line: get("both_eyes_line"),
    final_readable_line: get("final_readable_line"),
    glasses_selected: get("glasses_selected"),
    right_lens_selected: get("right_lens_selected"),
    left_lens_selected: get("left_lens_selected"),
    right_astigmatism_present: get("right_astigmatism_present"),
    right_toric_power: get("right_toric_power"),
    right_toric_axis: get("right_toric_axis"),
    left_astigmatism_present: get("left_astigmatism_present"),
    left_toric_power: get("left_toric_power"),
    left_toric_axis: get("left_toric_axis"),
    short_sighted_test_performed: get("short_sighted_test_performed"),
    short_sighted_right_result: get("short_sighted_right_result"),
    short_sighted_left_result: get("short_sighted_left_result"),
    short_sighted_both_eyes_result: get("short_sighted_both_eyes_result"),
    short_sighted_notes: get("short_sighted_notes"),
    additional_notes: get("additional_notes"),
    missing_fields,
    confidence_score: confidenceScore,
    field_confidence: fieldConfidence
  };
}

const PACK_STEPS: Array<{ id: string; index: number; promptText: string }> = [
  { id: "intro", index: 0, promptText: "We will do a simple vision check. Please answer in the language you are comfortable with." },
  { id: "right-distance", index: 1, promptText: "Cover your left eye. Read the smallest line you can see clearly." },
  { id: "left-distance", index: 2, promptText: "Cover your right eye. Read the smallest line you can see clearly." },
  { id: "glasses-check", index: 3, promptText: "Do you currently have glasses? After trying these, tell me if your vision feels clearer and comfortable." }
];

/** Full swipe-through of all 4 prompt cards, all captured live — every demo record completed the fixed clinical sequence (the sequence itself is never changed by demo data). */
function fullMarkerSet(recordIndex: number, language: LanguageCode, createdAt: string): PromptMarker[] {
  const actions: PromptMarker["navigationAction"][] = ["start", "next", "next", "next"];
  const markers = PACK_STEPS.map((step, i) => ({
    id: `MRK-DEMO-${recordIndex}-${i}`,
    stepId: step.id,
    stepIndex: step.index,
    timestamp: Date.parse(createdAt) + i * 1000,
    promptText: step.promptText,
    language,
    navigationAction: actions[i],
    capturedDuringRecording: true,
    createdAt
  }));
  const last = PACK_STEPS[PACK_STEPS.length - 1];
  markers.push({
    id: `MRK-DEMO-${recordIndex}-finish`,
    stepId: last.id,
    stepIndex: last.index,
    timestamp: Date.parse(createdAt) + PACK_STEPS.length * 1000,
    promptText: last.promptText,
    language,
    navigationAction: "finish",
    capturedDuringRecording: true,
    createdAt
  });
  return markers;
}

function segment(id: string, stepId: string, language: LanguageCode, text: string, createdAt: string, offsetMs: number, confidence?: number): TranscriptSegment {
  return { id, timestamp: new Date(Date.parse(createdAt) + offsetMs).toISOString(), language, text, isFinal: true, confidence, stepId };
}

/** Adds wall-clock minutes to a naive local "YYYY-MM-DDTHH:MM:SS" timestamp and formats it back the same way — keeps completed_at in the same local-naive convention as CREATED_AT/started_at, instead of a mixed-looking UTC "Z" string. */
function addMinutesLocal(naive: string, minutes: number): string {
  const date = new Date(naive);
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clientSnapshot(id: string, ageBand: string, gender: string, cataract: "yes" | "no" | "unknown", site: string, glasses: "yes" | "no" | "unknown", createdAt: string): ClientRecord {
  return { id, age_band: ageBand, gender, cataract_history: cataract, location_site: site, currently_has_glasses: glasses, tester_note: "", created_at: createdAt };
}

/** Region + clinic pairs — city/state/country level only, mirroring OOXii's regionSelection.selectedRegion. Never a street address or GPS coordinate. */
const REGION_LAE = { clinicId: "CL-LAE-01", site: "Site A", session: "Outreach Session A", country: "Papua New Guinea", state: "Morobe Province", city: "Lae" };
const REGION_PVL = { clinicId: "CL-PVL-02", site: "Site B", session: "Outreach Session B", country: "Vanuatu", state: "Shefa Province", city: "Port Vila" };

interface RegionSpec {
  clinicId: string;
  site: string;
  session: string;
  country: string;
  state: string;
  city: string;
}

interface FrameSpec {
  colour: string;
  size: string;
  type: string;
}

interface RecordSpec {
  index: number;
  clientId: string;
  testerLabel: string;
  region: RegionSpec;
  language: LanguageCode;
  /** Cosmetic display-name override for the language_pack CSV/UI column (see TestRecord.language_pack_label doc comment). */
  languagePackLabel?: string;
  recordingStatus: RecordingStatus;
  extractionSource: ExtractionSource;
  syncStatus: SyncStatus;
  qcStatus: QCStatus;
  editedByUser: boolean;
  transcriptQualityRisk: "low" | "medium" | "high";
  extractionSafetyStatus: "safe" | "draft_review_required";
  rerecordUsed: boolean;
  recordingAttemptNumber: number;
  requiresQcVerification?: boolean;
  rawTranscriptText: string;
  fields: ClinicalFields;
  confidenceScore: number;
  ageBand: string;
  gender: string;
  qcNotes: string;
  /** One Review-screen correction applied by the tester — the original extraction (and its evidence) stays preserved in extracted_json for the audit trail. */
  editedField?: { key: keyof ManualExtractedFields; value: string };
  /** Frame details when glasses were dispensed. */
  frames?: FrameSpec;
  checklist: [boolean, boolean, boolean, boolean];
  sessionComment: string;
}

function needsQcFor(spec: RecordSpec, missingCount: number): boolean {
  // Mirrors lib/qc.ts recordNeedsQc so `needs_qc` (the stored field, one
  // more OR input to that function) stays internally consistent with every
  // other flag on the record. A genuine sync FAILURE is the only sync state
  // that keeps an Approved record flagged; Synced/Local only/Pending sync
  // are all "done, just a matter of timing".
  if (spec.qcStatus === "Approved" && spec.syncStatus !== "Failed") return false;
  return (
    spec.editedByUser ||
    spec.confidenceScore < 0.7 ||
    missingCount > 0 ||
    spec.recordingStatus !== "recorded" ||
    spec.qcStatus === "Unreviewed" ||
    spec.syncStatus === "Pending sync" ||
    spec.syncStatus === "Failed" ||
    spec.transcriptQualityRisk !== "low" ||
    spec.extractionSafetyStatus === "draft_review_required"
  );
}

function processingStatusFor(spec: RecordSpec, needsQc: boolean): ProcessingStatus {
  if (needsQc && spec.qcStatus !== "Approved") return "needs_qc";
  if (spec.syncStatus === "Synced") return "processed_after_sync";
  return "ready_for_review";
}

function operationalMeta(spec: RecordSpec, createdAt: string, completedAt: string): OperationalMeta {
  const reviewed = spec.qcStatus === "Approved" || spec.qcStatus === "Corrected";
  return {
    clinic_id: spec.region.clinicId,
    session_number: spec.index + 1,
    active_test_module: "wheel_paddle",
    completed_at: completedAt,
    region_country: spec.region.country,
    region_state: spec.region.state,
    region_city: spec.region.city,
    frame_colour: spec.frames?.colour ?? "",
    frame_size: spec.frames?.size ?? "",
    frame_type: spec.frames?.type ?? "",
    checklist_results_card_completed: spec.checklist[0],
    checklist_care_instructions_given: spec.checklist[1],
    checklist_return_if_problem: spec.checklist[2],
    checklist_regular_eye_health_checks: spec.checklist[3],
    reviewed_by: reviewed ? spec.testerLabel : "",
    reviewed_at: reviewed ? completedAt : "",
    session_comment: spec.sessionComment
  };
}

function buildRecord(spec: RecordSpec): TestRecord {
  const createdAt = CREATED_AT[spec.index];
  const id = `R-${String(spec.index + 1).padStart(3, "0")}`;
  const extracted = buildExtracted(spec.fields, spec.confidenceScore);
  const promptMarkers = fullMarkerSet(spec.index, spec.language, createdAt);

  const segments: TranscriptSegment[] = [
    segment(`SEG-DEMO-${spec.index}-0`, "intro", spec.language, spec.rawTranscriptText.split(". ")[0] ?? "", createdAt, 0),
    segment(`SEG-DEMO-${spec.index}-1`, "right-distance", spec.language, "Right eye result captured.", createdAt, 30000),
    segment(`SEG-DEMO-${spec.index}-2`, "left-distance", spec.language, "Left eye result captured.", createdAt, 60000),
    segment(`SEG-DEMO-${spec.index}-3`, "glasses-check", spec.language, "Glasses check discussed.", createdAt, 90000)
  ];

  // A Review-screen correction: the edited copy carries the manual value but
  // PRESERVES the original extraction's evidence quote — that is exactly what
  // makes the audit export label it reviewed_manual_entry instead of
  // manual_fallback (see fieldSource handling in lib/csv.ts and
  // editExtractedField in app/page.tsx, whose behaviour this mirrors).
  let editedExtracted: ExtractedFields | null = null;
  if (spec.editedByUser && spec.editedField) {
    const { key, value } = spec.editedField;
    const originalMeta = extracted.field_confidence?.[key];
    const editedFieldConfidence: FieldConfidenceMap = {
      ...extracted.field_confidence,
      [key]: field(value, "manual", "high", { requiresReview: false, evidence: originalMeta?.evidence })
    };
    editedExtracted = {
      ...extracted,
      [key]: value,
      missing_fields: extracted.missing_fields.filter((f) => f !== key),
      field_confidence: editedFieldConfidence
    };
  }

  const effectiveMissingFields = (editedExtracted ?? extracted).missing_fields;
  const needsQc = needsQcFor(spec, effectiveMissingFields.length);
  const processingStatus = processingStatusFor(spec, needsQc);
  const recordingDuration = 150 + spec.index * 8;
  const recordingStoppedAt = addMinutesLocal(createdAt, Math.round(recordingDuration / 60));
  const completedAt = addMinutesLocal(createdAt, 12);
  const connectionStatus: "online" | "offline" = spec.syncStatus === "Synced" ? "online" : "offline";

  return {
    id,
    session_id: id,
    client_id: spec.clientId,
    tester_id: spec.testerLabel,
    deployment_site: spec.region.site,
    outreach_session: spec.region.session,
    language: spec.language,
    status: needsQc ? "Needs QC" : "Complete",
    sync_status: spec.syncStatus,
    connection_status: connectionStatus,
    audio_local_url: "",
    recording_status: spec.recordingStatus,
    recording_started_at: createdAt,
    recording_stopped_at: recordingStoppedAt,
    recording_duration_seconds: recordingDuration,
    manual_override_reason: "",
    raw_transcript_text: spec.rawTranscriptText,
    raw_transcript_language: spec.language,
    english_processing_transcript: spec.rawTranscriptText,
    transcript_segments: segments,
    prompt_markers: promptMarkers,
    has_unvisited_prompts: false,
    has_unrecorded_viewed_prompts: false,
    unclear_segments: [],
    corrected_transcript_text: spec.rawTranscriptText,
    extracted_json: extracted,
    edited_extracted_json: editedExtracted,
    extraction_source: spec.extractionSource,
    edited_by_user: spec.editedByUser,
    requires_qc_verification: spec.requiresQcVerification ?? false,
    confidence_score: spec.confidenceScore,
    missing_fields: effectiveMissingFields,
    qc_status: spec.qcStatus,
    needs_qc: needsQc,
    qc_notes: spec.qcNotes,
    processing_status: processingStatus,
    sync_attempts: spec.syncStatus === "Synced" ? 1 : 0,
    transcript_quality_risk: spec.transcriptQualityRisk,
    transcript_quality_flags: [],
    suggested_corrections: [],
    corrections_applied: [],
    unresolved_transcript_flag_ids: [],
    translation_review_required: false,
    extraction_safety_status: spec.extractionSafetyStatus,
    fields_reviewed_by_tester: spec.qcStatus === "Approved" || spec.qcStatus === "Corrected",
    demo_helper_used: false,
    recording_attempt_number: spec.recordingAttemptNumber,
    rerecord_used: spec.rerecordUsed,
    demo_record: true,
    demo_dataset_version: DEMO_DATASET_VERSION,
    language_pack_label: spec.languagePackLabel ?? "",
    operational: operationalMeta(spec, createdAt, completedAt),
    client_snapshot: clientSnapshot(
      spec.clientId,
      spec.ageBand,
      spec.gender,
      spec.fields.cataract_history_confirmed.value === "Yes" ? "yes" : spec.fields.cataract_history_confirmed.value === "No" ? "no" : "unknown",
      spec.region.site,
      spec.fields.current_glasses.value === "Yes" ? "yes" : spec.fields.current_glasses.value === "No" ? "no" : "unknown",
      createdAt
    ),
    created_at: createdAt,
    updated_at: completedAt
  };
}

const SPECS: RecordSpec[] = [
  // Case 1 — R-001 C-811W: clean standard wheel/paddle capture. Everything
  // captured (incl. per-eye lens split), no astigmatism, short-sighted module
  // never mentioned → "Not tested", QC not required, export ready.
  {
    index: 0,
    clientId: "C-811W",
    testerLabel: "Tester 01",
    region: REGION_LAE,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    editedByUser: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    rawTranscriptText:
      "The client already has glasses and wears them for reading. She has no history of cataracts. The right eye can read line five. The left eye can read line four. With both eyes she can read line five. The final readable line is line five. She feels comfortable overall. We fitted plus one point zero zero reading glasses. Right lens selected is plus one point zero zero. Left lens selected is plus one point five zero. No astigmatism in either eye.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      both_eyes_line: field("Line 5", "corrected_transcript", "high", { evidence: "with both eyes she can read line five" }),
      final_readable_line: field("Line 5", "corrected_transcript", "high", { evidence: "final readable line is line five" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable overall" }),
      glasses_selected: field("+1.00 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus one point zero zero reading glasses", stepId: "glasses-check" }),
      right_lens_selected: field("+1.00", "corrected_transcript", "medium", { evidence: "right lens selected is plus one point zero zero", stepId: "glasses-check" }),
      left_lens_selected: field("+1.50", "corrected_transcript", "medium", { evidence: "left lens selected is plus one point five zero", stepId: "glasses-check" }),
      right_astigmatism_present: field("No", "corrected_transcript", "high", { evidence: "no astigmatism in either eye" }),
      left_astigmatism_present: field("No", "corrected_transcript", "high", { evidence: "no astigmatism in either eye" }),
      ...SHORT_SIGHTED_NOT_MENTIONED,
      additional_notes: field("Difficulty reading small print in the evening", "manual", "high")
    },
    confidenceScore: 0.94,
    ageBand: "45–54",
    gender: "female",
    qcNotes: "",
    frames: { colour: "Black", size: "Medium", type: "Reading" },
    checklist: [true, true, true, true],
    sessionComment: "Routine reading correction; client left wearing the new glasses."
  },
  // Case 2 — R-002 C-274K: astigmatism captured for BOTH eyes with toric
  // power + axis, per-eye lens split present, all values reviewed → QC not
  // required, export ready. Second recording attempt (first was inaudible).
  {
    index: 1,
    clientId: "C-274K",
    testerLabel: "Tester 02",
    region: REGION_LAE,
    language: "tpi",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    editedByUser: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: true,
    recordingAttemptNumber: 2,
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line six. The left eye can read line five. With both eyes line six. The final readable line is line six. The client feels comfortable. We fitted distance glasses. Right lens selected is plus one point five zero. Left lens selected is plus one point two five. Right eye has astigmatism T2 axis ninety. Left eye toric one point five axis eighty five.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "right eye can read line six", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      both_eyes_line: field("Line 6", "corrected_transcript", "high", { evidence: "with both eyes line six" }),
      final_readable_line: field("Line 6", "corrected_transcript", "high", { evidence: "final readable line is line six" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("Distance glasses", "corrected_transcript", "medium", { evidence: "fitted distance glasses", stepId: "glasses-check" }),
      right_lens_selected: field("+1.50", "corrected_transcript", "medium", { evidence: "right lens selected is plus one point five zero", stepId: "glasses-check" }),
      left_lens_selected: field("+1.25", "corrected_transcript", "medium", { evidence: "left lens selected is plus one point two five", stepId: "glasses-check" }),
      right_astigmatism_present: field("Yes", "corrected_transcript", "high", { evidence: "right eye has astigmatism t2 axis ninety" }),
      right_toric_power: field("T2", "corrected_transcript", "high", { evidence: "astigmatism t2" }),
      right_toric_axis: field("90", "corrected_transcript", "high", { evidence: "axis ninety" }),
      left_astigmatism_present: field("Yes", "corrected_transcript", "high", { evidence: "left eye toric one point five axis eighty five" }),
      left_toric_power: field("T1.5", "corrected_transcript", "high", { evidence: "toric one point five" }),
      left_toric_axis: field("85", "corrected_transcript", "high", { evidence: "axis eighty five" }),
      ...SHORT_SIGHTED_NOT_MENTIONED
    },
    confidenceScore: 0.9,
    ageBand: "55–64",
    gender: "male",
    qcNotes: "First attempt was inaudible; tester re-recorded once and the second attempt was clear. Astigmatism values reviewed against the recording before approval.",
    frames: { colour: "Brown", size: "Medium", type: "Distance" },
    checklist: [true, true, true, true],
    sessionComment: "Both-eye astigmatism captured with toric power and axis; values reviewed before approval."
  },
  // Case 3 — R-003 C-352P: right and left eye lines captured with evidence,
  // but the FINAL readable line was never stated → Missing, QC required,
  // export not ready until reviewed.
  {
    index: 2,
    clientId: "C-352P",
    testerLabel: "Tester 01",
    region: REGION_PVL,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    editedByUser: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line four. The left eye can read line five. The client feels comfortable. We fitted plus one point two five reading glasses. The session moved on before the final readable line was read back.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "right eye can read line four", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      final_readable_line: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Not captured from transcript — enter manually or send to QC."
      }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+1.25 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus one point two five reading glasses", stepId: "glasses-check" }),
      ...SHORT_SIGHTED_NOT_MENTIONED,
      additional_notes: field("Final line was not read back before the client left", "manual", "high")
    },
    confidenceScore: 0.76,
    ageBand: "65+",
    gender: "female",
    qcNotes: "",
    frames: { colour: "Black", size: "Small", type: "Reading" },
    checklist: [true, true, true, false],
    sessionComment: "Final readable line missing — held for QC review before export."
  },
  // Case 4 — R-004 C-489T: optional short-sighted test EXPLICITLY not
  // performed → performed = "No" (a captured fact with evidence), sub-fields
  // "Not tested" — never Missing, never QC. Approved on-site while offline →
  // the one pending-sync record (a timing state, not a data-quality problem).
  {
    index: 3,
    clientId: "C-489T",
    testerLabel: "Tester 03",
    region: REGION_PVL,
    language: "bis",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Pending sync",
    qcStatus: "Approved",
    editedByUser: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    rawTranscriptText:
      "The client does not currently have glasses. No history of cataracts. The right eye can read line six. The left eye can read line six. With both eyes line six. The final readable line is line six. The client feels comfortable. No glasses were dispensed today. The short-sighted test was not done today.",
    fields: {
      current_glasses: field("No", "corrected_transcript", "high", { evidence: "does not currently have glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "right eye can read line six", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "left eye can read line six", stepId: "left-distance" }),
      both_eyes_line: field("Line 6", "corrected_transcript", "high", { evidence: "with both eyes line six" }),
      final_readable_line: field("Line 6", "corrected_transcript", "high", { evidence: "final readable line is line six" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("No glasses dispensed", "corrected_transcript", "medium", { evidence: "no glasses were dispensed today", stepId: "glasses-check" }),
      ...SHORT_SIGHTED_EXPLICITLY_NOT_PERFORMED
    },
    confidenceScore: 0.92,
    ageBand: "25–34",
    gender: "male",
    qcNotes: "Approved on-site; device was offline at end of session, will sync once back online.",
    checklist: [true, true, true, true],
    sessionComment: "Saved offline at the field site; short-sighted module explicitly skipped."
  },
  // Case 5 — R-005 C-560M: short-sighted test performed, right + both-eyes
  // results captured, LEFT result never captured → Missing with the exact
  // spec-worded reason, QC required. Also carries a manual note with no
  // transcript evidence (exported as source manual_fallback, evidence
  // "No transcript evidence" — never fabricated).
  {
    index: 4,
    clientId: "C-560M",
    testerLabel: "Tester 02",
    region: REGION_LAE,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    editedByUser: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line five. The left eye can read line four. The final readable line is line four. The client feels comfortable. We fitted plus two point zero zero reading glasses. Short-sighted test performed. Short-sighted right eye line four. Short-sighted both eyes line five.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      final_readable_line: field("Line 4", "corrected_transcript", "high", { evidence: "final readable line is line four" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+2.00 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus two point zero zero reading glasses", stepId: "glasses-check" }),
      short_sighted_test_performed: field("Yes", "corrected_transcript", "high", { evidence: "short-sighted test performed" }),
      short_sighted_right_result: field("Line 4", "corrected_transcript", "high", { evidence: "short-sighted right eye line four" }),
      // Left result never mentioned — the module WAS performed, so this is a
      // genuine Missing that requires review, with the exact spec-worded
      // reason lib/qc.ts surfaces verbatim (mirrors
      // applyShortSightedOptionality's real output).
      short_sighted_left_result: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Short-sighted test performed but left result missing."
      }),
      short_sighted_both_eyes_result: field("Line 5", "corrected_transcript", "high", { evidence: "short-sighted both eyes line five" }),
      additional_notes: field("Client asked to repeat the left-eye step; session ran short", "manual", "high")
    },
    confidenceScore: 0.84,
    ageBand: "35–44",
    gender: "female",
    qcNotes: "",
    frames: { colour: "Grey", size: "Large", type: "Reading" },
    checklist: [true, true, false, false],
    sessionComment: "Short-sighted module performed but incomplete — flagged for QC."
  },
  // Case 6 — R-006 C-638R: the transcript's final-line statement was unclear
  // and extraction drafted "Line 2" at low confidence; the tester corrected
  // it to "Line 3" on the Review screen. The edited copy is manual with the
  // ORIGINAL evidence preserved → audit source reviewed_manual_entry,
  // manually_edited true, original_extracted_value "Line 2" retained.
  // qc_status Corrected (not yet Approved) → still counted as needing review.
  {
    index: 5,
    clientId: "C-638R",
    testerLabel: "Tester 01",
    region: REGION_PVL,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Corrected",
    editedByUser: true,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    requiresQcVerification: true,
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line four. The left eye can read line three. The final line sounds like two, hard to hear. The client feels comfortable. We fitted plus one point five zero reading glasses.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "right eye can read line four", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 3", "corrected_transcript", "high", { evidence: "left eye can read line three", stepId: "left-distance" }),
      final_readable_line: field("Line 2", "corrected_transcript", "low", {
        requiresReview: true,
        evidence: "final line sounds like two, hard to hear",
        reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio."
      }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+1.50 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus one point five zero reading glasses", stepId: "glasses-check" }),
      ...SHORT_SIGHTED_NOT_MENTIONED
    },
    confidenceScore: 0.79,
    ageBand: "45–54",
    gender: "male",
    qcNotes: "Tester replayed the audio during review — the client read line three; extracted value corrected.",
    editedField: { key: "final_readable_line", value: "Line 3" },
    frames: { colour: "Black", size: "Medium", type: "Reading" },
    checklist: [true, true, true, false],
    sessionComment: "Transcript value corrected during review; original evidence preserved in the audit trail."
  }
];

/** Builds the 6 deterministic synthetic demo records (one per presentation case). Pure — does not touch storage; see appendDemoRecords in lib/storage.ts for persistence. */
export function seedDemoRecords(): TestRecord[] {
  return SPECS.map(buildRecord);
}
