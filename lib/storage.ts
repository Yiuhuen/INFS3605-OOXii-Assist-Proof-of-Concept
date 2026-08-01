import { createEmptyExtractedFields, type LanguagePack, type Tester, type TestRecord } from "./types";
import { defaultLanguagePacks } from "./languagePacks";
import { computeRecordProcessingStatus } from "./qc";

const TESTER_KEY = "ooxii_assist_tester";
const RECORDS_KEY = "ooxii_assist_records";
const PACKS_KEY = "ooxii_assist_language_packs";

export const demoTester: Tester = {
  id: "T-102",
  name: "Lina",
  role: "community health worker",
  experience_level: "beginner",
  home_base: "Site A, Vanuatu",
  preferred_language: "en",
  instruction_mode: "beginner",
  is_new_tester: true,
  setup_completed: false,
  last_active_at: ""
};

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadTester(): Tester {
  if (typeof window === "undefined") return demoTester;
  const stored = safeParse<Partial<Tester>>(localStorage.getItem(TESTER_KEY), demoTester);
  return { ...demoTester, ...stored };
}

export function saveTester(tester: Tester) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TESTER_KEY, JSON.stringify(tester));
}

type LegacyTestRecord = Partial<TestRecord> & { transcript_text?: string };

/** Fills defaults for records saved by an earlier PoC build so old local data does not crash new screens. */
function normalizeRecord(record: LegacyTestRecord): TestRecord {
  const base: Omit<TestRecord, "processing_status"> = {
    id: record.id ?? "",
    session_id: record.session_id ?? record.id ?? "",
    client_id: record.client_id ?? "",
    tester_id: record.tester_id ?? "",
    deployment_site: record.deployment_site ?? record.client_snapshot?.location_site ?? "",
    outreach_session: record.outreach_session ?? "",
    language: record.language ?? "en",
    status: record.status ?? "Draft",
    sync_status: record.sync_status ?? "Pending sync",
    connection_status: record.connection_status ?? "offline",
    audio_local_url: record.audio_local_url ?? "",
    recording_status: record.recording_status ?? "recorded",
    recording_started_at: record.recording_started_at ?? "",
    recording_stopped_at: record.recording_stopped_at ?? "",
    recording_duration_seconds: record.recording_duration_seconds ?? 0,
    manual_override_reason: record.manual_override_reason ?? "",
    raw_transcript_text: record.raw_transcript_text ?? record.transcript_text ?? "",
    raw_transcript_language: record.raw_transcript_language ?? record.language ?? "en",
    english_processing_transcript: record.english_processing_transcript ?? "",
    transcript_segments: record.transcript_segments ?? [],
    prompt_markers: record.prompt_markers ?? [],
    has_unvisited_prompts: record.has_unvisited_prompts ?? false,
    has_unrecorded_viewed_prompts: record.has_unrecorded_viewed_prompts ?? false,
    unclear_segments: record.unclear_segments ?? [],
    corrected_transcript_text: record.corrected_transcript_text ?? "",
    extracted_json: { ...createEmptyExtractedFields(), ...record.extracted_json },
    edited_extracted_json: record.edited_extracted_json ? { ...createEmptyExtractedFields(), ...record.edited_extracted_json } : null,
    extraction_source: record.extraction_source ?? "raw_transcript",
    edited_by_user: record.edited_by_user ?? false,
    requires_qc_verification: record.requires_qc_verification ?? false,
    confidence_score: record.confidence_score ?? 0,
    missing_fields: record.missing_fields ?? [],
    qc_status: record.qc_status ?? "Unreviewed",
    needs_qc: record.needs_qc ?? record.qc_status !== "Approved",
    qc_notes: record.qc_notes ?? "",
    sync_attempts: record.sync_attempts ?? 0,
    transcript_quality_risk: record.transcript_quality_risk ?? "low",
    transcript_quality_flags: record.transcript_quality_flags ?? [],
    suggested_corrections: record.suggested_corrections ?? [],
    corrections_applied: record.corrections_applied ?? [],
    unresolved_transcript_flag_ids: record.unresolved_transcript_flag_ids ?? [],
    translation_review_required: record.translation_review_required ?? (record.language ? record.language !== "en" : false),
    extraction_safety_status: record.extraction_safety_status ?? "safe",
    fields_reviewed_by_tester: record.fields_reviewed_by_tester ?? false,
    demo_helper_used: record.demo_helper_used ?? false,
    recording_attempt_number: record.recording_attempt_number ?? 1,
    rerecord_used: record.rerecord_used ?? false,
    demo_record: record.demo_record ?? false,
    demo_dataset_version: record.demo_dataset_version ?? "",
    language_pack_label: record.language_pack_label ?? "",
    client_snapshot: {
      id: record.client_snapshot?.id ?? "",
      age_band: record.client_snapshot?.age_band ?? "",
      gender: record.client_snapshot?.gender ?? "",
      cataract_history: record.client_snapshot?.cataract_history ?? "unknown",
      location_site: record.client_snapshot?.location_site ?? "",
      currently_has_glasses: record.client_snapshot?.currently_has_glasses ?? "unknown",
      tester_note: record.client_snapshot?.tester_note ?? "",
      created_at: record.client_snapshot?.created_at ?? ""
    },
    created_at: record.created_at ?? new Date().toISOString(),
    updated_at: record.updated_at ?? new Date().toISOString()
  };
  return {
    ...base,
    processing_status: record.processing_status ?? computeRecordProcessingStatus(base as TestRecord)
  };
}

export function loadRecords(): TestRecord[] {
  if (typeof window === "undefined") return [];
  const raw = safeParse<LegacyTestRecord[]>(localStorage.getItem(RECORDS_KEY), []);
  return raw.map(normalizeRecord);
}

export function saveRecord(record: TestRecord) {
  if (typeof window === "undefined") return;
  const records = loadRecords();
  const existingIndex = records.findIndex((item) => item.id === record.id);
  const nextRecords = existingIndex >= 0 ? records.map((item) => (item.id === record.id ? record : item)) : [record, ...records];
  localStorage.setItem(RECORDS_KEY, JSON.stringify(nextRecords));
}

export function clearRecords() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECORDS_KEY);
}

/**
 * Adds synthetic demo records (see lib/demoRecords.ts) without touching any
 * real, tester-created records. Any previously-seeded demo records are
 * replaced (not duplicated) so re-loading the demo dataset is idempotent —
 * real records (demo_record !== true) are always preserved untouched.
 */
export function appendDemoRecords(newRecords: TestRecord[]) {
  if (typeof window === "undefined") return;
  const existing = loadRecords().filter((record) => !record.demo_record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify([...newRecords, ...existing]));
}

/** Removes only synthetic demo records (demo_record === true), leaving every real record untouched. */
export function clearDemoRecordsOnly() {
  if (typeof window === "undefined") return;
  const remaining = loadRecords().filter((record) => !record.demo_record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(remaining));
}

export function loadLanguagePacks(): LanguagePack[] {
  if (typeof window === "undefined") return defaultLanguagePacks;
  return safeParse<LanguagePack[]>(localStorage.getItem(PACKS_KEY), defaultLanguagePacks);
}

export function saveLanguagePacks(packs: LanguagePack[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
}
