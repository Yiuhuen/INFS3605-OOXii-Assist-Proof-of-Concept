export type LanguageCode = "en" | "tpi" | "bis";
export type SyncStatus = "Pending sync" | "Synced" | "Failed";
export type TestStatus = "Draft" | "Complete" | "Needs QC";
export type QCStatus = "Unreviewed" | "In review" | "Corrected" | "Approved";

export interface Tester {
  id: string;
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

export interface TestRecord {
  id: string;
  client_id: string;
  tester_id: string;
  language: LanguageCode;
  status: TestStatus;
  sync_status: SyncStatus;
  connection_status: "online" | "offline";
  audio_local_url: string;
  transcript_text: string;
  extracted_json: ExtractedFields;
  confidence_score: number;
  missing_fields: string[];
  qc_status: QCStatus;
  client_snapshot: ClientRecord;
  created_at: string;
  updated_at: string;
}

export interface PromptStep {
  id: string;
  icon: string;
  tester_instruction: string;
  client_prompt: string;
  why_this_matters: string;
}

export interface LanguagePack {
  code: LanguageCode;
  name: string;
  downloaded: boolean;
  audio_available: boolean;
  prompts_json: PromptStep[];
}
