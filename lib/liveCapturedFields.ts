import { UNCERTAINTY_PHRASES } from "./domainLexicon";
import { extractFieldsFromTranscript, SHORT_SIGHTED_RESULT_FIELD_KEYS } from "./fieldExtraction";
import { NOT_TESTED_FIELD_VALUE } from "./types";
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

export type LiveFieldStatus = "Captured" | "Missing" | "Check" | "Not tested";

export interface LiveFieldPreview {
  value: string;
  status: LiveFieldStatus;
}

/**
 * ---------------------------------------------------------------------------
 * Captured so far — three tabs (Core / Glasses / Short-sighted), each with
 * its own field list and completion count. Replaces the old single flat
 * 7-field list: right/left glasses data, astigmatism, and the optional
 * short-sighted module all live in their own tab now, so one misleading
 * global "X of 7" is never shown again (spec §3).
 * ---------------------------------------------------------------------------
 */
export type CapturedTabId = "core" | "glasses" | "shortSighted";

/** Core clinical fields — unchanged from the original flat list minus glasses_selected, which moved to the Glasses tab. */
export const CORE_FIELD_KEYS = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response"
] as const satisfies ReadonlyArray<keyof ManualExtractedFields>;

/** Glasses/lens tab — right/left lens split (spec §1) plus astigmatism presence (spec §2) and the overall dispensed status. Toric power/axis detail lives on the Review captured fields screen, not this compact live panel. */
export const GLASSES_FIELD_KEYS = [
  "right_lens_selected",
  "left_lens_selected",
  "right_astigmatism_present",
  "left_astigmatism_present",
  "glasses_selected"
] as const satisfies ReadonlyArray<keyof ManualExtractedFields>;

/** Short-sighted/distance module — optional (spec §5-§6); re-exported from lib/fieldExtraction.ts so the "which fields belong to this module" list has one source of truth. */
export const SHORT_SIGHTED_FIELD_KEYS = SHORT_SIGHTED_RESULT_FIELD_KEYS;

/** Every field any Captured-so-far tab renders, including the short-sighted "performed?" gate (shown but never counted toward that tab's completion fraction — see RecordingScreen.tsx). */
const ALL_LIVE_FIELD_KEYS = [
  ...CORE_FIELD_KEYS,
  ...GLASSES_FIELD_KEYS,
  "short_sighted_test_performed",
  ...SHORT_SIGHTED_FIELD_KEYS
] as const satisfies ReadonlyArray<keyof ManualExtractedFields>;

/** Union of every field key any Captured-so-far tab can render — narrower than keyof ManualExtractedFields (excludes toric power/axis, additional_notes, etc., which never appear on this compact panel). */
export type LiveCapturedFieldKey = (typeof ALL_LIVE_FIELD_KEYS)[number];

export type LiveCapturedFieldMap = Record<LiveCapturedFieldKey, LiveFieldPreview>;

/**
 * Workflow-based tab labels — describe the data being captured, never a
 * diagnosis of the client. "Vision" (not "Core", too vague) and "Optional
 * tests" (not "Short-sighted", which reads as a clinical finding rather than
 * an optional module name) — see components/screens/RecordingScreen.tsx
 * CapturedSoFarPanel, the only place these render. Internal CapturedTabId
 * ids are unchanged; only the display label moved.
 */
export const CAPTURED_TAB_LABELS: Record<CapturedTabId, string> = { core: "Vision", glasses: "Glasses", shortSighted: "Optional tests" };

/** Compact labels for this panel only — short enough for a two-column 320px grid. Full labels (used on Review captured fields) live in lib/fieldExtraction.ts FIELD_DISPLAY_LABELS. */
export const LIVE_CAPTURED_FIELD_LABELS: Record<LiveCapturedFieldKey, string> = {
  current_glasses: "Current glasses",
  cataract_history_confirmed: "Cataract",
  right_eye_distance_result: "Right eye",
  left_eye_distance_result: "Left eye",
  final_readable_line: "Final line",
  comfort_response: "Comfort",
  glasses_selected: "Dispensed status",
  right_lens_selected: "Right lens",
  left_lens_selected: "Left lens",
  right_astigmatism_present: "Right astigmatism",
  left_astigmatism_present: "Left astigmatism",
  short_sighted_test_performed: "Test performed?",
  short_sighted_right_result: "Right result",
  short_sighted_left_result: "Left result",
  short_sighted_both_eyes_result: "Both eyes result",
  short_sighted_notes: "Notes"
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Words that make a spoken value sound uncertain even when a field's own
 * pattern matched cleanly ("the right eye maybe line five") — a lightweight,
 * local check, not a claim that the recognizer itself is more or less
 * accurate. Deliberately narrow: this only ever *downgrades* a match to
 * "Check", never invents or removes a value. Shares its phrase list
 * (lib/domainLexicon.ts UNCERTAINTY_PHRASES) with lib/transcriptQuality.ts's
 * uncertain_language flag, which is what actually persists onto the saved
 * record's requiresQc/transcript_quality_flags — this module stays a
 * same-list, live-preview-only rendering of the same signal.
 */
const HEDGE_WORD_PATTERN = new RegExp(`\\b(${UNCERTAINTY_PHRASES.map(escapeRegex).join("|")})\\b`, "i");
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

  for (const key of ALL_LIVE_FIELD_KEYS) {
    const finalMeta = finalOnlyMap?.[key];
    const finalHasValue = Boolean(finalMeta?.value.trim());
    const meta = finalHasValue ? finalMeta! : combinedMap[key];
    const value = meta.value.trim();

    // Short-sighted module fields (spec §4): "Not tested" is a captured,
    // confident state — the module simply wasn't performed — never Missing
    // and never gated behind interim/hedge downgrades the way a real
    // in-progress value would be.
    if (value === NOT_TESTED_FIELD_VALUE) {
      result[key] = { value, status: "Not tested" };
      continue;
    }

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
