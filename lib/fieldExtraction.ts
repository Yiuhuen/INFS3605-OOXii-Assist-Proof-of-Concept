import { HIGH_RISK_EXTRACTED_FIELDS } from "./transcriptQuality";
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
 * the Review captured fields screen can show *why* a draft was filled, never
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

/** Shared display labels for the 8 manual/draft fields — single source of truth for CapturedFieldsScreen and lib/qc.ts, so the two never drift. */
export const FIELD_DISPLAY_LABELS: Record<keyof ManualExtractedFields, string> = {
  right_eye_distance_result: "Right eye distance result",
  left_eye_distance_result: "Left eye distance result",
  final_readable_line: "Final readable line",
  // "/ dispensed" disambiguates from current_glasses ("does the client
  // already have glasses?") — the two were repeatedly confused when both
  // rendered as truncated "Glasses…" cards. This field is only ever the
  // outcome of the fitting step, never the client's existing glasses.
  glasses_selected: "Glasses selected / dispensed",
  comfort_response: "Comfort response",
  cataract_history_confirmed: "Cataract history confirmed",
  current_glasses: "Current glasses",
  additional_notes: "Additional notes"
};

const HIGH_RISK_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

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
  positivePhrases: ["comfortable", "feels comfortable", "okay", "fine", "no discomfort", "not uncomfortable"],
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
    const keys: Array<keyof ManualExtractedFields> = [
      "comfort_response",
      "cataract_history_confirmed",
      "current_glasses",
      "right_eye_distance_result",
      "left_eye_distance_result",
      "final_readable_line",
      "glasses_selected",
      "additional_notes"
    ];
    const empty = {} as ExtractedFieldMap;
    for (const key of keys) empty[key] = finalizeField(key, emptyMatch, overallRisk, sourceKind);
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
  const glassesSelectedMatch = matchGlassesSelected(glassesStepText, lowerWhole);

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
    final_readable_line: finalizeField("final_readable_line", finalLineMatch, overallRisk, sourceKind),
    glasses_selected: finalizeField(
      "glasses_selected",
      withFlagReview(glassesSelectedMatch, glassesAffected, "Transcript quality review flagged a possible misreading — verify against the audio."),
      glassesAffected ? "high" : overallRisk,
      sourceKind,
      { maxConfidence: "medium" }
    ),
    additional_notes: finalizeField("additional_notes", emptyMatch, overallRisk, sourceKind)
  };

  return result;
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
