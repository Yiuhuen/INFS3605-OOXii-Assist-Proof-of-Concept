import { extractFieldsFromTranscript } from "./fieldExtraction";
import type { LanguageCode, ManualExtractedFields, PromptMarker, TranscriptSegment } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Live "Captured so far" preview — Recording screen only.
 * ---------------------------------------------------------------------------
 * This is a draft-of-a-draft: it reuses the same deterministic, local,
 * regex-based extractor as the final reviewed extraction
 * (lib/fieldExtraction.ts), just run early and repeatedly against whatever
 * transcript text exists *while the tester is still speaking*. It never
 * writes to a saved record, never replaces the real extraction that runs at
 * Finish & review, and never claims speech-to-text is accurate — a live
 * status of "Check" here means exactly that: not yet trustworthy, confirm at
 * review. Nothing here calls a network/AI service; see the sibling module
 * docblock in lib/fieldExtraction.ts for the same cost-safe contract.
 * ---------------------------------------------------------------------------
 */

export type LiveFieldStatus = "Captured" | "Missing" | "Check";

export interface LiveFieldPreview {
  value: string;
  status: LiveFieldStatus;
}

export type LiveCapturedFieldMap = Record<(typeof LIVE_CAPTURED_FIELD_KEYS)[number], LiveFieldPreview>;

/** The seven fields the Recording screen's "Captured so far" panel tracks live, in the clinical spec's order — single source of truth shared with RecordingScreen.tsx and this module's own tests. */
export const LIVE_CAPTURED_FIELD_KEYS = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
] as const satisfies ReadonlyArray<keyof ManualExtractedFields>;

export const LIVE_CAPTURED_FIELD_LABELS: Record<(typeof LIVE_CAPTURED_FIELD_KEYS)[number], string> = {
  current_glasses: "Current glasses",
  cataract_history_confirmed: "Cataract",
  right_eye_distance_result: "Right eye",
  left_eye_distance_result: "Left eye",
  final_readable_line: "Final line",
  comfort_response: "Comfort",
  glasses_selected: "Glasses selected"
};

/**
 * Words that make a spoken value sound uncertain even when a field's own
 * pattern matched cleanly ("the right eye maybe line five") — a lightweight,
 * local check, not a claim that the recognizer itself is more or less
 * accurate. Deliberately narrow: this only ever *downgrades* a match to
 * "Check", never invents or removes a value.
 */
const HEDGE_WORD_PATTERN = /\b(maybe|not sure|unsure|unclear|unknown|possibly|perhaps|i think|i believe|might be|i guess)\b/i;
/** How far (in characters) around a field's evidence phrase to look for a hedge word — wide enough to catch "maybe" leading or trailing the phrase in the same clause, narrow enough not to pick up hedging from an unrelated sentence. */
const HEDGE_WINDOW_CHARS = 40;

function hedgeNearby(haystackLower: string, evidenceLower: string): boolean {
  if (!evidenceLower) return false;
  const index = haystackLower.indexOf(evidenceLower);
  if (index === -1) return HEDGE_WORD_PATTERN.test(haystackLower);
  const start = Math.max(0, index - HEDGE_WINDOW_CHARS);
  const end = Math.min(haystackLower.length, index + evidenceLower.length + HEDGE_WINDOW_CHARS);
  return HEDGE_WORD_PATTERN.test(haystackLower.slice(start, end));
}

/**
 * Builds the live "Captured so far" preview from whatever transcript text
 * exists right now. Priority order (spec):
 *   1. final transcript segments already committed by STT,
 *   2. current interim transcript,
 *   3. manual fallback transcript, only when neither of the above has any content.
 * `finalTranscriptText` and `interimTranscriptText` are combined for the
 * actual field-matching pass; a field is only ever downgraded to "Check"
 * relative to what the shared extractor already decided, never silently
 * upgraded — extraction runs a second time against `finalTranscriptText`
 * alone so a value that only exists once interim text is folded in can be
 * told apart from one the (already-committed) final transcript supports.
 *
 * Returns null when there's nothing to extract from yet — the caller should
 * render all seven fields as Missing in that case, exactly as if this
 * returned an all-Missing map.
 */
export function buildLiveCapturedFields(input: {
  finalTranscriptText: string;
  interimTranscriptText: string;
  /** Free-text manual entry (e.g. RecordingScreen's "Add manual transcript" fallback) — used only when there is no STT text at all yet. */
  manualFallbackText: string;
  transcriptSegments: TranscriptSegment[];
  promptMarkers: PromptMarker[];
  language: LanguageCode;
}): LiveCapturedFieldMap | null {
  const sttCombinedText = [input.finalTranscriptText, input.interimTranscriptText].filter((part) => part.trim()).join("\n");
  const usingManualFallback = !sttCombinedText.trim() && Boolean(input.manualFallbackText.trim());
  const combinedText = usingManualFallback ? input.manualFallbackText : sttCombinedText;

  if (!combinedText.trim()) return null;

  const combinedMap = extractFieldsFromTranscript({
    rawTranscriptText: combinedText,
    transcriptSegments: input.transcriptSegments,
    promptMarkers: input.promptMarkers,
    language: input.language
  });
  // A second, final-only pass — purely so a field can be told "this value
  // only showed up once still-interim text was folded in" (Check) apart
  // from "the committed final transcript alone already supports this"
  // (Captured, modulo the extractor's own requiresReview signal).
  const finalOnlyMap = input.finalTranscriptText.trim()
    ? extractFieldsFromTranscript({
        rawTranscriptText: input.finalTranscriptText,
        transcriptSegments: input.transcriptSegments,
        promptMarkers: input.promptMarkers,
        language: input.language
      })
    : null;

  const combinedTextLower = combinedText.toLowerCase();
  const result = {} as LiveCapturedFieldMap;

  for (const key of LIVE_CAPTURED_FIELD_KEYS) {
    const finalMeta = finalOnlyMap?.[key];
    const finalHasValue = Boolean(finalMeta?.value.trim());
    const meta = finalHasValue ? finalMeta! : combinedMap[key];
    const value = meta.value.trim();

    if (!value) {
      result[key] = { value: "", status: "Missing" };
      continue;
    }

    const interimOnly = !usingManualFallback && !finalHasValue;
    const hedged = hedgeNearby(combinedTextLower, (meta.evidence ?? "").toLowerCase());
    const status: LiveFieldStatus = usingManualFallback || meta.requiresReview || interimOnly || hedged ? "Check" : "Captured";
    result[key] = { value, status };
  }

  return result;
}
