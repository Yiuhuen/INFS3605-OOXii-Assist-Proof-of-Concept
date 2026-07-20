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

export type ManualExtractedFields = Omit<ExtractedFields, "missing_fields" | "confidence_score">;

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

export interface PromptStep {
  id: string;
  icon: string;
  tester_instruction: string;
  client_prompt: string;
  /** Text passed to the speech engine. Falls back to client_prompt when absent, so a future real voiceover can differ from the on-screen label. */
  audio_prompt_text?: string;
  why_this_matters: string;
}

export interface LanguagePack {
  code: LanguageCode;
  name: string;
  downloaded: boolean;
  audio_available: boolean;
  prompts_json: PromptStep[];
}
