import { HIGH_RISK_EXTRACTED_FIELDS } from "./transcriptQuality";
import { NOT_CAPTURED_FIELD_VALUE, NOT_TESTED_FIELD_VALUE } from "./types";
import type {
  ExtractedFieldMap,
  ExtractedFieldValue,
  FieldConfidenceLevel,
  ManualExtractedFields,
  PromptMarker,
  TranscriptQualityReport,
  TranscriptQualityRisk,
  TranscriptSegment
} from "./types";

/**
 * ---------------------------------------------------------------------------
 * Deterministic draft field extraction — an assistant, never the source of
 * truth (see the module docblock in lib/transcriptQuality.ts for the sibling
 * "suggest only" contract this follows).
 * ---------------------------------------------------------------------------
 * Every value this module produces rides alongside source/confidence/
 * evidence/requiresReview metadata (see FieldConfidence in lib/types.ts) so
 * the Review test screen can show *why* a draft was filled, never
 * present it as confirmed clinical fact. Nothing here is a guess dressed up
 * as certainty: fields with no transcript evidence stay empty ("") so the
 * existing missing-field/QC pipeline (lib/qc.ts, scoreExtractedFields in
 * app/page.tsx) treats them exactly like a field nobody typed.
 *
 * Pure, synchronous, no network/AI calls — same cost-safe design note as
 * lib/liveTranscript.ts and lib/transcriptQuality.ts.
 * ---------------------------------------------------------------------------
 */

const RIGHT_STEP_ID = "right-distance";
const LEFT_STEP_ID = "left-distance";
const GLASSES_STEP_ID = "glasses-check";

/** Shared display labels for the manual/draft fields — single source of truth for ReviewScreen and lib/qc.ts, so the two never drift. */
export const FIELD_DISPLAY_LABELS: Record<keyof ManualExtractedFields, string> = {
  right_eye_distance_result: "Right eye distance result",
  left_eye_distance_result: "Left eye distance result",
  both_eyes_line: "Both eyes line",
  final_readable_line: "Final readable line",
  // "/ dispensed" disambiguates from current_glasses ("does the client
  // already have glasses?") — the two were repeatedly confused when both
  // rendered as truncated "Glasses…" cards. This field is only ever the
  // outcome of the fitting step, never the client's existing glasses.
  glasses_selected: "Glasses selected / dispensed",
  comfort_response: "Comfort response",
  cataract_history_confirmed: "Cataract history confirmed",
  current_glasses: "Current glasses",
  right_lens_selected: "Right lens selected",
  left_lens_selected: "Left lens selected",
  right_astigmatism_present: "Right astigmatism",
  right_toric_power: "Right toric / cylinder power",
  right_toric_axis: "Right astigmatism axis",
  left_astigmatism_present: "Left astigmatism",
  left_toric_power: "Left toric / cylinder power",
  left_toric_axis: "Left astigmatism axis",
  short_sighted_test_performed: "Short-sighted test performed",
  short_sighted_right_result: "Short-sighted right eye result",
  short_sighted_left_result: "Short-sighted left eye result",
  short_sighted_both_eyes_result: "Short-sighted both eyes result",
  short_sighted_notes: "Short-sighted notes",
  additional_notes: "Additional notes"
};

/**
 * Fields belonging to the optional short-sighted/distance module — never in
 * HIGH_RISK_EXTRACTED_FIELDS (see lib/transcriptQuality.ts), so an unmentioned
 * short-sighted test never forces review on its own (spec: never Missing or
 * QC-required when the module was not performed). Shared with
 * lib/liveCapturedFields.ts and lib/qc.ts so the three never drift on which
 * fields belong to this module.
 */
export const SHORT_SIGHTED_RESULT_FIELD_KEYS = [
  "short_sighted_right_result",
  "short_sighted_left_result",
  "short_sighted_both_eyes_result",
  "short_sighted_notes"
] as const satisfies ReadonlyArray<keyof ManualExtractedFields>;

const HIGH_RISK_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

/** Values that always read as "needs review" wherever a field lands on one of them, regardless of source — an explicitly-flagged ambiguous answer (from the Review screen's controlled dropdowns, see components/screens/ReviewScreen.tsx) is never presented as a settled/confirmed value. Shared with lib/csv.ts so the on-screen status and the audit export's field_status never disagree. */
export const AMBIGUOUS_MANUAL_VALUES = new Set(["Unclear", "Client unsure"]);

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10"
};
const NUMBER_WORD_ALTERNATION = Object.keys(NUMBER_WORDS).filter((word) => word !== "zero").join("|");

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrase: string): RegExp {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
}

function parseLineNumber(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return NUMBER_WORDS[trimmed] ?? trimmed;
}

/**
 * Combines all transcript_segments text attributed to a single prompt step.
 * Segments already carry stepId (set live while recording — see
 * currentStepIdRef in app/page.tsx), so this is the primary way extraction
 * stays step-aware instead of blindly parsing the whole transcript. Returns
 * "" when no segment was ever attributed to that step (e.g. the tester
 * never reached it, or a mock/demo transcript with no segments at all).
 */
export function getTranscriptTextForStep(stepId: string, segments: TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.stepId === stepId && segment.text.trim())
    .map((segment) => segment.text.trim())
    .join(" ");
}

function wasStepVisited(stepId: string, promptMarkers: PromptMarker[]): boolean {
  return promptMarkers.some((marker) => marker.stepId === stepId);
}

/** Internal, pre-metadata result of a single field's rule-matching pass. */
type MatchLevel = "step" | "whole" | "alias" | "contradiction" | "none";

interface FieldMatch {
  value: string;
  matchLevel: MatchLevel;
  evidence?: string;
  stepId?: string;
  reason?: string;
}

const CONFIDENCE_ORDER: FieldConfidenceLevel[] = ["unknown", "low", "medium", "high"];

function capConfidence(confidence: FieldConfidenceLevel, cap: FieldConfidenceLevel): FieldConfidenceLevel {
  return CONFIDENCE_ORDER.indexOf(confidence) > CONFIDENCE_ORDER.indexOf(cap) ? cap : confidence;
}

/**
 * Turns a raw FieldMatch into the full ExtractedFieldValue the UI renders —
 * this is the single place confidence/requiresReview policy (spec §5-§6)
 * is decided, so every field is judged by the same rules.
 */
function finalizeField(
  key: keyof ManualExtractedFields,
  match: FieldMatch,
  overallRisk: TranscriptQualityRisk,
  sourceKind: "transcript" | "corrected_transcript",
  options?: { maxConfidence?: FieldConfidenceLevel }
): ExtractedFieldValue {
  const isHighRisk = HIGH_RISK_SET.has(key);
  let confidence: FieldConfidenceLevel;
  let requiresReview = false;
  let source: ExtractedFieldValue["source"];
  let reason = match.reason;

  switch (match.matchLevel) {
    case "none":
      confidence = "unknown";
      source = "unknown";
      requiresReview = isHighRisk;
      reason = reason ?? (isHighRisk ? "Not captured from transcript — enter manually or send to QC." : undefined);
      break;
    case "contradiction":
      confidence = "low";
      source = sourceKind;
      requiresReview = true;
      reason = reason ?? "Conflicting signals detected in the transcript — cannot auto-resolve, tester must confirm.";
      break;
    case "alias":
      confidence = "low";
      source = sourceKind;
      requiresReview = true;
      reason = reason ?? "Matched via a known speech-recognition misreading — verify against the audio.";
      break;
    case "step":
    case "whole":
      confidence = "high";
      source = sourceKind;
      requiresReview = false;
      break;
  }

  // Spec §6: medium/high transcript-quality risk always forces review and
  // caps confidence below "high" for the clinically significant fields.
  if (isHighRisk && overallRisk !== "low" && confidence === "high") {
    confidence = "medium";
    requiresReview = true;
    reason = reason ?? "Transcript quality risk was flagged for this record — verify against the audio.";
  }

  if (options?.maxConfidence) {
    const capped = capConfidence(confidence, options.maxConfidence);
    if (capped !== confidence) requiresReview = true;
    confidence = capped;
  }

  return {
    value: match.value,
    source,
    confidence,
    requiresReview,
    evidence: match.evidence,
    reason,
    stepId: match.stepId
  };
}

/**
 * Longest-phrase-first, single-pass polarity detector shared by every
 * yes/no-shaped field (current glasses, cataract history, comfort). Consumes
 * each matched phrase out of a working copy of the text before testing
 * shorter phrases, which is what prevents "not comfortable" from also
 * registering as a bare "comfortable" hit, or "not wearing glasses" from
 * also registering as "wearing glasses" — both are real phrase pairs in the
 * spec's own keyword lists (spec §4.A, §4.G "Do not confuse comfortable
 * with uncomfortable").
 */
function detectPolarity(text: string, positivePhrases: string[], negativePhrases: string[]) {
  const tagged = [
    ...positivePhrases.map((phrase) => ({ phrase, polarity: "positive" as const })),
    ...negativePhrases.map((phrase) => ({ phrase, polarity: "negative" as const }))
  ].sort((a, b) => b.phrase.length - a.phrase.length);

  let working = text;
  let positiveEvidence: string | undefined;
  let negativeEvidence: string | undefined;

  for (const { phrase, polarity } of tagged) {
    const match = phraseRegex(phrase).exec(working);
    if (!match) continue;
    if (polarity === "positive" && !positiveEvidence) positiveEvidence = match[0];
    if (polarity === "negative" && !negativeEvidence) negativeEvidence = match[0];
    working = working.slice(0, match.index) + " ".repeat(match[0].length) + working.slice(match.index + match[0].length);
  }

  return { positive: Boolean(positiveEvidence), negative: Boolean(negativeEvidence), positiveEvidence, negativeEvidence };
}

interface PolarityRule {
  positivePhrases: string[];
  negativePhrases: string[];
  aliasPositivePhrases?: string[];
  aliasNegativePhrases?: string[];
  positiveValue: string;
  negativeValue: string;
}

/** Tries step text first (when given), then whole text, then finally the low-trust alias phrase lists — see spec §3 "Do not blindly parse the whole transcript if step-specific segments are available." */
function matchPolarityField(rule: PolarityRule, stepText: string, wholeText: string): FieldMatch {
  const candidates: Array<{ text: string; level: "step" | "whole" }> = [];
  if (stepText.trim()) candidates.push({ text: stepText, level: "step" });
  if (wholeText.trim()) candidates.push({ text: wholeText, level: "whole" });

  for (const candidate of candidates) {
    const result = detectPolarity(candidate.text, rule.positivePhrases, rule.negativePhrases);
    if (result.positive && result.negative) {
      return {
        value: "",
        matchLevel: "contradiction",
        evidence: `"${result.positiveEvidence}" and "${result.negativeEvidence}"`
      };
    }
    if (result.positive) return { value: rule.positiveValue, matchLevel: candidate.level, evidence: result.positiveEvidence };
    if (result.negative) return { value: rule.negativeValue, matchLevel: candidate.level, evidence: result.negativeEvidence };
  }

  if (rule.aliasPositivePhrases || rule.aliasNegativePhrases) {
    const result = detectPolarity(wholeText, rule.aliasPositivePhrases ?? [], rule.aliasNegativePhrases ?? []);
    if (result.positive && result.negative) {
      return {
        value: "",
        matchLevel: "contradiction",
        evidence: `"${result.positiveEvidence}" and "${result.negativeEvidence}"`,
        reason: "Conflicting signals detected via a possible speech-recognition misreading — cannot auto-resolve."
      };
    }
    if (result.positive) return { value: rule.positiveValue, matchLevel: "alias", evidence: result.positiveEvidence };
    if (result.negative) return { value: rule.negativeValue, matchLevel: "alias", evidence: result.negativeEvidence };
  }

  return { value: "", matchLevel: "none" };
}

const CURRENT_GLASSES_RULE: PolarityRule = {
  positivePhrases: ["has glasses", "already has glasses", "wears glasses", "wearing glasses", "has current glasses", "brought glasses", "yes glasses"],
  negativePhrases: ["no glasses", "does not have glasses", "doesn't have glasses", "not wearing glasses", "never worn glasses"],
  aliasPositivePhrases: ["has classes", "already has classes", "wears classes", "wearing classes", "has current classes", "brought classes", "yes classes"],
  aliasNegativePhrases: ["no classes", "does not have classes", "doesn't have classes", "not wearing classes", "never worn classes"],
  positiveValue: "Yes",
  negativeValue: "No"
};

const CATARACT_HISTORY_RULE: PolarityRule = {
  positivePhrases: ["has cataract", "had cataract", "cataract history", "cataract surgery", "cloudy lens"],
  // "no cataract surgery" / "not had cataract surgery" must be listed here
  // (not just as the shorter "no cataract"/"never had cataract" below) —
  // detectPolarity tries phrases longest-first and blanks out whatever it
  // matches, so without a negative phrase at least as long as the positive
  // "cataract surgery" (16 chars), that positive phrase would win the race
  // and "The client has not had cataract surgery" would misread as Yes.
  negativePhrases: ["no cataract", "no history of cataract", "never had cataract", "no cataract surgery", "not had cataract surgery"],
  aliasPositivePhrases: ["has cataracts", "had cataracts", "cataracts history", "cataracts surgery", "has contacts", "had contacts", "cat tracks"],
  aliasNegativePhrases: ["no cataracts", "never had cataracts", "no cataracts surgery", "not had cataracts surgery"],
  positiveValue: "Yes",
  negativeValue: "No"
};

const COMFORT_RULE: PolarityRule = {
  positivePhrases: ["comfortable", "feels comfortable", "comfy", "okay", "fine", "no discomfort", "not uncomfortable"],
  negativePhrases: ["uncomfortable", "not comfortable", "dizzy", "headache", "pain", "too strong", "blurry", "not clear"],
  positiveValue: "Comfortable",
  negativeValue: "Uncomfortable"
};

interface EyeLineRule {
  primaryPhrases: string[];
  aliasPhrases: string[];
  /** The other eye's primary phrases — used only for the same-text self-correction guard below, e.g. "right eye can read line five, wait sorry left eye" must not stay high-confidence for either side. */
  oppositePrimaryPhrases: string[];
}

const RIGHT_EYE_RULE: EyeLineRule = {
  primaryPhrases: ["right eye", "r eye", "od"],
  aliasPhrases: ["write eye", "light eye", "white eye"],
  oppositePrimaryPhrases: ["left eye", "l eye", "os"]
};

const LEFT_EYE_RULE: EyeLineRule = {
  primaryPhrases: ["left eye", "l eye", "os"],
  aliasPhrases: ["lift eye"],
  oppositePrimaryPhrases: ["right eye", "r eye", "od"]
};

/**
 * Sentence (period/newline-delimited clause) containing a given character
 * index — used to scope the opposite-eye self-correction check to the same
 * breath the evidence came from, never to unrelated sentences elsewhere in
 * the transcript (a transcript mentioning "left eye" three sentences later,
 * in its own dedicated step, must never downgrade the right-eye match).
 */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index), text.lastIndexOf("\n", index)) + 1;
  const dot = text.indexOf(".", index);
  const newline = text.indexOf("\n", index);
  const end = [dot, newline].filter((position) => position !== -1).reduce((min, position) => Math.min(min, position), text.length);
  return text.slice(start, end);
}

/** True when the opposite eye's side-phrase also appears in the SAME sentence a match's evidence came from — e.g. a tester's spoken self-correction ("right eye... wait, left eye..."). Both sides mentioned in one breath is never safe to auto-resolve to one eye confidently. */
function mentionsOppositeEye(sentence: string, oppositePhrases: string[]): boolean {
  return oppositePhrases.some((phrase) => phraseRegex(phrase).test(sentence));
}

const NUMBER_ALT = `\\d+|${NUMBER_WORD_ALTERNATION}`;
const LINE_NUM_GROUP = `line\\s*(?:number\\s*)?(${NUMBER_ALT})`;
/** "can read"/"can see"/"reads"/"sees"/"has"/"got"/"reports" — the verb link required by sideVerbLine below. Deliberately excludes conjunctions like "and", which is exactly what let a neighbouring clause about the OTHER eye win the old proximity race (see the regression this replaces). */
const EYE_VERB_ALT = "can\\s+(?:read|see)|reads?|sees?|has|got|reports?";

/**
 * Three explicit, tightly-scoped grammatical constructions, tried in this
 * order, so "line six with the right eye and line five with the left eye"
 * can never resolve the right eye to the wrong, textually-closer "line
 * five" — each pattern requires a real connector (a preposition or a verb),
 * never a bare character-count window a neighbouring clause could win by
 * being a few characters shorter.
 */
function buildEyeLinePatterns(phrases: string[]) {
  const alt = phrases.map(escapeRegex).join("|");
  return {
    // "line six with the right eye" / "line six using right eye"
    lineWithSide: new RegExp(`\\b${LINE_NUM_GROUP}\\b\\s*(?:with(?:\\s+the)?|using(?:\\s+the)?)\\s+(?:${alt})\\b`, "i"),
    // "with the left eye, line four" / "with the left eye line four"
    sideCommaLine: new RegExp(`\\bwith\\s+the\\s+(?:${alt})\\b\\s*,?\\s*${LINE_NUM_GROUP}\\b`, "i"),
    // "right eye reads line six" / "right eye can read line five" / "right eye can see line 6"
    sideVerbLine: new RegExp(`\\b(?:${alt})\\b\\s*(?:${EYE_VERB_ALT})\\b[^.\\n]{0,15}?\\b${LINE_NUM_GROUP}\\b`, "i"),
    // Loose fallback (either order, wider window) — last resort only, for
    // phrasing none of the three explicit constructions above cover.
    sideFirstWide: new RegExp(`\\b(?:${alt})\\b[^.\\n]{0,30}?\\b${LINE_NUM_GROUP}\\b`, "i"),
    lineFirstWide: new RegExp(`\\b${LINE_NUM_GROUP}\\b[^.\\n]{0,30}?\\b(?:${alt})\\b`, "i")
  };
}

function findEyeLine(text: string, phrases: string[]): { value: string; evidence: string; index: number } | null {
  const patterns = buildEyeLinePatterns(phrases);
  for (const pattern of [patterns.lineWithSide, patterns.sideCommaLine, patterns.sideVerbLine]) {
    const match = pattern.exec(text);
    if (match) return { value: `Line ${parseLineNumber(match[1])}`, evidence: match[0].trim(), index: match.index };
  }
  const sideMatch = patterns.sideFirstWide.exec(text);
  if (sideMatch) return { value: `Line ${parseLineNumber(sideMatch[1])}`, evidence: sideMatch[0].trim(), index: sideMatch.index };
  const lineMatch = patterns.lineFirstWide.exec(text);
  if (lineMatch) return { value: `Line ${parseLineNumber(lineMatch[1])}`, evidence: lineMatch[0].trim(), index: lineMatch.index };
  return null;
}

function matchEyeLineField(rule: EyeLineRule, stepId: string, stepText: string, wholeText: string): FieldMatch {
  if (stepText.trim()) {
    const stepMatch = findEyeLine(stepText, rule.primaryPhrases);
    if (stepMatch) {
      if (mentionsOppositeEye(sentenceAround(stepText, stepMatch.index), rule.oppositePrimaryPhrases)) {
        return {
          value: stepMatch.value,
          matchLevel: "alias",
          evidence: stepMatch.evidence,
          stepId,
          reason: "Both eyes mentioned in the same passage — verify eye side against the audio before trusting this value."
        };
      }
      return { value: stepMatch.value, matchLevel: "step", evidence: stepMatch.evidence, stepId };
    }
  }
  if (wholeText.trim()) {
    const wholeMatch = findEyeLine(wholeText, rule.primaryPhrases);
    if (wholeMatch) {
      if (mentionsOppositeEye(sentenceAround(wholeText, wholeMatch.index), rule.oppositePrimaryPhrases)) {
        return {
          value: wholeMatch.value,
          matchLevel: "alias",
          evidence: wholeMatch.evidence,
          stepId,
          reason: "Both eyes mentioned in the same sentence — verify eye side against the audio before trusting this value."
        };
      }
      return { value: wholeMatch.value, matchLevel: "whole", evidence: wholeMatch.evidence, stepId };
    }
  }

  const aliasSource = stepText.trim() || wholeText.trim();
  if (aliasSource) {
    const aliasMatch = findEyeLine(aliasSource, rule.aliasPhrases);
    if (aliasMatch) {
      return {
        value: aliasMatch.value,
        matchLevel: "alias",
        evidence: aliasMatch.evidence,
        stepId,
        reason: `Matched via a known speech-recognition misreading ("${aliasMatch.evidence}") — verify eye side against the audio.`
      };
    }
  }

  return { value: "", matchLevel: "none", stepId };
}

const FINAL_LINE_PATTERNS: RegExp[] = [
  new RegExp(`\\bfinal\\s+(?:readable\\s+)?line\\s+is\\s+(?:line\\s+)?(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i"),
  new RegExp(`\\bbest\\s+line\\s+is\\s+(?:line\\s+)?(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i"),
  new RegExp(`\\bsmallest\\s+line\\s+is\\s+line\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i"),
  new RegExp(`\\bcan\\s+read\\s+line\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\s+clearly\\b`, "i"),
  new RegExp(`\\bline\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\s+clearly\\b`, "i")
];

/**
 * Only matches an EXPLICIT final-line statement (spec §4.E). Deliberately
 * does not derive a value from the right/left eye results even when both
 * are known — the spec's own worked examples and acceptance tests (§13,
 * §14.A) expect final_readable_line to stay Unknown for a transcript that
 * states both eye lines but never says which is the final/best line, and
 * there is no existing safe clinical rule in this app for picking one.
 */
function matchFinalReadableLine(wholeText: string): FieldMatch {
  for (const pattern of FINAL_LINE_PATTERNS) {
    const match = pattern.exec(wholeText);
    if (match) return { value: `Line ${parseLineNumber(match[1])}`, matchLevel: "whole", evidence: match[0].trim() };
  }
  return { value: "", matchLevel: "none" };
}

const BOTH_EYES_LINE_PATTERNS = [
  new RegExp(`\\bboth\\s+eyes\\b[^.\\n]{0,25}?\\b(?:read|see)\\b[^.\\n]{0,10}?\\bline\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i"),
  new RegExp(`\\b(?:with|using)\\s+both\\s+eyes\\b[^.\\n]{0,15}?\\bline\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i"),
  new RegExp(`\\bboth\\s+eyes\\s+line\\s+(\\d+|${NUMBER_WORD_ALTERNATION})\\b`, "i")
];

/**
 * Unaided both-eyes line (mirrors OOXii's pretest.bothEyes.ooxiiLine).
 * Optional and never high-risk — an unmentioned both-eyes line is a normal
 * state (the fixed prompt sequence has no both-eyes step), so "none" here
 * just reads "Not recorded" in exports, never Missing. Deliberately excludes
 * the short-sighted module's own "short-sighted both eyes line X" phrasing —
 * that belongs to short_sighted_both_eyes_result, not this field.
 */
function matchBothEyesLine(wholeText: string): FieldMatch {
  for (const pattern of BOTH_EYES_LINE_PATTERNS) {
    const match = pattern.exec(wholeText);
    if (match && !/short[- ]sighted[^.\n]{0,30}$/i.test(wholeText.slice(0, match.index))) {
      return { value: `Line ${parseLineNumber(match[1])}`, matchLevel: "whole", evidence: match[0].trim() };
    }
  }
  return { value: "", matchLevel: "none" };
}

const DIOPTER_WORD_ALT = Object.keys(NUMBER_WORDS).join("|");

/** Pads a single digit ("5" -> "50") but leaves an already-two-digit fraction ("00") alone — a raw ".00"/".50" capture must never gain a spurious third zero. */
function padDecimal(digits: string): string {
  if (digits.length >= 2) return digits.slice(0, 2);
  return `${digits}0`;
}

function formatDiopter(sign: string | undefined, whole: string, decimal?: string): string {
  const wholeDigits = /^\d+$/.test(whole) ? whole : (NUMBER_WORDS[whole.toLowerCase()] ?? whole);
  const decimalDigits = !decimal ? "00" : /^\d+$/.test(decimal) ? padDecimal(decimal) : padDecimal(NUMBER_WORDS[decimal.toLowerCase()] ?? "0");
  const signChar = sign === "minus" || sign === "-" ? "-" : sign === "plus" || sign === "+" ? "+" : "";
  return `${signChar}${wholeDigits}.${decimalDigits}`;
}

const GLASSES_SELECTION_VERB = /\b(?:selected|dispensed|gave)\b[^.\n]{0,40}?\bglasses\b|\bglasses\b[^.\n]{0,40}?\bselected\b/i;
/** "No glasses (were) dispensed/selected today" — matches the exact demo-record phrasing (lib/demoRecords.ts C-102B/C-111L: "no glasses were dispensed today" -> "No glasses dispensed") that was previously only ever hand-authored, never actually derived by this extractor. */
const GLASSES_NOT_DISPENSED_PATTERN = /\bno\b[^.\n]{0,20}?\bglasses\b[^.\n]{0,20}?\b(?:dispensed|selected)\b/i;
const SIGNED_DIOPTER_PATTERN = /([+-])\s?(\d+)(?:\.(\d+))?/;
const WORDED_SIGNED_DIOPTER_PATTERN = new RegExp(`\\b(plus|minus)\\s+(${DIOPTER_WORD_ALT})(?:\\s+point\\s+(${DIOPTER_WORD_ALT}))?\\b`, "i");
const WORDED_BARE_DECIMAL_PATTERN = new RegExp(`\\b(${DIOPTER_WORD_ALT})\\s+point\\s+(${DIOPTER_WORD_ALT})\\b`, "i");
const BARE_DECIMAL_PATTERN = /\b(\d+)\.(\d+)\b/;

/**
 * Conservative by design (spec §4.F): a signed diopter notation ("+1.00",
 * "plus one") is unambiguous enough to trust anywhere in the transcript, but
 * a bare decimal ("1.5") or a plain "selected/dispensed glasses" phrase only
 * counts when it appears in the glasses-check step text (or, absent step
 * segmentation, the whole transcript) — never promoted past "medium"
 * confidence even on a clean match, via the maxConfidence cap applied by
 * the caller.
 */
function matchGlassesSelected(stepText: string, wholeText: string): FieldMatch {
  const primaryText = stepText.trim() || wholeText;

  const signedMatch = SIGNED_DIOPTER_PATTERN.exec(primaryText) ?? SIGNED_DIOPTER_PATTERN.exec(wholeText);
  if (signedMatch) {
    return {
      value: formatDiopter(signedMatch[1], signedMatch[2], signedMatch[3]),
      matchLevel: stepText.trim() ? "step" : "whole",
      evidence: signedMatch[0].trim(),
      stepId: GLASSES_STEP_ID
    };
  }

  const wordedSigned = WORDED_SIGNED_DIOPTER_PATTERN.exec(primaryText) ?? WORDED_SIGNED_DIOPTER_PATTERN.exec(wholeText);
  if (wordedSigned) {
    return {
      value: formatDiopter(wordedSigned[1], wordedSigned[2], wordedSigned[3]),
      matchLevel: stepText.trim() ? "step" : "whole",
      evidence: wordedSigned[0].trim(),
      stepId: GLASSES_STEP_ID
    };
  }

  const wordedBare = WORDED_BARE_DECIMAL_PATTERN.exec(primaryText);
  if (wordedBare) {
    return {
      value: formatDiopter(undefined, wordedBare[1], wordedBare[2]),
      matchLevel: "step",
      evidence: wordedBare[0].trim(),
      stepId: GLASSES_STEP_ID,
      reason: "Bare lens power without an explicit +/- sign — confirm polarity against the audio."
    };
  }

  const bareDecimal = BARE_DECIMAL_PATTERN.exec(primaryText);
  if (bareDecimal) {
    return {
      value: formatDiopter(undefined, bareDecimal[1], bareDecimal[2]),
      matchLevel: "step",
      evidence: bareDecimal[0].trim(),
      stepId: GLASSES_STEP_ID,
      reason: "Bare lens power without an explicit +/- sign — confirm polarity against the audio."
    };
  }

  // Tried before the generic positive verb match below: "no glasses were
  // dispensed" contains neither of GLASSES_SELECTION_VERB's two orderings
  // (dispensed-then-glasses or glasses-then-selected), so there's no
  // ordering conflict between the two checks — this only ever fires on a
  // transcript the positive branch would otherwise have missed entirely.
  const notDispensedMatch = GLASSES_NOT_DISPENSED_PATTERN.exec(primaryText) ?? GLASSES_NOT_DISPENSED_PATTERN.exec(wholeText);
  if (notDispensedMatch) {
    return {
      value: "No glasses dispensed",
      matchLevel: stepText.trim() && GLASSES_NOT_DISPENSED_PATTERN.test(stepText) ? "step" : "whole",
      evidence: notDispensedMatch[0].trim(),
      stepId: GLASSES_STEP_ID
    };
  }

  const verbMatch = GLASSES_SELECTION_VERB.exec(wholeText);
  if (verbMatch) {
    return {
      value: "Glasses selected",
      matchLevel: stepText.trim() && GLASSES_SELECTION_VERB.test(stepText) ? "step" : "whole",
      evidence: verbMatch[0].trim(),
      stepId: GLASSES_STEP_ID,
      reason: "Selection mentioned but no specific lens power was stated — confirm which lens was dispensed."
    };
  }

  return { value: "", matchLevel: "none" };
}

/**
 * ---------------------------------------------------------------------------
 * Right/left lens selected, astigmatism/toric/axis, and the optional
 * short-sighted/distance module (OOXii-style right/left eye data).
 * ---------------------------------------------------------------------------
 * Same "conservative, evidence-only" contract as the rest of this module:
 * every value still rides through finalizeField below with its own
 * confidence/requiresReview/evidence. None of these keys are in
 * HIGH_RISK_EXTRACTED_FIELDS (lib/transcriptQuality.ts), so an unmentioned
 * astigmatism or short-sighted test never forces review on its own — only the
 * explicit "mentioned but incomplete" cases below do, via a hand-set reason
 * lib/qc.ts surfaces directly for these fields.
 * ---------------------------------------------------------------------------
 */

const LENS_DIOPTER_CAPTURE = `([+-]|plus|minus)\\s?(\\d+|${DIOPTER_WORD_ALT})(?:\\s*(?:\\.|point)\\s*(\\d+|${DIOPTER_WORD_ALT}))?`;

function buildSidedLensPatterns(side: "right" | "left") {
  return [
    // "right lens selected is plus one point zero zero" / "right dispensed lens is plus two point zero zero"
    new RegExp(`\\b${side}\\b[^.\\n]{0,10}?\\b(?:dispensed\\s+)?lens\\b[^.\\n]{0,15}?\\bis\\b[^.\\n]{0,5}?${LENS_DIOPTER_CAPTURE}`, "i"),
    // Looser fallback — side and lens mentioned together with a diopter somewhere nearby, no explicit "is".
    new RegExp(`\\b${side}\\b[^.\\n]{0,25}?\\blens\\b[^.\\n]{0,20}?${LENS_DIOPTER_CAPTURE}`, "i")
  ];
}

/** Right/left lens actually selected/dispensed (Group B) — reuses formatDiopter so "+1.00"/"plus one point five" both normalize the same way glasses_selected already does. */
function matchSidedLensSelected(side: "right" | "left", stepText: string, wholeText: string): FieldMatch {
  const primaryText = stepText.trim() || wholeText;
  for (const pattern of buildSidedLensPatterns(side)) {
    const match = pattern.exec(primaryText) ?? pattern.exec(wholeText);
    if (match) {
      return {
        value: formatDiopter(match[1], match[2], match[3]),
        matchLevel: stepText.trim() && pattern.test(stepText) ? "step" : "whole",
        evidence: match[0].trim(),
        stepId: GLASSES_STEP_ID
      };
    }
  }
  return { value: "", matchLevel: "none" };
}

const TENS_WORDS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const AXIS_NUM_ALT = `\\d+|(?:${Object.keys(TENS_WORDS).join("|")})(?:\\s+(?:${Object.keys(ONES_WORDS).join("|")}))?|${NUMBER_WORD_ALTERNATION}`;
const AXIS_PATTERN = new RegExp(`\\baxis\\s*(?:number\\s*)?(${AXIS_NUM_ALT})\\b`, "i");

/** "ninety" -> "90", "thirty five" -> "35" — astigmatism axis values run well past the 0-10 NUMBER_WORDS table the rest of this module uses for line numbers. */
function parseAxisNumber(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2 && TENS_WORDS[parts[0]] !== undefined && ONES_WORDS[parts[1]] !== undefined) {
    return String(TENS_WORDS[parts[0]] + ONES_WORDS[parts[1]]);
  }
  if (TENS_WORDS[trimmed] !== undefined) return String(TENS_WORDS[trimmed]);
  if (ONES_WORDS[trimmed] !== undefined) return String(ONES_WORDS[trimmed]);
  return NUMBER_WORDS[trimmed] ?? trimmed;
}

const TORIC_T_PATTERN = /\bT\s?(\d+(?:\.\d+)?)\b/i;
const WORDED_TORIC_PATTERN = new RegExp(`\\btoric\\s+(${DIOPTER_WORD_ALT}|\\d+)(?:\\s*(?:\\.|point)\\s*(${DIOPTER_WORD_ALT}|\\d+))?\\b`, "i");
const CYLINDER_KEYWORD_PATTERN = /\bcylinder\b/i;
const ASTIGMATISM_KEYWORD_PATTERN = /\bastigmatism\b/i;
const SIDE_QUALIFIED_NO_ASTIGMATISM_PATTERN = /\bno\b[^.\n]{0,15}?\bastigmatism\b/i;
const GLOBAL_NO_ASTIGMATISM_PATTERN = /\bno\s+astigmatism\b/i;

/** "toric one point five" -> "T1.5", "toric two" -> "T2" — mirrors formatDiopter's word/digit handling but without a sign, prefixed "T". */
function formatToric(whole: string, decimal?: string): string {
  const wholeDigits = /^\d+$/.test(whole) ? whole : (NUMBER_WORDS[whole.toLowerCase()] ?? whole);
  if (!decimal) return `T${wholeDigits}`;
  const decimalDigits = (/^\d+$/.test(decimal) ? padDecimal(decimal) : padDecimal(NUMBER_WORDS[decimal.toLowerCase()] ?? "0")).replace(/0$/, "") || "0";
  return `T${wholeDigits}.${decimalDigits}`;
}

/** Window of text starting at a side keyword ("right"/"left"), scoped to roughly one clause — mirrors sentenceAround's "same breath" intent without requiring a full sentence boundary. */
function sidedWindow(side: "right" | "left", text: string): string | null {
  const match = new RegExp(`\\b${side}\\b[^.\\n]{0,80}`, "i").exec(text);
  return match ? match[0] : null;
}

interface AstigmatismMatch {
  present: FieldMatch;
  power: FieldMatch;
  axis: FieldMatch;
}

const emptyFieldMatch: FieldMatch = { value: "", matchLevel: "none" };

/**
 * Right/left astigmatism present + toric/cylinder power + axis (Group C).
 * Accepts "toric" or "cylinder" phrasing interchangeably (spec: "Accept
 * equivalent names if the existing model uses cylinder instead of toric") —
 * both populate the same right_toric_power/left_toric_power field.
 */
function matchAstigmatismForSide(side: "right" | "left", wholeText: string): AstigmatismMatch {
  const window = sidedWindow(side, wholeText);
  if (!window) return { present: emptyFieldMatch, power: emptyFieldMatch, axis: emptyFieldMatch };

  const tMatch = TORIC_T_PATTERN.exec(window);
  const wordedToricMatch = !tMatch ? WORDED_TORIC_PATTERN.exec(window) : null;
  const cylinderKeywordFound = !tMatch && !wordedToricMatch && CYLINDER_KEYWORD_PATTERN.test(window);
  const cylinderDiopterMatch = cylinderKeywordFound ? (SIGNED_DIOPTER_PATTERN.exec(window) ?? WORDED_SIGNED_DIOPTER_PATTERN.exec(window)) : null;

  const noAstigmatismMatch = SIDE_QUALIFIED_NO_ASTIGMATISM_PATTERN.exec(window);
  if (noAstigmatismMatch && !tMatch && !wordedToricMatch && !cylinderDiopterMatch) {
    return { present: { value: "No", matchLevel: "whole", evidence: noAstigmatismMatch[0].trim() }, power: emptyFieldMatch, axis: emptyFieldMatch };
  }

  let power: FieldMatch = emptyFieldMatch;
  if (tMatch) {
    power = { value: `T${tMatch[1]}`, matchLevel: "whole", evidence: tMatch[0].trim() };
  } else if (wordedToricMatch) {
    power = { value: formatToric(wordedToricMatch[1], wordedToricMatch[2]), matchLevel: "whole", evidence: wordedToricMatch[0].trim() };
  } else if (cylinderDiopterMatch) {
    power = { value: formatDiopter(cylinderDiopterMatch[1], cylinderDiopterMatch[2], cylinderDiopterMatch[3]), matchLevel: "whole", evidence: cylinderDiopterMatch[0].trim() };
  }

  const axisMatch = AXIS_PATTERN.exec(window);
  const axis: FieldMatch = axisMatch ? { value: parseAxisNumber(axisMatch[1]), matchLevel: "whole", evidence: axisMatch[0].trim() } : emptyFieldMatch;

  const astigmatismKeywordMatch = ASTIGMATISM_KEYWORD_PATTERN.exec(window);
  const hasEvidence = Boolean(astigmatismKeywordMatch) || power.matchLevel !== "none";
  const present: FieldMatch = hasEvidence
    ? { value: "Yes", matchLevel: "whole", evidence: (astigmatismKeywordMatch?.[0] ?? power.evidence ?? "").trim() }
    : emptyFieldMatch;

  return { present, power, axis };
}

/** "No astigmatism" with no right/left qualifier in the same clause applies to both eyes (spec §5) — side-qualified mentions ("right eye has no astigmatism") are handled per-side by matchAstigmatismForSide above instead. */
function matchGlobalNoAstigmatism(wholeText: string): FieldMatch {
  const match = GLOBAL_NO_ASTIGMATISM_PATTERN.exec(wholeText);
  if (!match) return emptyFieldMatch;
  const surrounding = sentenceAround(wholeText, match.index);
  if (/\bright\b/i.test(surrounding) || /\bleft\b/i.test(surrounding)) return emptyFieldMatch;
  return { value: "No", matchLevel: "whole", evidence: match[0].trim() };
}

const SHORT_SIGHTED_PERFORMED_RULE: PolarityRule = {
  positivePhrases: [
    "short-sighted test performed",
    "short sighted test performed",
    "short-sighted test was performed",
    "short sighted test was performed",
    "distance test performed",
    "performed the short-sighted test",
    "did the short-sighted test"
  ],
  negativePhrases: [
    "short-sighted test was not done",
    "short sighted test was not done",
    "did not do the short-sighted test",
    "did not do the short sighted test",
    "we did not do the short-sighted test",
    "we did not do the short sighted test",
    "short-sighted test not performed",
    "short sighted test not performed",
    "did not perform the short-sighted test",
    "short-sighted test skipped",
    "no short-sighted test",
    "short-sighted test not done"
  ],
  positiveValue: "Yes",
  negativeValue: "No"
};

/** Short-sighted/distance module result matcher — deliberately narrower than the main eye-line matcher (no self-correction/alias handling needed for this optional, low-stakes module). */
function matchShortSightedResult(kind: "right" | "left" | "both", text: string): FieldMatch {
  const sidePhrase = kind === "right" ? "right eye" : kind === "left" ? "left eye" : "both eyes";
  const pattern = new RegExp(`\\bshort[- ]?sighted\\s+${sidePhrase}\\b[^.\\n]{0,20}?\\b${LINE_NUM_GROUP}\\b`, "i");
  const match = pattern.exec(text);
  if (match) return { value: `Line ${parseLineNumber(match[1])}`, matchLevel: "whole", evidence: match[0].trim() };
  return { value: "", matchLevel: "none" };
}

function unresolvedFlagAffects(quality: TranscriptQualityReport | undefined, predicate: (haystack: string) => boolean): boolean {
  if (!quality) return false;
  return quality.flags.some((flag) => predicate(`${flag.originalText} ${flag.suggestedText ?? ""} ${flag.reason}`.toLowerCase()));
}

export function extractFieldsFromTranscript(input: {
  rawTranscriptText: string;
  correctedTranscriptText?: string;
  englishProcessingTranscript?: string;
  transcriptSegments: TranscriptSegment[];
  promptMarkers: PromptMarker[];
  language: string;
  transcriptQualityReport?: TranscriptQualityReport;
}): ExtractedFieldMap {
  const correctedTrimmed = input.correctedTranscriptText?.trim();
  const englishTrimmed = input.englishProcessingTranscript?.trim();
  const sourceText = correctedTrimmed ? input.correctedTranscriptText! : englishTrimmed ? input.englishProcessingTranscript! : input.rawTranscriptText;
  const sourceKind: "transcript" | "corrected_transcript" = correctedTrimmed ? "corrected_transcript" : "transcript";
  const overallRisk: TranscriptQualityRisk = input.transcriptQualityReport?.overallRisk ?? "low";

  const emptyMatch: FieldMatch = { value: "", matchLevel: "none" };

  if (!sourceText.trim()) {
    const keys: Array<keyof ManualExtractedFields> = Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>;
    const empty = {} as ExtractedFieldMap;
    for (const key of keys) {
      // The short-sighted module is optional and, with no transcript at all,
      // was never performed — its fields (and the performed flag itself)
      // read "Not tested", never Missing.
      const isShortSightedField = key === "short_sighted_test_performed" || (SHORT_SIGHTED_RESULT_FIELD_KEYS as readonly string[]).includes(key);
      empty[key] = isShortSightedField
        ? { value: NOT_TESTED_FIELD_VALUE, source: sourceKind, confidence: "high", requiresReview: false }
        : finalizeField(key, emptyMatch, overallRisk, sourceKind);
    }
    return empty;
  }

  const lowerWhole = sourceText.toLowerCase();
  const segments = input.transcriptSegments;
  const rightStepText = getTranscriptTextForStep(RIGHT_STEP_ID, segments).toLowerCase();
  const leftStepText = getTranscriptTextForStep(LEFT_STEP_ID, segments).toLowerCase();
  const glassesStepText = getTranscriptTextForStep(GLASSES_STEP_ID, segments).toLowerCase();

  let rightMatch = matchEyeLineField(RIGHT_EYE_RULE, RIGHT_STEP_ID, rightStepText, lowerWhole);
  let leftMatch = matchEyeLineField(LEFT_EYE_RULE, LEFT_STEP_ID, leftStepText, lowerWhole);
  // promptMarkers tell us whether the tester's swipe cards ever reached the
  // right/left-eye step at all — a more useful "not captured" reason than
  // the generic one when the step genuinely never happened.
  if (rightMatch.matchLevel === "none" && input.promptMarkers.length > 0 && !wasStepVisited(RIGHT_STEP_ID, input.promptMarkers)) {
    rightMatch = { ...rightMatch, reason: "Right-eye step was not reached during recording." };
  }
  if (leftMatch.matchLevel === "none" && input.promptMarkers.length > 0 && !wasStepVisited(LEFT_STEP_ID, input.promptMarkers)) {
    leftMatch = { ...leftMatch, reason: "Left-eye step was not reached during recording." };
  }
  const currentGlassesMatch = matchPolarityField(CURRENT_GLASSES_RULE, glassesStepText, lowerWhole);
  const cataractMatch = matchPolarityField(CATARACT_HISTORY_RULE, "", lowerWhole);
  const comfortMatch = matchPolarityField(COMFORT_RULE, glassesStepText, lowerWhole);
  const finalLineMatch = matchFinalReadableLine(lowerWhole);
  const bothEyesLineMatch = matchBothEyesLine(lowerWhole);
  const glassesSelectedMatch = matchGlassesSelected(glassesStepText, lowerWhole);

  const rightLensMatch = matchSidedLensSelected("right", glassesStepText, lowerWhole);
  const leftLensMatch = matchSidedLensSelected("left", glassesStepText, lowerWhole);

  const globalNoAstigmatism = matchGlobalNoAstigmatism(lowerWhole);
  const rightAstigmatism = matchAstigmatismForSide("right", lowerWhole);
  const leftAstigmatism = matchAstigmatismForSide("left", lowerWhole);
  const rightAstigmatismPresent = rightAstigmatism.present.matchLevel !== "none" ? rightAstigmatism.present : globalNoAstigmatism;
  const leftAstigmatismPresent = leftAstigmatism.present.matchLevel !== "none" ? leftAstigmatism.present : globalNoAstigmatism;

  const shortSightedPerformedMatch = matchPolarityField(SHORT_SIGHTED_PERFORMED_RULE, "", lowerWhole);
  const shortSightedRightMatch = matchShortSightedResult("right", lowerWhole);
  const shortSightedLeftMatch = matchShortSightedResult("left", lowerWhole);
  const shortSightedBothMatch = matchShortSightedResult("both", lowerWhole);

  // Spec §6: unresolved eye-side / negation / misrecognition flags mark the
  // *affected* field for review even when this module's own rules found a
  // clean match — e.g. lib/transcriptQuality.ts flags a whole-transcript
  // "write eye" mishearing that our own alias tier would also have caught,
  // but it can also catch cases (different phrasing) our rules miss.
  const rightAffected = unresolvedFlagAffects(input.transcriptQualityReport, (h) => h.includes("right eye") || h.includes("write eye") || h.includes("light eye") || h.includes("white eye"));
  const leftAffected = unresolvedFlagAffects(input.transcriptQualityReport, (h) => h.includes("left eye") || h.includes("lift eye"));
  const glassesAffected = unresolvedFlagAffects(input.transcriptQualityReport, (h) => h.includes("glass") || h.includes("classes"));
  const cataractAffected = unresolvedFlagAffects(input.transcriptQualityReport, (h) => h.includes("cataract") || h.includes("contact") || h.includes("cat tracks"));
  const comfortAffected = unresolvedFlagAffects(input.transcriptQualityReport, (h) => h.includes("comfortable"));

  function withFlagReview(match: FieldMatch, affected: boolean, note: string): FieldMatch {
    if (!affected || match.matchLevel === "none") return match;
    return { ...match, reason: match.reason ?? note };
  }

  const result: ExtractedFieldMap = {
    right_eye_distance_result: finalizeField(
      "right_eye_distance_result",
      withFlagReview(rightMatch, rightAffected, "Transcript quality review flagged this step — verify eye side and line against the audio."),
      rightAffected ? "high" : overallRisk,
      sourceKind
    ),
    left_eye_distance_result: finalizeField(
      "left_eye_distance_result",
      withFlagReview(leftMatch, leftAffected, "Transcript quality review flagged this step — verify eye side and line against the audio."),
      leftAffected ? "high" : overallRisk,
      sourceKind
    ),
    current_glasses: finalizeField("current_glasses", currentGlassesMatch, overallRisk, sourceKind),
    cataract_history_confirmed: finalizeField(
      "cataract_history_confirmed",
      withFlagReview(cataractMatch, cataractAffected, "Transcript quality review flagged a possible misreading — verify against the audio."),
      cataractAffected ? "high" : overallRisk,
      sourceKind
    ),
    comfort_response: finalizeField(
      "comfort_response",
      withFlagReview(comfortMatch, comfortAffected, "Transcript quality review flagged a possible comfortable/uncomfortable ambiguity — verify against the audio."),
      comfortAffected ? "high" : overallRisk,
      sourceKind
    ),
    both_eyes_line: finalizeField("both_eyes_line", bothEyesLineMatch, overallRisk, sourceKind),
    final_readable_line: finalizeField("final_readable_line", finalLineMatch, overallRisk, sourceKind),
    glasses_selected: finalizeField(
      "glasses_selected",
      withFlagReview(glassesSelectedMatch, glassesAffected, "Transcript quality review flagged a possible misreading — verify against the audio."),
      glassesAffected ? "high" : overallRisk,
      sourceKind,
      { maxConfidence: "medium" }
    ),
    right_lens_selected: finalizeField("right_lens_selected", rightLensMatch, overallRisk, sourceKind, { maxConfidence: "medium" }),
    left_lens_selected: finalizeField("left_lens_selected", leftLensMatch, overallRisk, sourceKind, { maxConfidence: "medium" }),
    right_astigmatism_present: finalizeField("right_astigmatism_present", rightAstigmatismPresent, overallRisk, sourceKind),
    right_toric_power: finalizeField("right_toric_power", rightAstigmatism.power, overallRisk, sourceKind),
    right_toric_axis: finalizeField("right_toric_axis", rightAstigmatism.axis, overallRisk, sourceKind),
    left_astigmatism_present: finalizeField("left_astigmatism_present", leftAstigmatismPresent, overallRisk, sourceKind),
    left_toric_power: finalizeField("left_toric_power", leftAstigmatism.power, overallRisk, sourceKind),
    left_toric_axis: finalizeField("left_toric_axis", leftAstigmatism.axis, overallRisk, sourceKind),
    short_sighted_test_performed: finalizeField("short_sighted_test_performed", shortSightedPerformedMatch, overallRisk, sourceKind),
    short_sighted_right_result: finalizeField("short_sighted_right_result", shortSightedRightMatch, overallRisk, sourceKind),
    short_sighted_left_result: finalizeField("short_sighted_left_result", shortSightedLeftMatch, overallRisk, sourceKind),
    short_sighted_both_eyes_result: finalizeField("short_sighted_both_eyes_result", shortSightedBothMatch, overallRisk, sourceKind),
    short_sighted_notes: finalizeField("short_sighted_notes", emptyMatch, overallRisk, sourceKind),
    additional_notes: finalizeField("additional_notes", emptyMatch, overallRisk, sourceKind)
  };

  applyAstigmatismCompleteness(result, "right");
  applyAstigmatismCompleteness(result, "left");
  applyShortSightedOptionality(result);

  return result;
}

/**
 * Spec §7: astigmatism toric power/axis only need review when astigmatism was
 * actually mentioned for that eye — never when it was simply never brought
 * up. Runs after finalizeField so it can override the default (non-high-risk)
 * requiresReview=false with a specific, spec-worded reason lib/qc.ts surfaces
 * directly (see the field-key allowlist there).
 */
function applyAstigmatismCompleteness(result: ExtractedFieldMap, side: "right" | "left") {
  const presentKey = side === "right" ? "right_astigmatism_present" : "left_astigmatism_present";
  const powerKey = side === "right" ? "right_toric_power" : "left_toric_power";
  const axisKey = side === "right" ? "right_toric_axis" : "left_toric_axis";
  if (result[presentKey].value !== "Yes") return;
  const sideLabel = side === "right" ? "Right" : "Left";
  if (!result[powerKey].value.trim()) {
    result[powerKey] = { ...result[powerKey], requiresReview: true, reason: `${sideLabel} astigmatism mentioned but toric power not captured.` };
  }
  if (!result[axisKey].value.trim()) {
    result[axisKey] = { ...result[axisKey], requiresReview: true, reason: `${sideLabel} astigmatism mentioned but axis not captured.` };
  }
}

/**
 * Spec §4: the short-sighted/distance module is optional. Unless the
 * transcript says it was actually performed, every result field reads
 * NOT_TESTED_FIELD_VALUE (never Missing, never requiresReview). Once
 * performed=Yes, a still-empty result becomes a real Missing value that DOES
 * require review — matching "Short-sighted test performed but X missing".
 */
function applyShortSightedOptionality(result: ExtractedFieldMap) {
  const performed = result.short_sighted_test_performed.value;
  // A genuine contradiction: the "performed" phrase itself was never matched
  // (or was matched negative), yet at least one actual result was found —
  // e.g. "short-sighted right eye line four" with no "test performed"
  // sentence anywhere. That's evidence the module DID happen, not evidence
  // it didn't — never silently reads as the confident "Not tested" case
  // below, since that would hide a real result from the tester/QC.
  const hasResultEvidence =
    performed !== "Yes" &&
    SHORT_SIGHTED_RESULT_FIELD_KEYS.some((key) => key !== "short_sighted_notes" && result[key].value.trim());
  if (hasResultEvidence) {
    result.short_sighted_test_performed = {
      value: NOT_CAPTURED_FIELD_VALUE,
      source: result.short_sighted_test_performed.source,
      // "unknown", not "low" — lib/qc.ts checks confidence === "low" first and
      // would otherwise surface a generic "Low-confidence extracted field"
      // reason instead of this field's own spec-worded one (same convention
      // applyAstigmatismCompleteness above already relies on).
      confidence: "unknown",
      requiresReview: true,
      reason: "Transcript mentions a short-sighted result but the test isn't marked as performed — confirm with the tester."
    };
  } else if (!performed.trim()) {
    // Never mentioned at all — the overwhelming common case, since no clinical
    // prompt step asks about it. Reads "Not tested", never "Missing"/requires
    // review (spec §5-§6). An explicit "No" is left as-is: that IS a captured
    // fact, distinct from "we don't know".
    result.short_sighted_test_performed = {
      value: NOT_TESTED_FIELD_VALUE,
      source: result.short_sighted_test_performed.source,
      confidence: "high",
      requiresReview: false
    };
  }
  for (const key of SHORT_SIGHTED_RESULT_FIELD_KEYS) {
    if (performed !== "Yes") {
      if (!result[key].value.trim()) {
        result[key] = { value: NOT_TESTED_FIELD_VALUE, source: result[key].source, confidence: "high", requiresReview: false };
      }
      continue;
    }
    if (key === "short_sighted_notes") continue; // free-text — never required even once the module was performed.
    if (!result[key].value.trim()) {
      const label = key === "short_sighted_right_result" ? "right" : key === "short_sighted_left_result" ? "left" : "both eyes";
      result[key] = { ...result[key], requiresReview: true, reason: `Short-sighted test performed but ${label} result missing.` };
    }
  }
}

interface SelfTestCase {
  name: string;
  input: Parameters<typeof extractFieldsFromTranscript>[0];
  expect: (result: ExtractedFieldMap) => string | null;
}

const SELF_TEST_CASES: SelfTestCase[] = [
  {
    name: "Strong transcript",
    input: {
      rawTranscriptText:
        "The client already has glasses. The right eye can read line five. The left eye can read line four. The client feels comfortable.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.current_glasses.value !== "Yes") return `expected current_glasses Yes, got ${result.current_glasses.value}`;
      if (result.right_eye_distance_result.value !== "Line 5") return `expected right eye Line 5, got ${result.right_eye_distance_result.value}`;
      if (result.left_eye_distance_result.value !== "Line 4") return `expected left eye Line 4, got ${result.left_eye_distance_result.value}`;
      if (result.comfort_response.value !== "Comfortable") return `expected Comfortable, got ${result.comfort_response.value}`;
      if (result.final_readable_line.value !== "") return `expected final_readable_line to stay Unknown, got ${result.final_readable_line.value}`;
      if (result.glasses_selected.value !== "") return `expected glasses_selected to stay Unknown, got ${result.glasses_selected.value}`;
      return null;
    }
  },
  {
    name: "Ambiguous transcript",
    input: {
      rawTranscriptText: "The client has classes. The write eye can read line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.current_glasses.value !== "Yes") return `expected current_glasses Yes (alias), got ${result.current_glasses.value}`;
      if (result.current_glasses.confidence !== "low") return `expected low confidence, got ${result.current_glasses.confidence}`;
      if (!result.current_glasses.requiresReview) return "expected current_glasses requiresReview true";
      if (result.right_eye_distance_result.value !== "Line 5") return `expected right eye Line 5 (alias), got ${result.right_eye_distance_result.value}`;
      if (result.right_eye_distance_result.confidence !== "low") return `expected low confidence, got ${result.right_eye_distance_result.confidence}`;
      if (!result.right_eye_distance_result.requiresReview) return "expected right_eye_distance_result requiresReview true";
      return null;
    }
  },
  {
    name: "Empty transcript",
    input: { rawTranscriptText: "", transcriptSegments: [], promptMarkers: [], language: "en" },
    expect: (result) => {
      for (const key of HIGH_RISK_EXTRACTED_FIELDS) {
        if (result[key].value !== "") return `expected ${key} to stay empty/Unknown`;
        if (!result[key].requiresReview) return `expected ${key} requiresReview true`;
      }
      return null;
    }
  },
  {
    name: "Comfortable vs uncomfortable is not confused",
    input: { rawTranscriptText: "The client said the lenses feel uncomfortable.", transcriptSegments: [], promptMarkers: [], language: "en" },
    expect: (result) => {
      if (result.comfort_response.value !== "Uncomfortable") return `expected Uncomfortable, got ${result.comfort_response.value}`;
      return null;
    }
  },
  {
    name: "Not comfortable reads as uncomfortable, not a contradiction",
    input: { rawTranscriptText: "The client said the lenses are not comfortable.", transcriptSegments: [], promptMarkers: [], language: "en" },
    expect: (result) => {
      if (result.comfort_response.value !== "Uncomfortable") return `expected Uncomfortable, got "${result.comfort_response.value}"`;
      return null;
    }
  },
  {
    name: "Same-sentence eye self-correction is downgraded, not confidently resolved",
    input: {
      rawTranscriptText: "Right eye can read line five, wait sorry left eye can read line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_eye_distance_result.confidence === "high") return "expected right eye confidence not high after same-sentence self-correction";
      if (!result.right_eye_distance_result.requiresReview) return "expected right eye requiresReview true";
      if (result.left_eye_distance_result.confidence === "high") return "expected left eye confidence not high after same-sentence self-correction";
      if (!result.left_eye_distance_result.requiresReview) return "expected left eye requiresReview true";
      return null;
    }
  },
  {
    name: "Eyes mentioned in separate sentences stay independently high-confidence",
    input: {
      rawTranscriptText: "The right eye can read line five. The left eye can read line four.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_eye_distance_result.value !== "Line 5" || result.right_eye_distance_result.confidence !== "high") {
        return `expected right eye Line 5/high, got ${result.right_eye_distance_result.value}/${result.right_eye_distance_result.confidence}`;
      }
      if (result.left_eye_distance_result.value !== "Line 4" || result.left_eye_distance_result.confidence !== "high") {
        return `expected left eye Line 4/high, got ${result.left_eye_distance_result.value}/${result.left_eye_distance_result.confidence}`;
      }
      return null;
    }
  },
  {
    name: "FIX3-A: 'The right eye reads line six. The left eye reads line five.'",
    input: {
      rawTranscriptText: "The right eye reads line six. The left eye reads line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_eye_distance_result.value !== "Line 6") return `expected right eye Line 6, got ${result.right_eye_distance_result.value}`;
      if (result.left_eye_distance_result.value !== "Line 5") return `expected left eye Line 5, got ${result.left_eye_distance_result.value}`;
      return null;
    }
  },
  {
    name: "FIX3-B: 'Line six with the right eye and line five with the left eye.' (right must not swap to Line 5)",
    input: {
      rawTranscriptText: "Line six with the right eye and line five with the left eye.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_eye_distance_result.value !== "Line 6") return `expected right eye Line 6, got ${result.right_eye_distance_result.value}`;
      if (result.left_eye_distance_result.value !== "Line 5") return `expected left eye Line 5, got ${result.left_eye_distance_result.value}`;
      return null;
    }
  },
  {
    name: "FIX3-C: 'With the left eye, line four. With the right eye, line five.'",
    input: {
      rawTranscriptText: "With the left eye, line four. With the right eye, line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.left_eye_distance_result.value !== "Line 4") return `expected left eye Line 4, got ${result.left_eye_distance_result.value}`;
      if (result.right_eye_distance_result.value !== "Line 5") return `expected right eye Line 5, got ${result.right_eye_distance_result.value}`;
      return null;
    }
  },
  {
    name: "FIX3-D: 'The right eye reads line five. The left eye reads line four.'",
    input: {
      rawTranscriptText: "The right eye reads line five. The left eye reads line four.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_eye_distance_result.value !== "Line 5") return `expected right eye Line 5, got ${result.right_eye_distance_result.value}`;
      if (result.left_eye_distance_result.value !== "Line 4") return `expected left eye Line 4, got ${result.left_eye_distance_result.value}`;
      return null;
    }
  },
  {
    name: "FIX3-E: 'The write eye reads line five.' — misheard alias must still require review, never silently confirmed",
    input: {
      rawTranscriptText: "The write eye reads line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (!result.right_eye_distance_result.requiresReview) return "expected right eye requiresReview true for misheard alias";
      if (result.right_eye_distance_result.confidence === "high") return "expected right eye confidence not high for misheard alias";
      return null;
    }
  },
  {
    name: "Right/left lens selected captured independently",
    input: {
      rawTranscriptText: "Right lens selected is plus one point zero zero. Left lens selected is plus one point five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_lens_selected.value !== "+1.00") return `expected right_lens_selected +1.00, got ${result.right_lens_selected.value}`;
      if (result.left_lens_selected.value !== "+1.50") return `expected left_lens_selected +1.50, got ${result.left_lens_selected.value}`;
      return null;
    }
  },
  {
    name: "Astigmatism/toric/axis captured per eye, T-notation and worded toric",
    input: {
      rawTranscriptText: "Right eye has astigmatism T2 axis ninety. Left eye toric one point five axis thirty five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_astigmatism_present.value !== "Yes") return `expected right_astigmatism_present Yes, got ${result.right_astigmatism_present.value}`;
      if (result.right_toric_power.value !== "T2") return `expected right_toric_power T2, got ${result.right_toric_power.value}`;
      if (result.right_toric_axis.value !== "90") return `expected right_toric_axis 90, got ${result.right_toric_axis.value}`;
      if (result.left_astigmatism_present.value !== "Yes") return `expected left_astigmatism_present Yes, got ${result.left_astigmatism_present.value}`;
      if (result.left_toric_power.value !== "T1.5") return `expected left_toric_power T1.5, got ${result.left_toric_power.value}`;
      if (result.left_toric_axis.value !== "35") return `expected left_toric_axis 35, got ${result.left_toric_axis.value}`;
      return null;
    }
  },
  {
    name: "Cylinder phrasing is accepted as an astigmatism/toric equivalent",
    input: {
      rawTranscriptText: "Right cylinder minus two axis ninety.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_astigmatism_present.value !== "Yes") return `expected right_astigmatism_present Yes, got ${result.right_astigmatism_present.value}`;
      if (result.right_toric_power.value !== "-2.00") return `expected right_toric_power -2.00, got ${result.right_toric_power.value}`;
      if (result.right_toric_axis.value !== "90") return `expected right_toric_axis 90, got ${result.right_toric_axis.value}`;
      return null;
    }
  },
  {
    name: "Unqualified 'No astigmatism' applies to both eyes",
    input: {
      rawTranscriptText: "The client already has glasses. No astigmatism.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.right_astigmatism_present.value !== "No") return `expected right_astigmatism_present No, got ${result.right_astigmatism_present.value}`;
      if (result.left_astigmatism_present.value !== "No") return `expected left_astigmatism_present No, got ${result.left_astigmatism_present.value}`;
      return null;
    }
  },
  {
    name: "Short-sighted test not done — fields read Not tested, never requiresReview",
    input: {
      rawTranscriptText: "Short-sighted test was not done.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.short_sighted_test_performed.value !== "No") return `expected short_sighted_test_performed No, got ${result.short_sighted_test_performed.value}`;
      for (const key of SHORT_SIGHTED_RESULT_FIELD_KEYS) {
        if (result[key].value !== NOT_TESTED_FIELD_VALUE) return `expected ${key} to read "${NOT_TESTED_FIELD_VALUE}", got ${result[key].value}`;
        if (result[key].requiresReview) return `expected ${key}.requiresReview false when the module was not performed`;
      }
      return null;
    }
  },
  {
    name: "Short-sighted test performed with an incomplete result requires review only for the missing side",
    input: {
      rawTranscriptText: "Short-sighted test performed. Short-sighted right eye line four. Short-sighted both eyes line five.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.short_sighted_test_performed.value !== "Yes") return `expected short_sighted_test_performed Yes, got ${result.short_sighted_test_performed.value}`;
      if (result.short_sighted_right_result.value !== "Line 4") return `expected short_sighted_right_result Line 4, got ${result.short_sighted_right_result.value}`;
      if (result.short_sighted_both_eyes_result.value !== "Line 5") return `expected short_sighted_both_eyes_result Line 5, got ${result.short_sighted_both_eyes_result.value}`;
      if (result.short_sighted_left_result.value.trim()) return `expected short_sighted_left_result to stay Missing, got ${result.short_sighted_left_result.value}`;
      if (!result.short_sighted_left_result.requiresReview) return "expected short_sighted_left_result.requiresReview true once the module was performed but this side is missing";
      return null;
    }
  },
  {
    name: "Short-sighted notes stay Optional (never requiresReview) even once the module was performed",
    input: {
      rawTranscriptText: "Short-sighted test performed. Short-sighted right eye line four. Short-sighted left eye line four. Short-sighted both eyes line four.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.short_sighted_notes.value.trim()) return `expected short_sighted_notes to stay empty, got "${result.short_sighted_notes.value}"`;
      if (result.short_sighted_notes.requiresReview) return "expected short_sighted_notes.requiresReview false — notes are free-text and never required";
      return null;
    }
  },
  {
    name: "Short-sighted result mentioned with no 'test performed' statement — reads Not captured, needs tester confirmation",
    input: {
      rawTranscriptText: "The client already has glasses. Short-sighted right eye line four.",
      transcriptSegments: [],
      promptMarkers: [],
      language: "en"
    },
    expect: (result) => {
      if (result.short_sighted_test_performed.value !== NOT_CAPTURED_FIELD_VALUE) {
        return `expected short_sighted_test_performed "${NOT_CAPTURED_FIELD_VALUE}", got ${result.short_sighted_test_performed.value}`;
      }
      if (!result.short_sighted_test_performed.requiresReview) return "expected short_sighted_test_performed.requiresReview true for the contradiction";
      if (!result.short_sighted_test_performed.reason) return "expected a reason explaining the contradiction";
      // The actual result value found in the transcript must survive, not be forced to "Not tested" — the tester still needs to see it.
      if (result.short_sighted_right_result.value !== "Line 4") return `expected short_sighted_right_result Line 4 to survive, got ${result.short_sighted_right_result.value}`;
      // The still-empty sides must never jump straight to Missing on their own — only Not tested (spec: "do not immediately mark all subfields Missing").
      if (result.short_sighted_left_result.value !== NOT_TESTED_FIELD_VALUE) {
        return `expected short_sighted_left_result "${NOT_TESTED_FIELD_VALUE}" while ambiguous, got ${result.short_sighted_left_result.value}`;
      }
      return null;
    }
  },
  {
    name: "No transcript at all — short-sighted module defaults to Not tested, no transcript-wide crash",
    input: { rawTranscriptText: "", transcriptSegments: [], promptMarkers: [], language: "en" },
    expect: (result) => {
      if (result.short_sighted_test_performed.value !== NOT_TESTED_FIELD_VALUE) {
        return `expected short_sighted_test_performed "${NOT_TESTED_FIELD_VALUE}" on an empty transcript, got ${result.short_sighted_test_performed.value}`;
      }
      for (const key of SHORT_SIGHTED_RESULT_FIELD_KEYS) {
        if (result[key].value !== NOT_TESTED_FIELD_VALUE) return `expected ${key} "${NOT_TESTED_FIELD_VALUE}" on an empty transcript, got ${result[key].value}`;
      }
      return null;
    }
  }
];

/** Dev-only self-test for the spec's own worked fixtures — not wired into the UI, mirrors lib/transcriptQuality.ts runTranscriptQualitySelfTest. */
export function runFieldExtractionSelfTest(): { passed: boolean; results: Array<{ name: string; passed: boolean; detail?: string }> } {
  const results = SELF_TEST_CASES.map((testCase) => {
    const result = extractFieldsFromTranscript(testCase.input);
    const failure = testCase.expect(result);
    return { name: testCase.name, passed: failure === null, detail: failure ?? undefined };
  });
  return { passed: results.every((result) => result.passed), results };
}
