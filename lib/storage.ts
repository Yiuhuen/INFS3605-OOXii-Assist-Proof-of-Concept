import type { LanguagePack, Tester, TestRecord } from "./types";
import { defaultLanguagePacks } from "./languagePacks";

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
  is_new_tester: true
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
  return {
    id: record.id ?? "",
    client_id: record.client_id ?? "",
    tester_id: record.tester_id ?? "",
    language: record.language ?? "en",
    status: record.status ?? "Draft",
    sync_status: record.sync_status ?? "Pending sync",
    connection_status: record.connection_status ?? "offline",
    audio_local_url: record.audio_local_url ?? "",
    recording_status: record.recording_status ?? "recorded",
    manual_override_reason: record.manual_override_reason ?? "",
    raw_transcript_text: record.raw_transcript_text ?? record.transcript_text ?? "",
    corrected_transcript_text: record.corrected_transcript_text ?? "",
    extracted_json: record.extracted_json ?? { comfort_response: "", cataract_history_confirmed: "", right_eye_distance_result: "", left_eye_distance_result: "", final_readable_line: "", glasses_selected: "", additional_notes: "", missing_fields: [], confidence_score: 0 },
    edited_extracted_json: record.edited_extracted_json ?? null,
    extraction_source: record.extraction_source ?? "raw_transcript",
    edited_by_user: record.edited_by_user ?? false,
    requires_qc_verification: record.requires_qc_verification ?? false,
    confidence_score: record.confidence_score ?? 0,
    missing_fields: record.missing_fields ?? [],
    qc_status: record.qc_status ?? "Unreviewed",
    needs_qc: record.needs_qc ?? record.qc_status !== "Approved",
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

export function loadLanguagePacks(): LanguagePack[] {
  if (typeof window === "undefined") return defaultLanguagePacks;
  return safeParse<LanguagePack[]>(localStorage.getItem(PACKS_KEY), defaultLanguagePacks);
}

export function saveLanguagePacks(packs: LanguagePack[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
}
