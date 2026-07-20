import { analyseTranscriptQuality } from "./transcriptQuality";
import type { TranscriptQualityFlag, TranslationSafetyReport } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Translation safety — the English processing copy is never labelled as an
 * accurate translation.
 * ---------------------------------------------------------------------------
 * lib/liveTranscript.ts mockTranslateToEnglish() only prefixes non-English
 * text with "[mock translation]" — it does not actually translate anything,
 * because this PoC never calls a paid translation API. This module makes
 * that limitation explicit to the tester/QC reviewer instead of silently
 * treating the processing copy as trustworthy.
 * ---------------------------------------------------------------------------
 */

function buildFlagId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function analyseTranslationSafety(input: {
  language: string;
  rawText: string;
  englishProcessingText: string;
}): TranslationSafetyReport {
  if (input.language === "en") {
    return {
      isTranslation: false,
      label: "Original transcript",
      confidence: "high",
      flags: [],
      requiresQc: false,
      unsafeForAutoExtraction: false,
      summary: "English transcript — no translation step involved."
    };
  }

  const flags: TranscriptQualityFlag[] = [];

  if (input.rawText.trim()) {
    flags.push({
      id: buildFlagId("flag"),
      severity: "warning",
      type: "translation_uncertain",
      originalText: input.rawText,
      reason:
        "No real translation provider is configured — this is a local, unverified processing copy of the original transcript, not a validated translation.",
      translationRiskType: "untranslated_terms"
    });
  }

  // Reuse the same negation/eye-side detection rules against the English
  // processing copy rather than duplicating the regex logic — re-tag the
  // hits as translation-review flags so a QC reviewer sees them in context.
  const qualityAgainstProcessingCopy = analyseTranscriptQuality({
    rawText: input.englishProcessingText,
    segments: [],
    language: input.language
  });
  for (const flag of qualityAgainstProcessingCopy.flags) {
    if (flag.type === "ambiguous_negation" || flag.type === "clinical_contradiction") {
      flags.push({
        ...flag,
        id: buildFlagId("flag"),
        translationRiskType: flag.type === "ambiguous_negation" ? "negation_ambiguity" : "eye_side_ambiguity"
      });
    }
  }

  const isTranslation = true;
  return {
    isTranslation,
    label: "English processing copy — review required",
    confidence: "unknown",
    flags,
    requiresQc: true,
    unsafeForAutoExtraction: true,
    summary: `Non-English record (${input.language}) — the English processing copy requires QC review before it can inform structured fields.`
  };
}
