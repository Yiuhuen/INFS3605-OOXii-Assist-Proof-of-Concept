export type LanguageCode = "en" | "tpi" | "bis";
/** "Local only" = Supabase isn't configured for this deployment, so the record will never leave this device by design — distinct from "Pending sync" (Supabase configured, sync hasn't happened yet) and never displayed or exported as "Synced". */
export type SyncStatus = "Pending sync" | "Synced" | "Failed" | "Local only";
export type TestStatus = "Draft" | "Complete" | "Needs QC";
export type QCStatus = "Unreviewed" | "In review" | "Corrected" | "Approved";
export type ExtractionSource = "raw_transcript" | "corrected_transcript" | "manual_override";
export type RecordingStatus = "recorded" | "failed" | "not_recorded" | "manual_override";
export type ConnectionMode = "browser" | "force-online" | "force-offline";

/**
 * Lifecycle of the local, offline-capable deterministic processing (translation
 * + field extraction) for a record — never a paid API call. See lib/qc.ts for
 * how this is derived and lib/fieldExtraction.ts for the cost-safe future-AI
 * design notes.
 *  - not_processed: no transcript content exists yet to work from.
 *  - ready_for_review: local mock processing produced usable fields, nothing flagged.
 *  - needs_qc: local mock flagged low confidence, missing fields, or a manual fallback.
 *  - processed_after_sync: record has synced; this is the point a future cost-safe
 *    batch AI pass (still optional, still not required to complete a test) would run.
 */
export type ProcessingStatus = "not_processed" | "ready_for_review" | "needs_qc" | "processed_after_sync";

export interface Tester {
  id: string;
  name: string;
  role: string;
  experience_level: "beginner" | "experienced" | "trainer";
  home_base: string;
  preferred_language: LanguageCode;
  instruction_mode: "beginner" | "concise";
  is_new_tester: boolean;
  /** True once the tester has completed setup (demo or Supabase). Informational — auth persistence itself lives in lib/auth.ts. */
  setup_completed: boolean;
  /** ISO timestamp of the tester's most recent setup/login or saved record — shown in Settings for accountability, never used for access control. */
  last_active_at: string;
}

export interface ClientRecord {
  id: string;
  age_band: string;
  gender: string;
  cataract_history: "yes" | "no" | "unknown";
  location_site: string;
  currently_has_glasses: "yes" | "no" | "unknown";
  tester_note: string;
  created_at: string;
}

export interface ExtractedFields {
  comfort_response: string;
  cataract_history_confirmed: string;
  current_glasses: string;
  right_eye_distance_result: string;
  left_eye_distance_result: string;
  final_readable_line: string;
  /** Overall glasses-fitting outcome (e.g. "+1.00 reading glasses", "No glasses dispensed") — kept as the single dispensed/selection summary field; right_lens_selected/left_lens_selected below carry the per-eye split. */
  glasses_selected: string;
  /** Right-eye lens power actually selected/dispensed, e.g. "+1.00" — captured separately from glasses_selected so right/left never blend into one generic value. */
  right_lens_selected: string;
  /** Left-eye lens power actually selected/dispensed, e.g. "+1.50". */
  left_lens_selected: string;
  /** "Yes" | "No" | "" (not captured) — whether astigmatism was mentioned for the right eye. Optional: absence never implies a clinical finding. */
  right_astigmatism_present: string;
  /** Toric/cylinder power for the right eye, e.g. "T2" or "-2.00" — only meaningful once right_astigmatism_present is "Yes". */
  right_toric_power: string;
  /** Astigmatism axis (degrees) for the right eye, e.g. "90". */
  right_toric_axis: string;
  left_astigmatism_present: string;
  left_toric_power: string;
  left_toric_axis: string;
  /** "Yes" | "No" | "" (never mentioned) — whether the optional short-sighted/distance module was performed at all. See NOT_TESTED_FIELD_VALUE below for how the sub-fields represent "not applicable". */
  short_sighted_test_performed: string;
  short_sighted_right_result: string;
  short_sighted_left_result: string;
  short_sighted_both_eyes_result: string;
  short_sighted_notes: string;
  additional_notes: string;
  missing_fields: string[];
  confidence_score: number;
  /** Per-field draft-quality metadata — see lib/fieldExtraction.ts extractFieldsFromTranscript. Optional/additive so existing readers of ExtractedFields keep working untouched. */
  field_confidence?: FieldConfidenceMap;
}

export const REQUIRED_EXTRACTED_FIELDS: Array<keyof ExtractedFields> = [
  "comfort_response",
  "cataract_history_confirmed",
  "current_glasses",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "glasses_selected"
];

/** Literal value stored for a required/populate field the local extraction (or manual entry) could not determine. Never a guess — see lib/fieldExtraction.ts. */
export const UNKNOWN_FIELD_VALUE = "UNKNOWN";

/**
 * Literal value for an optional field that was deliberately not applicable —
 * currently only the short-sighted/distance module's own fields, when
 * short_sighted_test_performed isn't "Yes". Distinct from UNKNOWN_FIELD_VALUE:
 * "Not tested" is never Missing and never forces QC on its own (see
 * lib/qc.ts, lib/fieldExtraction.ts).
 */
export const NOT_TESTED_FIELD_VALUE = "Not tested";

/**
 * Literal value for short_sighted_test_performed when the transcript is
 * genuinely ambiguous about whether the optional module was performed — at
 * least one of its result fields has real transcript evidence, yet nothing
 * ever explicitly said the test itself was performed. Distinct from both
 * NOT_TESTED_FIELD_VALUE (confidently not performed / never mentioned at
 * all, the overwhelming common case) and UNKNOWN_FIELD_VALUE (a required
 * field with no evidence at all): "Not captured" always requiresReview and
 * asks the tester to confirm, but never forces the still-empty result fields
 * to Missing on its own (see lib/fieldExtraction.ts applyShortSightedOptionality).
 */
export const NOT_CAPTURED_FIELD_VALUE = "Not captured";

export type ManualExtractedFields = Omit<ExtractedFields, "missing_fields" | "confidence_score" | "field_confidence">;

export function createEmptyManualFields(): ManualExtractedFields {
  return {
    comfort_response: "",
    cataract_history_confirmed: "",
    current_glasses: "",
    right_eye_distance_result: "",
    left_eye_distance_result: "",
    final_readable_line: "",
    glasses_selected: "",
    right_lens_selected: "",
    left_lens_selected: "",
    right_astigmatism_present: "",
    right_toric_power: "",
    right_toric_axis: "",
    left_astigmatism_present: "",
    left_toric_power: "",
    left_toric_axis: "",
    short_sighted_test_performed: "",
    short_sighted_right_result: "",
    short_sighted_left_result: "",
    short_sighted_both_eyes_result: "",
    short_sighted_notes: "",
    additional_notes: ""
  };
}

export function createEmptyExtractedFields(): ExtractedFields {
  return {
    ...createEmptyManualFields(),
    missing_fields: [...REQUIRED_EXTRACTED_FIELDS],
    confidence_score: 0
  };
}

export interface TestRecord {
  id: string;
  /** Same value as id — an explicit alias so a session can be referenced/linked without assuming id doubles as session_id. */
  session_id: string;
  client_id: string;
  tester_id: string;
  /** Mirrors client_snapshot.location_site at creation — a top-level convenience field for linking/reporting without unnesting client_snapshot. Distinct from outreach_session below: this is the physical site ("Site A"), not the session/cohort label. */
  deployment_site: string;
  /** Human-readable outreach session/cohort label (e.g. "Outreach Session A") — distinct from deployment_site (the physical site name). Empty for real records today; no session-tracking UI exists yet, only the reporting/export concept. */
  outreach_session: string;
  language: LanguageCode;
  status: TestStatus;
  sync_status: SyncStatus;
  connection_status: "online" | "offline";
  audio_local_url: string;
  recording_status: RecordingStatus;
  /** ISO timestamp when the continuous recording actually started (first successful Start). Empty if never recorded. */
  recording_started_at: string;
  /** ISO timestamp when the continuous recording was stopped. Empty if never stopped. */
  recording_stopped_at: string;
  /** Total recorded duration in seconds, across the whole continuous session (excludes paused time). */
  recording_duration_seconds: number;
  manual_override_reason: string;
  /** Immutable transcript as produced from audio/mock STT. Never edited after creation. */
  raw_transcript_text: string;
  /** Language the raw transcript was captured/downloaded in. */
  raw_transcript_language: LanguageCode;
  /** Mock-translated English version of the raw transcript, used for structured field extraction. */
  english_processing_transcript: string;
  /** Timestamped live-transcript segments captured during the continuous recording. */
  transcript_segments: TranscriptSegment[];
  /** Markers recorded each time the tester moved to a new prompt during the recording. */
  prompt_markers: PromptMarker[];
  /** True when one or more prompts in the active pack's fixed clinical sequence were never shown to the tester at all (no prompt_markers entry for that step, regardless of recording state) — the sequence itself was never reordered/skipped, but a QC reviewer should confirm the gap. Derived from prompt_markers vs. the pack at save time. */
  has_unvisited_prompts: boolean;
  /** True when one or more prompts WERE shown to the tester but never while continuous audio recording was active (e.g. the microphone failed, or recording was paused) — distinct from has_unvisited_prompts, since a prompt can be honestly viewed without ever being captured in audio. Derived from prompt_markers' capturedDuringRecording flags at save time. */
  has_unrecorded_viewed_prompts: boolean;
  /** Moments the tester flagged as unclear during recording — always require QC review. */
  unclear_segments: UnclearSegment[];
  /** Optional tester/QC edited transcript. Raw transcript is preserved separately. */
  corrected_transcript_text: string;
  /** Structured fields generated from the transcript. Not mutated by QC edits. */
  extracted_json: ExtractedFields;
  /** Tester/QC corrected fields. Null until someone edits an extracted field. */
  edited_extracted_json: ExtractedFields | null;
  extraction_source: ExtractionSource;
  edited_by_user: boolean;
  requires_qc_verification: boolean;
  confidence_score: number;
  missing_fields: string[];
  qc_status: QCStatus;
  needs_qc: boolean;
  /** Free-text notes a QC reviewer leaves on the record (separate from edited field values). */
  qc_notes: string;
  /** Local-mock processing lifecycle for this record. Never set by a paid API. */
  processing_status: ProcessingStatus;
  /** Number of times a sync to Supabase has been attempted (success or failure) for this record. */
  sync_attempts: number;
  /** Overall transcript-content risk from lib/transcriptQuality.ts, frozen at save time. */
  transcript_quality_risk: TranscriptQualityRisk;
  /** Full set of transcript-quality flags raised during review, frozen at save time. */
  transcript_quality_flags: TranscriptQualityFlag[];
  /** Suggest-only corrections offered during review, frozen at save time. */
  suggested_corrections: SuggestedCorrection[];
  /** Corrections the tester actually applied to the corrected transcript, with full history. */
  corrections_applied: CorrectionHistoryEntry[];
  /** IDs of transcript_quality_flags not covered by an applied correction — still requires QC attention. */
  unresolved_transcript_flag_ids: string[];
  /** True when the record's language is not English, so english_processing_transcript is an unverified processing copy rather than a validated translation. */
  translation_review_required: boolean;
  /** "draft_review_required" when extracted_json was built from a transcript that was unsafe to auto-extract from confidently. */
  extraction_safety_status: ExtractionSafetyStatus;
  /** True once the tester has explicitly confirmed "Fields reviewed" on the Review test screen. Draft-extracted fields that still require review keep the record in QC until this is set — see lib/qc.ts evaluateNeedsQc. */
  fields_reviewed_by_tester: boolean;
  /** True when the dev/demo-only "Insert sample transcript for demo" helper (see lib/demoHelpers.ts) was used on this record. Never set by real recording/STT — always forces QC review and is surfaced in the audit export. */
  demo_helper_used: boolean;
  /** How many recording attempts led to this saved record — starts at 1, +1 per confirmed Rerecord (see app/page.tsx resetRecordingAttempt). The discarded attempt(s) themselves are never stored. */
  recording_attempt_number: number;
  /** True if Rerecord was used at least once for this client before this record was saved. */
  rerecord_used: boolean;
  /** True only for records created by the synthetic demo-data seed (see lib/demoRecords.ts) — never set by real recording/STT. Lets "Clear synthetic demo data" remove exactly these records without touching real ones. */
  demo_record: boolean;
  /** Version tag of the synthetic demo dataset that produced this record (e.g. "2026-07-ooxii-demo-v1") — empty for real records. Lets re-seeding replace an older demo dataset instead of duplicating it. */
  demo_dataset_version: string;
  /** Cosmetic display-name override for the language_pack CSV/UI column — empty means "use LANGUAGE_LABELS[language]". Exists only so the synthetic demo dataset can show illustrative names (e.g. "Cantonese") for outreach variety without inventing a fake LanguageCode — the real `language` field above always stays a genuine supported code. */
  language_pack_label: string;
  client_snapshot: ClientRecord;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  language: LanguageCode;
  text: string;
  isFinal: boolean;
  /** Recognition engine confidence (0-1), when the engine reports one. Browser SpeechRecognition provides this for English; the Tok Pisin/Bislama mock generator does not. */
  confidence?: number;
  stepId: string;
}

/** How the tester arrived at the prompt this marker records — "start" is the first prompt shown when recording begins, "next"/"previous" are card swipes (or their fallback buttons/arrow keys), "finish" is logged when the tester ends the recording. */
export type PromptNavigationAction = "start" | "next" | "previous" | "finish";

export interface PromptMarker {
  id: string;
  stepId: string;
  /** Index of this step within the active language pack's fixed clinical sequence — never reorderable. */
  stepIndex: number;
  /** Epoch milliseconds — cheap to compare/debounce against. See createdAt for a human-readable value. */
  timestamp: number;
  promptText: string;
  language: LanguageCode;
  navigationAction: PromptNavigationAction;
  /**
   * True when continuous audio recording (MediaRecorder) was active at the
   * moment the tester was shown this prompt — false when the card was merely
   * viewed (e.g. mic access failed, or recording was paused). A marker
   * always exists once a prompt has been viewed, regardless of this flag, so
   * "the tester saw this prompt" and "audio was captured while they saw it"
   * are never conflated — see has_unvisited_prompts vs.
   * has_unrecorded_viewed_prompts on TestRecord.
   */
  capturedDuringRecording: boolean;
  createdAt: string;
}

/** A tester-flagged moment where the live transcript assist (or audio) was unclear — always requires QC review. */
export interface UnclearSegment {
  id: string;
  timestamp: string;
  stepId: string;
  note: string;
}

/**
 * ---------------------------------------------------------------------------
 * Transcript quality & translation safety
 * ---------------------------------------------------------------------------
 * The transcript is never treated as clinically correct on its own — see
 * lib/transcriptQuality.ts and lib/translationSafety.ts for the analysers
 * that produce these types, and lib/qc.ts for how they feed the QC gate.
 * ---------------------------------------------------------------------------
 */

export type TranscriptQualityRisk = "low" | "medium" | "high";
/** Review test screen display state — not persisted; derived live from tester interaction. See app/page.tsx. */
export type TranscriptReviewStatus = "not_reviewed" | "reviewed_with_corrections" | "reviewed_no_changes" | "sent_to_qc";
export type FlagSeverity = "info" | "warning" | "critical";
export type SuggestionConfidence = "low" | "medium" | "high";
export type FieldConfidenceLevel = "low" | "medium" | "high" | "unknown";
export type ExtractionSafetyStatus = "safe" | "draft_review_required";

export type TranscriptQualityFlagType =
  | "possible_misrecognition"
  | "ambiguous_negation"
  | "low_confidence"
  | "missing_expected_term"
  | "translation_uncertain"
  | "clinical_contradiction"
  | "unclear_segment"
  | "uncertain_language";

export interface TranscriptQualityFlag {
  id: string;
  severity: FlagSeverity;
  type: TranscriptQualityFlagType;
  originalText: string;
  suggestedText?: string;
  reason: string;
  segmentId?: string;
  stepId?: string;
  /** Extra detail beyond the shared type union above — e.g. which translation-risk category (untranslated terms, mixed language, etc.) produced this flag. Display-only. */
  translationRiskType?: string;
}

export interface SuggestedCorrection {
  id: string;
  originalText: string;
  suggestedText: string;
  reason: string;
  confidence: SuggestionConfidence;
  applyMode: "suggest_only";
  /** Links this correction card back to the flag that generated it. */
  relatedFlagId?: string;
}

export interface TranscriptQualityReport {
  overallRisk: TranscriptQualityRisk;
  flags: TranscriptQualityFlag[];
  suggestedCorrections: SuggestedCorrection[];
  unsafeForAutoExtraction: boolean;
  requiresQc: boolean;
  summary: string;
}

/** Record of a suggest-only correction the tester actually applied — never mutates the raw transcript, only correctedTranscriptText. */
export interface CorrectionHistoryEntry {
  id: string;
  originalText: string;
  suggestedText: string;
  appliedAt: string;
  /** tester_id of whoever applied the correction. */
  appliedBy: string;
  reason: string;
  /** True when this correction touches a clinically significant field (eye-side, can/cannot, comfort, cataract, final line, glasses) — adds a QC flag per spec. */
  affectsClinicalMeaning: boolean;
}

export interface TranslationSafetyReport {
  /** False for English — nothing here is a translation, it's the original transcript. */
  isTranslation: boolean;
  /** Honest, user-facing label — never claims "accurate translation". */
  label: string;
  confidence: FieldConfidenceLevel;
  flags: TranscriptQualityFlag[];
  requiresQc: boolean;
  unsafeForAutoExtraction: boolean;
  summary: string;
}

export interface FieldConfidence {
  value: string;
  /** "unknown" is used only when no evidence was found at all — see lib/fieldExtraction.ts. */
  source: "manual" | "transcript" | "corrected_transcript" | "unknown";
  confidence: FieldConfidenceLevel;
  requiresReview: boolean;
  reason?: string;
  /** Short quote from the transcript that produced this value — shown to the tester so a draft is never presented as unexplained fact. */
  evidence?: string;
  /** Prompt step (see lib/languagePacks.ts ids) the evidence was attributed to, when step-scoped transcript segments were available. */
  stepId?: string;
}

export type FieldConfidenceMap = Partial<Record<keyof ManualExtractedFields, FieldConfidence>>;

/** Alias used by lib/fieldExtraction.ts — same shape as FieldConfidence, named to match the draft-extraction spec. */
export type ExtractedFieldValue = FieldConfidence;

/** Full (non-partial) per-field draft map produced by extractFieldsFromTranscript — always has an entry for every manual field, even when unknown. */
export type ExtractedFieldMap = Record<keyof ManualExtractedFields, ExtractedFieldValue>;

export interface PromptStep {
  id: string;
  icon: string;
  tester_instruction: string;
  client_prompt: string;
  /** Client-friendly phrasing for "Play aloud" TTS — falls back to a cleaned version of client_prompt (see lib/speech.ts buildClientSpokenPrompt) when absent, so on-screen text and spoken text can differ. */
  spokenPrompt?: string;
  /** Optional pre-recorded audio for a future human-voiced language pack. When set, "Play aloud" plays this file instead of browser TTS. */
  audioUrl?: string;
  why_this_matters: string;
}

export interface LanguagePack {
  code: LanguageCode;
  name: string;
  downloaded: boolean;
  audio_available: boolean;
  prompts_json: PromptStep[];
}
