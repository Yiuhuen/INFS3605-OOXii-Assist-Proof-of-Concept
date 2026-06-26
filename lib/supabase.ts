import { createClient } from "@supabase/supabase-js";
import type { TestRecord } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function syncRecordToSupabase(record: TestRecord) {
  if (!supabase) return { ok: false, reason: "Supabase is not configured; using local PoC storage." };

  const { error } = await supabase.from("test_records").upsert({
    id: record.id,
    client_id: record.client_id,
    tester_id: record.tester_id,
    language: record.language,
    status: record.status,
    sync_status: record.sync_status,
    connection_status: record.connection_status,
    audio_local_url: record.audio_local_url,
    transcript_text: record.transcript_text,
    extracted_json: record.extracted_json,
    confidence_score: record.confidence_score,
    missing_fields: record.missing_fields,
    qc_status: record.qc_status,
    client_snapshot: record.client_snapshot,
    created_at: record.created_at,
    updated_at: record.updated_at
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, reason: "Synced to Supabase." };
}
