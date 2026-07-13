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

export const demoTranscript = `Tester: Please cover your left eye and read the smallest line you can see.
Client: I can read line 6 with the right eye and line 7 with the left eye. I have not had cataract surgery.
Tester: Do you currently have glasses?
Client: No. The trial glasses feel clearer, but the left eye is a little blurry.
Tester: We selected the blue right eye lens and white left eye lens for review. Client says vision is clearer and comfortable enough.`;

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
export function mockExtractFields(transcript: string): ExtractedFields {
  const lower = transcript.toLowerCase();
  const { right, left } = extractEyeLines(transcript);
  const cataract = lower.includes("not had cataract") || lower.includes("no cataract") ? "no" : lower.includes("cataract") ? "mentioned - needs QC" : "";
  const glasses = lower.includes("no.") || lower.includes("no glasses") ? "no current glasses" : lower.includes("glasses") ? "mentioned" : "";
  const comfort = lower.includes("clearer") ? "Client reported clearer vision; left eye slightly blurry." : "";
  const selected = lower.includes("blue") || lower.includes("white") ? "Right/left lenses mentioned for QC review" : glasses;

  const extracted: ExtractedFields = {
    comfort_response: comfort,
    cataract_history_confirmed: cataract,
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
