import type { LanguagePack, Tester, TestRecord } from "./types";
import { defaultLanguagePacks } from "./languagePacks";

const TESTER_KEY = "ooxii_assist_tester";
const RECORDS_KEY = "ooxii_assist_records";
const PACKS_KEY = "ooxii_assist_language_packs";

export const demoTester: Tester = {
  id: "T-102",
  role: "community health worker",
  experience_level: "beginner",
  home_base: "Vanuatu clinic site",
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
  return safeParse<Tester>(localStorage.getItem(TESTER_KEY), demoTester);
}

export function saveTester(tester: Tester) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TESTER_KEY, JSON.stringify(tester));
}

export function loadRecords(): TestRecord[] {
  if (typeof window === "undefined") return [];
  return safeParse<TestRecord[]>(localStorage.getItem(RECORDS_KEY), []);
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
