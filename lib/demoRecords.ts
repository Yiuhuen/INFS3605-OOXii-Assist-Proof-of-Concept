import { REQUIRED_EXTRACTED_FIELDS } from "./types";
import type {
  ClientRecord,
  ExtractedFields,
  ExtractionSource,
  FieldConfidence,
  FieldConfidenceLevel,
  FieldConfidenceMap,
  LanguageCode,
  ManualExtractedFields,
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
 * Synthetic demo dataset — never real client data.
 * ---------------------------------------------------------------------------
 * 12 deterministic, fully-synthetic TestRecords used to make Insights/QC/
 * Export look like a working proof-of-concept instead of an empty shell.
 * Every value here is invented for demonstration: anonymous client IDs only
 * (C-101A..C-112M), no name/DOB/phone/address/GPS anywhere (those fields do
 * not exist on TestRecord/ClientRecord at all — see lib/types.ts). Every
 * record is tagged demo_record: true + demo_dataset_version so it can be
 * safely appended/cleared without ever touching a real tester's saved
 * records (see appendDemoRecords/clearDemoRecordsOnly in lib/storage.ts).
 *
 * Field-level values are authored directly (not run through
 * extractFieldsFromTranscript) so every record's QC outcome is deterministic
 * and reviewable by eye, but every value is chosen to be exactly what the
 * REAL lib/qc.ts predicates (recordNeedsQc, qcReviewIssues) would compute
 * from it — see the per-record comments below for which QC signal each
 * record is designed to exercise.
 *
 * Language packs: only the app's 3 real LanguageCodes (en/tpi/bis) are ever
 * used functionally (translation-safety/extraction/speech-recognition all
 * key off this exact union). A handful of records set `languagePackLabel`
 * purely as a cosmetic display-name override (e.g. "Cantonese", "Arabic",
 * "Bahasa Indonesia") for outreach-language variety in the CSV/UI — the
 * underlying `language` field driving real app logic always stays a genuine
 * supported code. See TestRecord.language_pack_label in lib/types.ts.
 * ---------------------------------------------------------------------------
 */

export const DEMO_DATASET_VERSION = "2026-07-ooxii-demo-v1";

const CREATED_AT = [
  "2026-07-27T09:00:00",
  "2026-07-27T09:12:00",
  "2026-07-27T09:24:00",
  "2026-07-27T09:36:00",
  "2026-07-27T09:48:00",
  "2026-07-27T10:00:00",
  "2026-07-27T10:12:00",
  "2026-07-27T10:24:00",
  "2026-07-27T10:36:00",
  "2026-07-27T10:48:00",
  "2026-07-27T11:00:00",
  "2026-07-27T11:12:00"
];

function field(
  value: string,
  source: FieldConfidence["source"],
  confidence: FieldConfidenceLevel,
  opts: Partial<Pick<FieldConfidence, "requiresReview" | "evidence" | "reason" | "stepId">> = {}
): FieldConfidence {
  return { value, source, confidence, requiresReview: opts.requiresReview ?? false, evidence: opts.evidence, reason: opts.reason, stepId: opts.stepId };
}

const EMPTY_NOTE = field("", "unknown", "unknown");

interface ClinicalFields {
  current_glasses: FieldConfidence;
  cataract_history_confirmed: FieldConfidence;
  right_eye_distance_result: FieldConfidence;
  left_eye_distance_result: FieldConfidence;
  final_readable_line: FieldConfidence;
  comfort_response: FieldConfidence;
  glasses_selected: FieldConfidence;
  additional_notes?: FieldConfidence;
}

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
    final_readable_line: get("final_readable_line"),
    glasses_selected: get("glasses_selected"),
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

/** Full swipe-through of all 4 prompt cards, all captured live — the "everything went fine" marker set most demo records use. */
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

/** Partial swipe-through — used only by C-107G (record 7) to model "some prompts viewed but not recorded": only intro + right-distance were ever opened. */
function partialMarkerSet(recordIndex: number, language: LanguageCode, createdAt: string): PromptMarker[] {
  const actions: PromptMarker["navigationAction"][] = ["start", "next"];
  return PACK_STEPS.slice(0, 2).map((step, i) => ({
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
}

function segment(id: string, stepId: string, language: LanguageCode, text: string, createdAt: string, offsetMs: number, confidence?: number): TranscriptSegment {
  return { id, timestamp: new Date(Date.parse(createdAt) + offsetMs).toISOString(), language, text, isFinal: true, confidence, stepId };
}

function clientSnapshot(id: string, ageBand: string, gender: string, cataract: "yes" | "no" | "unknown", site: string, glasses: "yes" | "no" | "unknown", createdAt: string): ClientRecord {
  return { id, age_band: ageBand, gender, cataract_history: cataract, location_site: site, currently_has_glasses: glasses, tester_note: "", created_at: createdAt };
}

interface RecordSpec {
  index: number;
  clientId: string;
  testerLabel: string;
  /** Human-readable outreach session/cohort label — distinct from deploymentSite (the physical site). */
  outreachSession: string;
  /** Physical site name — distinct from outreachSession (the session/cohort label). */
  deploymentSite: string;
  language: LanguageCode;
  /** Cosmetic display-name override for the language_pack CSV/UI column (see TestRecord.language_pack_label doc comment) — undefined means "use the real language code's own display name". */
  languagePackLabel?: string;
  recordingStatus: RecordingStatus;
  extractionSource: ExtractionSource;
  syncStatus: SyncStatus;
  qcStatus: QCStatus;
  hasUnvisitedPrompts: boolean;
  hasUnrecordedViewedPrompts: boolean;
  editedByUser: boolean;
  demoHelperUsed: boolean;
  transcriptQualityRisk: "low" | "medium" | "high";
  extractionSafetyStatus: "safe" | "draft_review_required";
  rerecordUsed: boolean;
  recordingAttemptNumber: number;
  manualOverrideReason: string;
  requiresQcVerification?: boolean;
  rawTranscriptText: string;
  fields: ClinicalFields;
  confidenceScore: number;
  ageBand: string;
  gender: string;
  qcNotes: string;
  editedGlassesValue?: string;
}

function needsQcFor(spec: RecordSpec, missingCount: number): boolean {
  // Mirrors lib/qc.ts recordNeedsQc's real (corrected) predicate so
  // `needs_qc` (the stored field, one more OR input to that function) stays
  // internally consistent with every other flag on the record — see the
  // per-record walkthrough comments below the SPECS array. A genuine sync
  // FAILURE is the only sync state that keeps an Approved record flagged;
  // Synced/Local only/Pending sync are all "done, just a matter of timing".
  if (spec.qcStatus === "Approved" && spec.syncStatus !== "Failed") return false;
  return (
    spec.editedByUser ||
    spec.confidenceScore < 0.7 ||
    missingCount > 0 ||
    spec.recordingStatus !== "recorded" ||
    spec.hasUnvisitedPrompts ||
    spec.hasUnrecordedViewedPrompts ||
    spec.qcStatus === "Unreviewed" ||
    spec.syncStatus === "Pending sync" ||
    spec.syncStatus === "Failed" ||
    spec.transcriptQualityRisk !== "low" ||
    spec.extractionSafetyStatus === "draft_review_required" ||
    spec.demoHelperUsed
  );
}

function processingStatusFor(spec: RecordSpec, needsQc: boolean): ProcessingStatus {
  if (needsQc && spec.qcStatus !== "Approved") return "needs_qc";
  if (spec.syncStatus === "Synced") return "processed_after_sync";
  return "ready_for_review";
}

function buildRecord(spec: RecordSpec): TestRecord {
  const createdAt = CREATED_AT[spec.index];
  const id = `R-${String(spec.index + 1).padStart(3, "0")}`;
  const extracted = buildExtracted(spec.fields, spec.confidenceScore);
  // Manual override (C-105E) never went through the swipe-card flow at all —
  // no prompt markers were ever logged, which is what correctly makes the
  // right/left/glasses-check fields derive "not viewed, not recorded" for
  // the audit CSV below, honestly reflecting that the continuous-recording
  // path was bypassed entirely rather than partially captured.
  const promptMarkers =
    spec.recordingStatus === "manual_override"
      ? []
      : spec.hasUnvisitedPrompts
        ? partialMarkerSet(spec.index, spec.language, createdAt)
        : fullMarkerSet(spec.index, spec.language, createdAt);

  const segments: TranscriptSegment[] = [];
  if (spec.recordingStatus === "recorded") {
    segments.push(segment(`SEG-DEMO-${spec.index}-0`, "intro", spec.language, spec.rawTranscriptText.split(". ")[0] ?? "", createdAt, 0));
    segments.push(segment(`SEG-DEMO-${spec.index}-1`, "right-distance", spec.language, "Right eye result captured.", createdAt, 30000));
    if (!spec.hasUnvisitedPrompts) {
      segments.push(segment(`SEG-DEMO-${spec.index}-2`, "left-distance", spec.language, "Left eye result captured.", createdAt, 60000));
      segments.push(segment(`SEG-DEMO-${spec.index}-3`, "glasses-check", spec.language, "Glasses check discussed.", createdAt, 90000));
    }
  }

  let editedExtracted: ExtractedFields | null = null;
  if (spec.editedByUser && spec.editedGlassesValue) {
    const editedFieldConfidence: FieldConfidenceMap = {
      ...extracted.field_confidence,
      glasses_selected: field(spec.editedGlassesValue, "manual", "high", { requiresReview: false })
    };
    editedExtracted = {
      ...extracted,
      glasses_selected: spec.editedGlassesValue,
      missing_fields: extracted.missing_fields.filter((f) => f !== "glasses_selected"),
      field_confidence: editedFieldConfidence
    };
  }

  // Mirrors app/page.tsx's real updateQcRecord: once a field has been
  // edited, the record's top-level missing_fields (and therefore
  // hasMissingFields/fieldGaps) reflect the EFFECTIVE (edited) fields, not
  // the original draft extraction — otherwise an edited-and-fixed field
  // would still count as "missing" everywhere else in the app.
  const effectiveMissingFields = (editedExtracted ?? extracted).missing_fields;
  const needsQc = needsQcFor(spec, effectiveMissingFields.length);
  const processingStatus = processingStatusFor(spec, needsQc);
  const recordingDuration = spec.recordingStatus === "manual_override" ? 0 : 150 + spec.index * 8;
  const recordingStartedAt = spec.recordingStatus === "manual_override" ? "" : createdAt;
  const recordingStoppedAt =
    spec.recordingStatus === "manual_override" ? "" : new Date(Date.parse(createdAt) + recordingDuration * 1000).toISOString();
  const connectionStatus: "online" | "offline" = spec.syncStatus === "Synced" ? "online" : "offline";

  return {
    id,
    session_id: id,
    client_id: spec.clientId,
    tester_id: spec.testerLabel,
    deployment_site: spec.deploymentSite,
    outreach_session: spec.outreachSession,
    language: spec.language,
    status: needsQc ? "Needs QC" : "Complete",
    sync_status: spec.syncStatus,
    connection_status: connectionStatus,
    audio_local_url: "",
    recording_status: spec.recordingStatus,
    recording_started_at: recordingStartedAt,
    recording_stopped_at: recordingStoppedAt,
    recording_duration_seconds: recordingDuration,
    manual_override_reason: spec.manualOverrideReason,
    raw_transcript_text: spec.rawTranscriptText,
    raw_transcript_language: spec.language,
    english_processing_transcript: spec.rawTranscriptText,
    transcript_segments: segments,
    prompt_markers: promptMarkers,
    has_unvisited_prompts: spec.hasUnvisitedPrompts,
    has_unrecorded_viewed_prompts: spec.hasUnrecordedViewedPrompts,
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
    transcript_quality_flags:
      spec.transcriptQualityRisk === "low"
        ? []
        : [
            {
              id: `FLAG-DEMO-${spec.index}`,
              severity: "warning",
              type: "low_confidence",
              originalText: "maybe line five",
              reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio.",
              stepId: "right-distance"
            }
          ],
    suggested_corrections: [],
    corrections_applied: [],
    unresolved_transcript_flag_ids: spec.transcriptQualityRisk === "low" ? [] : [`FLAG-DEMO-${spec.index}`],
    translation_review_required: false,
    extraction_safety_status: spec.extractionSafetyStatus,
    fields_reviewed_by_tester: spec.qcStatus === "Approved",
    demo_helper_used: spec.demoHelperUsed,
    recording_attempt_number: spec.recordingAttemptNumber,
    rerecord_used: spec.rerecordUsed,
    demo_record: true,
    demo_dataset_version: DEMO_DATASET_VERSION,
    language_pack_label: spec.languagePackLabel ?? "",
    client_snapshot: clientSnapshot(
      spec.clientId,
      spec.ageBand,
      spec.gender,
      spec.fields.cataract_history_confirmed.value === "Yes" ? "yes" : spec.fields.cataract_history_confirmed.value === "No" ? "no" : "unknown",
      spec.deploymentSite,
      spec.fields.current_glasses.value === "Yes" ? "yes" : spec.fields.current_glasses.value === "No" ? "no" : "unknown",
      createdAt
    ),
    created_at: createdAt,
    updated_at: createdAt
  };
}

const SESSION_A = "Outreach Session A";
const SESSION_B = "Outreach Session B";
const SITE_A = "Site A";
const SITE_B = "Site B";

const SPECS: RecordSpec[] = [
  // 1 — C-101A: clean, fully captured, approved, synced. Baseline "everything worked" record.
  {
    index: 0,
    clientId: "C-101A",
    testerLabel: "Tester 01",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses and wears them for reading. She has no history of cataracts. The right eye can read line five. The left eye can read line four. The final readable line she is comfortable with is line four. She feels comfortable overall. We fitted her with plus one point zero zero reading glasses and she says they feel clear.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      final_readable_line: field("Line 4", "corrected_transcript", "high", { evidence: "final readable line she is comfortable with is line four" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable overall" }),
      glasses_selected: field("+1.00 reading glasses", "corrected_transcript", "medium", { evidence: "fitted her with plus one point zero zero reading glasses", stepId: "glasses-check" }),
      additional_notes: field("Difficulty reading small writing in evening", "manual", "high")
    },
    confidenceScore: 0.94,
    ageBand: "45–54",
    gender: "female",
    qcNotes: ""
  },
  // 2 — C-102B: clean, no glasses needed, approved, synced.
  {
    index: 1,
    clientId: "C-102B",
    testerLabel: "Tester 01",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "tpi",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client does not currently have glasses. No history of cataracts. The right eye can read line six. The left eye can read line six. The final readable line is line six. The client feels comfortable. No glasses were dispensed today.",
    fields: {
      current_glasses: field("No", "corrected_transcript", "high", { evidence: "does not currently have glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "right eye can read line six", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "left eye can read line six", stepId: "left-distance" }),
      final_readable_line: field("Line 6", "corrected_transcript", "high", { evidence: "final readable line is line six" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("No glasses dispensed", "corrected_transcript", "medium", { evidence: "no glasses were dispensed today", stepId: "glasses-check" })
    },
    confidenceScore: 0.91,
    ageBand: "25–34",
    gender: "male",
    qcNotes: ""
  },
  // 3 — C-103C: cataract history never captured — high-risk field missing, unreviewed. Language pack shown as "Bahasa Indonesia" (cosmetic label over the real "bis" code).
  {
    index: 2,
    clientId: "C-103C",
    testerLabel: "Tester 02",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "bis",
    languagePackLabel: "Bahasa Indonesia",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. The right eye can read line four. The left eye can read line four. The final readable line is line four. The client feels comfortable. We fitted plus one point five zero reading glasses.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Not captured from transcript — enter manually or send to QC."
      }),
      right_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "right eye can read line four", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      final_readable_line: field("Line 4", "corrected_transcript", "high", { evidence: "final readable line is line four" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+1.50 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus one point five zero reading glasses", stepId: "glasses-check" })
    },
    confidenceScore: 0.78,
    ageBand: "55–64",
    gender: "female",
    qcNotes: ""
  },
  // 4 — C-104D: glasses selected/dispensed never captured — high-risk field missing, unreviewed.
  {
    index: 3,
    clientId: "C-104D",
    testerLabel: "Tester 02",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line five. The left eye can read line five. The final readable line is line five. The client feels comfortable, but did not clearly confirm which glasses were selected.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      final_readable_line: field("Line 5", "corrected_transcript", "high", { evidence: "final readable line is line five" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Not captured from transcript — enter manually or send to QC."
      }),
      additional_notes: field("Client did not clearly confirm selected glasses", "manual", "high")
    },
    confidenceScore: 0.81,
    ageBand: "65+",
    gender: "male",
    qcNotes: ""
  },
  // 5 — C-105E: manual recording override after a microphone failure; comfort response entered as unclear. Language pack shown as "Cantonese" (cosmetic label).
  {
    index: 4,
    clientId: "C-105E",
    testerLabel: "Tester 03",
    outreachSession: SESSION_B,
    deploymentSite: SITE_B,
    language: "bis",
    languagePackLabel: "Cantonese",
    recordingStatus: "manual_override",
    extractionSource: "manual_override",
    syncStatus: "Local only",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "draft_review_required",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "Microphone failed to capture audio; tester entered notes manually immediately after the session.",
    rawTranscriptText:
      "Manual entry — no continuous recording available. Client does not have glasses. No history of cataracts. Right eye read line four. Left eye read line three. Final readable line three. Glasses feel okay but maybe a little blurry. Fitted plus two point zero zero reading glasses.",
    fields: {
      current_glasses: field("No", "manual", "high", { evidence: "does not have glasses" }),
      cataract_history_confirmed: field("No", "manual", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 4", "manual", "high", { evidence: "right eye read line four" }),
      left_eye_distance_result: field("Line 3", "manual", "high", { evidence: "left eye read line three" }),
      final_readable_line: field("Line 3", "manual", "high", { evidence: "final readable line three" }),
      comfort_response: field("Unclear", "manual", "low", {
        requiresReview: true,
        evidence: "glasses feel okay but maybe a little blurry",
        reason: "Tester noted an unclear comfort response — verify with the client before relying on this value."
      }),
      glasses_selected: field("+2.00 reading glasses", "manual", "medium", { evidence: "fitted plus two point zero zero reading glasses" }),
      additional_notes: field("Manual transcript entered after microphone issue", "manual", "high")
    },
    confidenceScore: 0.62,
    ageBand: "35–44",
    gender: "female",
    qcNotes: ""
  },
  // 6 — C-106F: real recording, but transcript evidence is hedged/uncertain throughout — low-confidence fields, comfort explicitly Unclear. Language pack shown as "Arabic" (cosmetic label).
  {
    index: 5,
    clientId: "C-106F",
    testerLabel: "Tester 01",
    outreachSession: SESSION_B,
    deploymentSite: SITE_B,
    language: "tpi",
    languagePackLabel: "Arabic",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "medium",
    extractionSafetyStatus: "draft_review_required",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "right eye maybe line five... left maybe line four... glasses maybe comfortable. has glasses already I think. no cataracts I believe. fitted with reading glasses.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "medium", { evidence: "has glasses already I think", requiresReview: true, reason: "Hedged phrasing — verify against the audio." }),
      cataract_history_confirmed: field("No", "corrected_transcript", "medium", { evidence: "no cataracts I believe", requiresReview: true, reason: "Hedged phrasing — verify against the audio." }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "low", {
        evidence: "right eye maybe line five",
        stepId: "right-distance",
        requiresReview: true,
        reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio."
      }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "low", {
        evidence: "left maybe line four",
        stepId: "left-distance",
        requiresReview: true,
        reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio."
      }),
      final_readable_line: field("Line 4", "corrected_transcript", "low", {
        evidence: "left maybe line four",
        requiresReview: true,
        reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio."
      }),
      comfort_response: field("Unclear", "corrected_transcript", "low", {
        evidence: "glasses maybe comfortable",
        requiresReview: true,
        reason: "Uncertain, hedged phrasing detected in the transcript — verify against the audio."
      }),
      glasses_selected: field("+1.00 reading glasses", "corrected_transcript", "medium", { evidence: "fitted with reading glasses", stepId: "glasses-check" })
    },
    confidenceScore: 0.58,
    ageBand: "45–54",
    gender: "male",
    qcNotes: ""
  },
  // 7 — C-107G: only intro + right-eye prompts were ever opened — prompt coverage incomplete, multiple fields never reached.
  {
    index: 6,
    clientId: "C-107G",
    testerLabel: "Tester 02",
    outreachSession: SESSION_B,
    deploymentSite: SITE_B,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: true,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line five. Session ended early before the left eye, comfort, and glasses-fitting steps were reached.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Left-eye step was not reached during recording."
      }),
      final_readable_line: field("", "unknown", "unknown", { requiresReview: true, reason: "Not captured from transcript — enter manually or send to QC." }),
      comfort_response: field("", "unknown", "unknown", { requiresReview: true, reason: "Comfort step was not reached during recording." }),
      glasses_selected: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Glasses-check step was not reached during recording."
      }),
      additional_notes: field("Session ended early — client needed to leave", "manual", "high")
    },
    confidenceScore: 0.49,
    ageBand: "25–34",
    gender: "female",
    qcNotes: ""
  },
  // 8 — C-108H: glasses selected was not captured by extraction (Unknown), then manually entered by the tester during review.
  {
    index: 7,
    clientId: "C-108H",
    testerLabel: "Tester 03",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Corrected",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: true,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    requiresQcVerification: true,
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line four. The left eye can read line four. The final readable line is line four. The client feels comfortable. Glasses were fitted but the specific lens power was not clearly stated on the recording.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "right eye can read line four", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      final_readable_line: field("Line 4", "corrected_transcript", "high", { evidence: "final readable line is line four" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("", "unknown", "unknown", {
        requiresReview: true,
        reason: "Selection mentioned but no specific lens power was stated — confirm which lens was dispensed."
      })
    },
    confidenceScore: 0.74,
    ageBand: "45–54",
    gender: "male",
    qcNotes: "",
    editedGlassesValue: "+1.00 reading glasses"
  },
  // 9 — C-109J: fully clean and approved, but saved while offline — pending sync (offline-first demonstration). qc_required is false: pending sync is a timing state, not a data-quality problem (see the recordNeedsQc fix in lib/qc.ts).
  {
    index: 8,
    clientId: "C-109J",
    testerLabel: "Tester 01",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "tpi",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Pending sync",
    qcStatus: "Approved",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line five. The left eye can read line five. The final readable line is line five. The client feels comfortable. We fitted plus one point two five reading glasses.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      final_readable_line: field("Line 5", "corrected_transcript", "high", { evidence: "final readable line is line five" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+1.25 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus one point two five reading glasses", stepId: "glasses-check" })
    },
    confidenceScore: 0.9,
    ageBand: "35–44",
    gender: "female",
    qcNotes: "Approved on-site; device was offline at end of session, will sync once back online."
  },
  // 10 — C-110K: first recording attempt was discarded and re-recorded — final saved attempt is clean. recording_mode displays as "rerecorded" (see recordingModeOf in lib/csv.ts).
  {
    index: 9,
    clientId: "C-110K",
    testerLabel: "Tester 02",
    outreachSession: SESSION_B,
    deploymentSite: SITE_B,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: true,
    recordingAttemptNumber: 2,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. No history of cataracts. The right eye can read line six. The left eye can read line five. The final readable line is line five. The client feels comfortable. We fitted plus zero point seven five reading glasses.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 6", "corrected_transcript", "high", { evidence: "right eye can read line six", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      final_readable_line: field("Line 5", "corrected_transcript", "high", { evidence: "final readable line is line five" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("+0.75 reading glasses", "corrected_transcript", "medium", { evidence: "fitted plus zero point seven five reading glasses", stepId: "glasses-check" })
    },
    confidenceScore: 0.88,
    ageBand: "55–64",
    gender: "male",
    qcNotes: "First attempt was inaudible; tester re-recorded once and the second attempt was clear."
  },
  // 11 — C-111L: missing cataract history AND glasses selected again — reinforces the training-pattern insight. Language pack shown as "Bahasa Indonesia" (cosmetic label).
  {
    index: 10,
    clientId: "C-111L",
    testerLabel: "Tester 03",
    outreachSession: SESSION_A,
    deploymentSite: SITE_A,
    language: "bis",
    languagePackLabel: "Bahasa Indonesia",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Unreviewed",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client already has glasses. The right eye can read line three. The left eye can read line four. The final readable line is line three. The client feels comfortable.",
    fields: {
      current_glasses: field("Yes", "corrected_transcript", "high", { evidence: "already has glasses" }),
      cataract_history_confirmed: field("", "unknown", "unknown", { requiresReview: true, reason: "Not captured from transcript — enter manually or send to QC." }),
      right_eye_distance_result: field("Line 3", "corrected_transcript", "high", { evidence: "right eye can read line three", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 4", "corrected_transcript", "high", { evidence: "left eye can read line four", stepId: "left-distance" }),
      final_readable_line: field("Line 3", "corrected_transcript", "high", { evidence: "final readable line is line three" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("", "unknown", "unknown", { requiresReview: true, reason: "Not captured from transcript — enter manually or send to QC." })
    },
    confidenceScore: 0.69,
    ageBand: "65+",
    gender: "female",
    qcNotes: ""
  },
  // 12 — C-112M: clean, fully captured, approved, synced.
  {
    index: 11,
    clientId: "C-112M",
    testerLabel: "Tester 01",
    outreachSession: SESSION_B,
    deploymentSite: SITE_B,
    language: "en",
    recordingStatus: "recorded",
    extractionSource: "corrected_transcript",
    syncStatus: "Synced",
    qcStatus: "Approved",
    hasUnvisitedPrompts: false,
    hasUnrecordedViewedPrompts: false,
    editedByUser: false,
    demoHelperUsed: false,
    transcriptQualityRisk: "low",
    extractionSafetyStatus: "safe",
    rerecordUsed: false,
    recordingAttemptNumber: 1,
    manualOverrideReason: "",
    rawTranscriptText:
      "The client does not have glasses. No history of cataracts. The right eye can read line five. The left eye can read line five. The final readable line is line five. The client feels comfortable. No glasses were dispensed today.",
    fields: {
      current_glasses: field("No", "corrected_transcript", "high", { evidence: "does not have glasses" }),
      cataract_history_confirmed: field("No", "corrected_transcript", "high", { evidence: "no history of cataracts" }),
      right_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "right eye can read line five", stepId: "right-distance" }),
      left_eye_distance_result: field("Line 5", "corrected_transcript", "high", { evidence: "left eye can read line five", stepId: "left-distance" }),
      final_readable_line: field("Line 5", "corrected_transcript", "high", { evidence: "final readable line is line five" }),
      comfort_response: field("Comfortable", "corrected_transcript", "high", { evidence: "feels comfortable" }),
      glasses_selected: field("No glasses dispensed", "corrected_transcript", "medium", { evidence: "no glasses were dispensed today", stepId: "glasses-check" })
    },
    confidenceScore: 0.92,
    ageBand: "25–34",
    gender: "male",
    qcNotes: ""
  }
];

/** Builds the 12 deterministic synthetic demo records. Pure — does not touch storage; see appendDemoRecords in lib/storage.ts for persistence. */
export function seedDemoRecords(): TestRecord[] {
  return SPECS.map(buildRecord);
}
