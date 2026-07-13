import { createClient } from "@supabase/supabase-js";
import type { TestRecord } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

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
    recording_status: record.recording_status,
    manual_override_reason: record.manual_override_reason,
    raw_transcript_text: record.raw_transcript_text,
    corrected_transcript_text: record.corrected_transcript_text,
    extracted_json: record.extracted_json,
    edited_extracted_json: record.edited_extracted_json,
    extraction_source: record.extraction_source,
    edited_by_user: record.edited_by_user,
    requires_qc_verification: record.requires_qc_verification,
    confidence_score: record.confidence_score,
    missing_fields: record.missing_fields,
    qc_status: record.qc_status,
    needs_qc: record.needs_qc,
    client_snapshot: record.client_snapshot,
    created_at: record.created_at,
    updated_at: record.updated_at
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, reason: "Synced to Supabase." };
}
