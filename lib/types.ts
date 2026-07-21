export type LanguageCode = "en" | "tpi" | "bis";
export type SyncStatus = "Pending sync" | "Synced" | "Failed";
export type TestStatus = "Draft" | "Complete" | "Needs QC";
export type QCStatus = "Unreviewed" | "In review" | "Corrected" | "Approved";
export type ExtractionSource = "raw_transcript" | "corrected_transcript" | "manual_override";
export type RecordingStatus = "recorded" | "failed" | "not_recorded" | "manual_override";
export type ConnectionMode = "browser" | "force-online" | "force-offline";

/**
 * Lifecycle of the local, offline-capable mock processing (translation + field
 * extraction) for a record — never a paid API call. See lib/qc.ts for how this
 * is derived and lib/mockAi.ts for the cost-safe future-AI design notes.
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
  glasses_selected: string;
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

/** Literal value stored for a required/populate field the local extraction (or manual entry) could not determine. Never a guess — see lib/mockAi.ts. */
export const UNKNOWN_FIELD_VALUE = "UNKNOWN";

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
    additional_notes: ""
  };
}

export function createEmptyExtractedFields(): ExtractedFields {
  return {
    comfort_response: "",
    cataract_history_confirmed: "",
    current_glasses: "",
    right_eye_distance_result: "",
    left_eye_distance_result: "",
    final_readable_line: "",
    glasses_selected: "",
    additional_notes: "",
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
  /** Mirrors client_snapshot.location_site at creation — a top-level convenience field for linking/reporting without unnesting client_snapshot. */
  deployment_site: string;
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
  /** True when one or more prompts in the active pack's fixed clinical sequence were never shown while recording — the sequence itself was never reordered/skipped, but a QC reviewer should confirm the gap. Derived from prompt_markers vs. the pack at save time. */
  has_unvisited_prompts: boolean;
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
  /** True once the tester has explicitly confirmed "Fields reviewed" on the Review captured fields screen. Draft-extracted fields that still require review keep the record in QC until this is set — see lib/qc.ts evaluateNeedsQc. */
  fields_reviewed_by_tester: boolean;
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
/** Transcript Review screen display state — not persisted; derived live from tester interaction. See app/page.tsx. */
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
  | "unclear_segment";

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
