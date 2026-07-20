import { REQUIRED_EXTRACTED_FIELDS, type ExtractedFields } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Local mock processing — no paid API, no network required.
 * ---------------------------------------------------------------------------
 * Everything in this file runs synchronously, on-device, with keyword/regex
 * heuristics. It does NOT call OpenAI, Whisper, Google Speech, or any other
 * paid service, so a tester can complete an entire test with the phone in
 * airplane mode. Treat this as a stand-in for a "post-sync processing" step —
 * see lib/qc.ts for the cost-safe design notes on how a real AI pass could be
 * introduced later without making it a hard dependency for field testing.
 * ---------------------------------------------------------------------------
 */

/**
 * Scans left-to-right for "line N ... right|left" pairs. A global regex advances
 * past each matched eye keyword, so "line 6 ... right eye ... line 7 ... left eye"
 * correctly pairs 6→right and 7→left instead of both numbers collapsing onto
 * whichever eye word appears first in the sentence.
 */
function extractEyeLines(transcript: string): { right: string; left: string } {
  const result: { right: string; left: string } = { right: "", left: "" };
  const regex = /line\s*(\d+)[^.\n]*?\b(right|left)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(transcript)) !== null) {
    const [, lineNumber, eye] = match;
    const key = eye.toLowerCase() as "right" | "left";
    if (!result[key]) result[key] = `Line ${lineNumber}`;
  }
  return result;
}

/**
 * The "structured fields" stage of local post-sync processing. Takes the
 * English processing transcript (see lib/liveTranscript.ts mockTranslateToEnglish)
 * and heuristically fills ExtractedFields. Runs instantly on-device — this is
 * intentionally simple/keyword-based rather than a real model, so results
 * always need a human to confirm via the QC review step before export.
 */
/**
 * "Does the client currently own glasses?" — distinct from glasses_selected
 * (which trial lens was dispensed during this test). Keyword-only, never a
 * guess: returns "" when the transcript gives no clear signal either way.
 */
function extractCurrentGlasses(lower: string): string {
  const deniesGlasses = /\bno\b[^.\n]*\bglasses\b|don't have glasses|do not have glasses|no glasses|not currently|no current glasses/.test(lower);
  if (deniesGlasses) return "no";
  const confirmsGlasses = /currently have glasses|already have glasses|wearing glasses|yes[^.\n]*glasses/.test(lower);
  if (confirmsGlasses) return "yes";
  return "";
}

export function mockExtractFields(transcript: string): ExtractedFields {
  const lower = transcript.toLowerCase();
  const { right, left } = extractEyeLines(transcript);
  const cataract = lower.includes("not had cataract") || lower.includes("no cataract") ? "no" : lower.includes("cataract") ? "mentioned - needs QC" : "";
  const currentGlasses = extractCurrentGlasses(lower);
  const glasses = lower.includes("no.") || lower.includes("no glasses") ? "no current glasses" : lower.includes("glasses") ? "mentioned" : "";
  const comfort = lower.includes("clearer") ? "Client reported clearer vision; left eye slightly blurry." : "";
  const selected = lower.includes("blue") || lower.includes("white") ? "Right/left lenses mentioned for QC review" : glasses;

  const extracted: ExtractedFields = {
    comfort_response: comfort,
    cataract_history_confirmed: cataract,
    current_glasses: currentGlasses,
    right_eye_distance_result: right,
    left_eye_distance_result: left,
    final_readable_line: right || left ? [right, left].filter(Boolean).join("; ") : "",
    glasses_selected: selected,
    additional_notes: lower.includes("blurry") ? "Left eye blur flagged for QC follow-up." : "",
    missing_fields: [],
    confidence_score: 0
  };

  extracted.missing_fields = REQUIRED_EXTRACTED_FIELDS.filter((field) => !String(extracted[field] ?? "").trim());
  extracted.confidence_score = Math.max(0.45, Math.round((1 - extracted.missing_fields.length / REQUIRED_EXTRACTED_FIELDS.length) * 100) / 100);
  return extracted;
}
