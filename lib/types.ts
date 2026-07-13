export type LanguageCode = "en" | "tpi" | "bis";
export type SyncStatus = "Pending sync" | "Synced" | "Failed";
export type TestStatus = "Draft" | "Complete" | "Needs QC";
export type QCStatus = "Unreviewed" | "In review" | "Corrected" | "Approved";
export type ExtractionSource = "raw_transcript" | "corrected_transcript" | "manual_override";
export type RecordingStatus = "recorded" | "failed" | "not_recorded" | "manual_override";
export type ConnectionMode = "browser" | "force-online" | "force-offline";

export interface Tester {
  id: string;
  name: string;
  role: string;
  experience_level: "beginner" | "experienced" | "trainer";
  home_base: string;
  preferred_language: LanguageCode;
  instruction_mode: "beginner" | "concise";
  is_new_tester: boolean;
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
  "right_eye_distance_result",
  "left_eye_distance_result",
  "glasses_selected"
];

export type ManualExtractedFields = Omit<ExtractedFields, "missing_fields" | "confidence_score">;

export function createEmptyManualFields(): ManualExtractedFields {
  return {
    comfort_response: "",
    cataract_history_confirmed: "",
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
  client_id: string;
  tester_id: string;
  language: LanguageCode;
  status: TestStatus;
  sync_status: SyncStatus;
  connection_status: "online" | "offline";
  audio_local_url: string;
  recording_status: RecordingStatus;
  manual_override_reason: string;
  /** Immutable transcript as produced from audio/mock STT. Never edited after creation. */
  raw_transcript_text: string;
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
  client_snapshot: ClientRecord;
  created_at: string;
  updated_at: string;
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
