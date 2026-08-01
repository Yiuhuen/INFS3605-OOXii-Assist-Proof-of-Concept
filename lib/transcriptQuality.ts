import {
  EYE_SIDE_CONFUSION_PHRASES,
  MISRECOGNITION_PAIRS,
  NEGATION_PAIRS,
  STEP_EXPECTED_TERMS,
  UNCERTAINTY_PHRASES
} from "./domainLexicon";
import {
  type ExtractionSafetyStatus,
  type ManualExtractedFields,
  type SuggestedCorrection,
  type TranscriptQualityFlag,
  type TranscriptQualityReport,
  type TranscriptSegment,
  type TranslationSafetyReport
} from "./types";

/**
 * ---------------------------------------------------------------------------
 * Transcript quality scanner — never a source of truth on its own.
 * ---------------------------------------------------------------------------
 * The transcript is a draft. This module only flags risk and suggests
 * corrections (spec: "suggest_only") — nothing here rewrites the raw or
 * corrected transcript automatically, and nothing here decides a clinical
 * outcome. See lib/qc.ts for how these signals feed the QC gate.
 * ---------------------------------------------------------------------------
 */

const RIGHT_EYE_STEP_ID = "right-distance";
const LEFT_EYE_STEP_ID = "left-distance";
const LOW_CONFIDENCE_THRESHOLD = 0.65;

const CLINICAL_CORRECTION_TERMS = [
  "left eye",
  "right eye",
  "can see",
  "cannot see",
  "comfortable",
  "uncomfortable",
  "cataract",
  "final readable line",
  "glasses",
  "blind",
  "blurry"
];

export const HIGH_RISK_EXTRACTED_FIELDS: Array<keyof ManualExtractedFields> = [
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "glasses_selected",
  "cataract_history_confirmed",
  "comfort_response"
];

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrase: string): RegExp {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
}

function includesPhrase(text: string, phrase: string): boolean {
  return phraseRegex(phrase).test(text);
}

/** Preserves a leading capital on the replacement when the matched text started with one — otherwise a suggestion applied mid-sentence would look like a typo. */
function preserveCase(matched: string, replacement: string): string {
  if (!matched || !replacement) return replacement;
  const first = matched.charAt(0);
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function detectMisrecognitionFlags(lowerText: string): { flags: TranscriptQualityFlag[]; corrections: SuggestedCorrection[] } {
  const flags: TranscriptQualityFlag[] = [];
  const corrections: SuggestedCorrection[] = [];

  for (const pair of MISRECOGNITION_PAIRS) {
    if (pair.negationOnly) continue; // handled exclusively by negation-ambiguity rule
    if (!includesPhrase(lowerText, pair.heard)) continue;

    const flag: TranscriptQualityFlag = {
      id: generateId("flag"),
      severity: pair.clinicallySignificant ? "critical" : "warning",
      type: "possible_misrecognition",
      originalText: pair.heard,
      suggestedText: pair.likely,
      reason: pair.reason
    };
    flags.push(flag);
    corrections.push({
      id: generateId("corr"),
      originalText: pair.heard,
      suggestedText: pair.likely,
      reason: pair.reason,
      confidence: pair.clinicallySignificant ? "medium" : "low",
      applyMode: "suggest_only",
      relatedFlagId: flag.id
    });

    if (EYE_SIDE_CONFUSION_PHRASES.includes(pair.heard)) {
      flags.push({
        id: generateId("flag"),
        severity: "critical",
        type: "clinical_contradiction",
        originalText: pair.heard,
        reason: `Eye-side ambiguity: "${pair.heard}" is a known confusion for "${pair.likely}" — left/right must never be auto-resolved.`
      });
    }
  }

  return { flags, corrections };
}

function detectNegationAmbiguityFlags(lowerText: string): TranscriptQualityFlag[] {
  const flags: TranscriptQualityFlag[] = [];
  for (const pair of NEGATION_PAIRS) {
    if (includesPhrase(lowerText, pair.positive) && includesPhrase(lowerText, pair.negative)) {
      flags.push({
        id: generateId("flag"),
        severity: "critical",
        type: "ambiguous_negation",
        originalText: pair.label,
        reason: `Both "${pair.positive}" and "${pair.negative}" were detected — meaning may have flipped and must not be auto-resolved.`
      });
    }
  }
  return flags;
}

function detectEyeSideSegmentContradictions(segments: TranscriptSegment[]): TranscriptQualityFlag[] {
  const flags: TranscriptQualityFlag[] = [];
  for (const segment of segments) {
    const lower = segment.text.toLowerCase();
    if (segment.stepId === RIGHT_EYE_STEP_ID && includesPhrase(lower, "left eye") && !includesPhrase(lower, "right eye")) {
      flags.push({
        id: generateId("flag"),
        severity: "critical",
        type: "clinical_contradiction",
        originalText: segment.text,
        reason: "Transcript mentions the left eye while the current step was the right-eye distance check.",
        segmentId: segment.id,
        stepId: segment.stepId
      });
    }
    if (segment.stepId === LEFT_EYE_STEP_ID && includesPhrase(lower, "right eye") && !includesPhrase(lower, "left eye")) {
      flags.push({
        id: generateId("flag"),
        severity: "critical",
        type: "clinical_contradiction",
        originalText: segment.text,
        reason: "Transcript mentions the right eye while the current step was the left-eye distance check.",
        segmentId: segment.id,
        stepId: segment.stepId
      });
    }
  }
  return flags;
}

function detectLowConfidenceFlags(segments: TranscriptSegment[]): TranscriptQualityFlag[] {
  const flags: TranscriptQualityFlag[] = [];
  for (const segment of segments) {
    if (typeof segment.confidence !== "number") continue; // missing confidence is never treated as low — rely on the other rules instead
    if (segment.confidence >= LOW_CONFIDENCE_THRESHOLD) continue;
    flags.push({
      id: generateId("flag"),
      severity: "warning",
      type: "low_confidence",
      originalText: segment.text,
      reason: `Recognition engine confidence (${Math.round(segment.confidence * 100)}%) is below the ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% threshold.`,
      segmentId: segment.id,
      stepId: segment.stepId
    });
  }
  return flags;
}

function detectMissingExpectedTermFlags(segments: TranscriptSegment[], rawText: string, currentStepId?: string): TranscriptQualityFlag[] {
  const textByStep = new Map<string, string>();
  for (const segment of segments) {
    if (!segment.stepId) continue;
    textByStep.set(segment.stepId, `${textByStep.get(segment.stepId) ?? ""} ${segment.text}`);
  }
  if (currentStepId && !textByStep.has(currentStepId)) {
    textByStep.set(currentStepId, rawText);
  }

  const flags: TranscriptQualityFlag[] = [];
  for (const [stepId, text] of textByStep) {
    const expectedTerms = STEP_EXPECTED_TERMS[stepId];
    if (!expectedTerms || expectedTerms.length === 0) continue;
    const lower = text.toLowerCase();
    const hasExpectedTerm = expectedTerms.some((term) => lower.includes(term));
    if (!hasExpectedTerm) {
      flags.push({
        id: generateId("flag"),
        severity: "info",
        type: "missing_expected_term",
        originalText: text.trim(),
        reason: "Transcript may not match this prompt.",
        stepId
      });
    }
  }
  return flags;
}

/**
 * Flags hedging/uncertain language ("maybe", "not sure", "I think"…) close
 * to what the client actually said — spec: mark the nearby field as Check,
 * never as confidently Captured. Scans per-segment (so the flag's
 * originalText carries only that segment's own field-identifying words —
 * "right eye", "glasses", "comfortable", etc — letting the existing
 * unresolvedFlagAffects check in lib/fieldExtraction.ts scope the review to
 * the field the hedge actually sat next to) and falls back to the whole raw
 * transcript when no segments exist yet (e.g. a corrected-transcript-only
 * pass, or this module's own self-test fixtures below).
 */
function detectUncertaintyFlags(segments: TranscriptSegment[], rawText: string): TranscriptQualityFlag[] {
  const flags: TranscriptQualityFlag[] = [];
  const sources: Array<{ text: string; segmentId?: string; stepId?: string }> =
    segments.length > 0
      ? segments.map((segment) => ({ text: segment.text, segmentId: segment.id, stepId: segment.stepId }))
      : rawText.trim()
        ? [{ text: rawText }]
        : [];

  for (const source of sources) {
    const lower = source.text.toLowerCase();
    const matchedPhrase = UNCERTAINTY_PHRASES.find((phrase) => includesPhrase(lower, phrase));
    if (!matchedPhrase) continue;
    flags.push({
      id: generateId("flag"),
      severity: "warning",
      type: "uncertain_language",
      originalText: source.text.trim(),
      reason: `Uncertain language ("${matchedPhrase}") was used — do not treat this as a confidently confirmed value, verify against the audio.`,
      segmentId: source.segmentId,
      stepId: source.stepId
    });
  }
  return flags;
}

function summariseFlags(flags: TranscriptQualityFlag[], overallRisk: TranscriptQualityReport["overallRisk"]): string {
  if (flags.length === 0) return "No transcript quality concerns detected. This is still a draft transcript — review before relying on it.";
  const critical = flags.filter((flag) => flag.severity === "critical").length;
  const warning = flags.filter((flag) => flag.severity === "warning").length;
  const info = flags.filter((flag) => flag.severity === "info").length;
  const parts = [`${flags.length} transcript quality flag${flags.length === 1 ? "" : "s"}`];
  if (critical) parts.push(`${critical} critical`);
  if (warning) parts.push(`${warning} warning`);
  if (info) parts.push(`${info} info`);
  return `${parts.join(", ")}. Overall risk: ${overallRisk}.`;
}

export function analyseTranscriptQuality(input: {
  rawText: string;
  segments: TranscriptSegment[];
  language: string;
  currentStepId?: string;
}): TranscriptQualityReport {
  const lower = input.rawText.toLowerCase();

  const { flags: misrecognitionFlags, corrections: misrecognitionCorrections } = detectMisrecognitionFlags(lower);
  const negationFlags = detectNegationAmbiguityFlags(lower);
  const eyeSideSegmentFlags = detectEyeSideSegmentContradictions(input.segments);
  const lowConfidenceFlags = detectLowConfidenceFlags(input.segments);
  const missingTermFlags = detectMissingExpectedTermFlags(input.segments, input.rawText, input.currentStepId);
  const uncertaintyFlags = detectUncertaintyFlags(input.segments, input.rawText);

  const flags = [
    ...misrecognitionFlags,
    ...negationFlags,
    ...eyeSideSegmentFlags,
    ...lowConfidenceFlags,
    ...missingTermFlags,
    ...uncertaintyFlags
  ];
  const overallRisk: TranscriptQualityReport["overallRisk"] = flags.some((flag) => flag.severity === "critical")
    ? "high"
    : flags.some((flag) => flag.severity === "warning")
      ? "medium"
      : "low";

  return {
    overallRisk,
    flags,
    suggestedCorrections: misrecognitionCorrections,
    unsafeForAutoExtraction: overallRisk === "high",
    requiresQc: overallRisk !== "low",
    summary: summariseFlags(flags, overallRisk)
  };
}

/**
 * Applies a suggest-only correction to correctedText ONLY — never touches the
 * raw transcript. Returns the updated text plus a CorrectionHistoryEntry the
 * caller should append to the record's corrections_applied trail.
 */
export function applySuggestedCorrection({
  correctedText,
  correction,
  testerId
}: {
  correctedText: string;
  correction: SuggestedCorrection;
  testerId: string;
}) {
  const match = phraseRegex(correction.originalText).exec(correctedText);
  const updatedText = match
    ? correctedText.slice(0, match.index) + preserveCase(match[0], correction.suggestedText) + correctedText.slice(match.index + match[0].length)
    : correctedText;

  return {
    updatedText,
    historyEntry: {
      id: generateId("applied"),
      originalText: correction.originalText,
      suggestedText: correction.suggestedText,
      appliedAt: new Date().toISOString(),
      appliedBy: testerId,
      reason: correction.reason,
      affectsClinicalMeaning: correctionAffectsClinicalMeaning(correction)
    }
  };
}

export function correctionAffectsClinicalMeaning(correction: Pick<SuggestedCorrection, "originalText" | "suggestedText">): boolean {
  const haystack = `${correction.originalText} ${correction.suggestedText}`.toLowerCase();
  return CLINICAL_CORRECTION_TERMS.some((term) => haystack.includes(term));
}

export function deriveExtractionSafetyStatus(qualityReport: TranscriptQualityReport, translationReport: TranslationSafetyReport): ExtractionSafetyStatus {
  return qualityReport.unsafeForAutoExtraction || translationReport.unsafeForAutoExtraction ? "draft_review_required" : "safe";
}

interface SelfTestCase {
  name: string;
  rawText: string;
  expect: (report: TranscriptQualityReport) => string | null;
}

const SELF_TEST_CASES: SelfTestCase[] = [
  {
    name: "Case 1: blood -> blind",
    rawText: "The client is blood in the left eye.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "possible_misrecognition" && flag.suggestedText === "blind")) return "expected possible_misrecognition suggesting 'blind'";
      if (!report.requiresQc) return "expected requiresQc true";
      return null;
    }
  },
  {
    name: "Case 2: can see / cannot see",
    rawText: "The client can see line five. The client cannot see line five.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "ambiguous_negation")) return "expected ambiguous_negation flag";
      if (report.overallRisk !== "high") return "expected high risk";
      if (!report.requiresQc) return "expected requiresQc true";
      return null;
    }
  },
  {
    name: "Case 3: write eye -> right eye",
    rawText: "Use the write eye.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "possible_misrecognition" && flag.suggestedText === "right eye")) return "expected possible_misrecognition suggesting 'right eye'";
      if (!report.flags.some((flag) => flag.type === "clinical_contradiction")) return "expected eye-side ambiguity (clinical_contradiction) flag";
      if (!report.requiresQc) return "expected requiresQc true";
      return null;
    }
  },
  {
    name: "Case 4: classes -> glasses",
    rawText: "The client has classes.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "possible_misrecognition" && flag.suggestedText === "glasses")) return "expected possible_misrecognition suggesting 'glasses'";
      return null;
    }
  },
  {
    name: "Case 5: comfortable alone",
    rawText: "The client is comfortable.",
    expect: (report) => {
      if (report.flags.some((flag) => flag.type === "ambiguous_negation")) return "expected no ambiguous_negation flag for a lone 'comfortable'";
      return null;
    }
  },
  {
    name: "Case 6: uncomfortable alone",
    rawText: "The client is uncomfortable.",
    expect: (report) => {
      if (report.flags.some((flag) => flag.type === "ambiguous_negation")) return "expected no ambiguous_negation flag for a lone 'uncomfortable'";
      if (report.flags.some((flag) => flag.suggestedText === "comfortable")) return "expected no auto-suggested change away from 'uncomfortable'";
      return null;
    }
  },
  {
    name: "Case 7: uncertain language ('maybe') forces review, not silent confirmation",
    rawText: "The right eye can maybe read line five.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "uncertain_language")) return "expected uncertain_language flag";
      if (!report.requiresQc) return "expected requiresQc true";
      return null;
    }
  },
  {
    name: "Case 8: 'cannot tell' is recognised as uncertain language",
    rawText: "The client says they cannot tell which line is clearer.",
    expect: (report) => {
      if (!report.flags.some((flag) => flag.type === "uncertain_language")) return "expected uncertain_language flag for 'cannot tell'";
      return null;
    }
  },
  {
    name: "Case 9: no hedge words means no uncertain_language flag",
    rawText: "The right eye can read line five. The left eye can read line four.",
    expect: (report) => {
      if (report.flags.some((flag) => flag.type === "uncertain_language")) return "expected no uncertain_language flag for a confident transcript";
      return null;
    }
  }
];

/** Lightweight dev-only self-test for the spec's fixture cases — not wired into the UI, run standalone during implementation/QA. */
export function runTranscriptQualitySelfTest(): { passed: boolean; results: Array<{ name: string; passed: boolean; detail?: string }> } {
  const results = SELF_TEST_CASES.map((testCase) => {
    const report = analyseTranscriptQuality({ rawText: testCase.rawText, segments: [], language: "en" });
    const failure = testCase.expect(report);
    return { name: testCase.name, passed: failure === null, detail: failure ?? undefined };
  });
  return { passed: results.every((result) => result.passed), results };
}
