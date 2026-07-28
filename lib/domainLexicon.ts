/**
 * ---------------------------------------------------------------------------
 * OOXii / vision-testing domain lexicon — pure data, no logic.
 * ---------------------------------------------------------------------------
 * Used by lib/transcriptQuality.ts and lib/translationSafety.ts to flag
 * suspected speech-to-text misrecognitions and ambiguous clinical phrasing.
 * Nothing here replaces transcript text automatically — see
 * lib/transcriptQuality.ts for the "suggest only" correction model.
 * ---------------------------------------------------------------------------
 */

export const VISION_TERMS: string[] = [
  "eye",
  "left eye",
  "right eye",
  "cover",
  "chart",
  "line",
  "letters",
  "blurry",
  "clear",
  "smallest line",
  "readable",
  "glasses",
  "lenses",
  "comfortable",
  "uncomfortable",
  "cataract",
  "headache",
  "dizzy",
  "blind",
  "vision",
  "distance",
  "near",
  "better",
  "worse"
];

export const CLINICAL_WORKFLOW_TERMS: string[] = [
  "read",
  "can see",
  "cannot see",
  "try again",
  "switch eyes",
  "final line",
  "selected glasses",
  "current glasses"
];

export interface MisrecognitionPair {
  /** The word/phrase actually heard/transcribed. */
  heard: string;
  /** The domain term it is likely a mishearing of. */
  likely: string;
  reason: string;
  /** True when the wrong reading could change a clinical field (eye, glasses, cataract, blind/blurry, etc). Drives flag severity. */
  clinicallySignificant: boolean;
  /**
   * True for pairs that are both valid, complete English words on their own
   * (e.g. "comfortable" / "uncomfortable") — these must never be flagged as a
   * standalone misrecognition just for appearing once. They are only a risk
   * when BOTH forms appear near each other, which is handled exclusively by
   * the negation-ambiguity rule (see NEGATION_PAIRS below), not the generic
   * misrecognition scanner.
   */
  negationOnly?: boolean;
}

/** Known misrecognition pairs — spec §1. Suggest-only: never auto-applied to any transcript. */
export const MISRECOGNITION_PAIRS: MisrecognitionPair[] = [
  { heard: "blood", likely: "blind", reason: "Vision-testing context; \"blind\" is more likely than \"blood\".", clinicallySignificant: true },
  { heard: "bloody", likely: "blurry", reason: "Vision-testing context; \"blurry\" is more likely than \"bloody\".", clinicallySignificant: true },
  { heard: "blinds", likely: "blind", reason: "Vision-testing context; \"blind\" is more likely than \"blinds\".", clinicallySignificant: true },
  { heard: "glass", likely: "glasses", reason: "Vision-testing context; \"glasses\" is more likely than \"glass\".", clinicallySignificant: true },
  { heard: "classes", likely: "glasses", reason: "Vision-testing context; \"glasses\" is more likely than \"classes\".", clinicallySignificant: true },
  { heard: "lines", likely: "line", reason: "Chart reading context; \"line\" is the expected singular term.", clinicallySignificant: false },
  { heard: "lions", likely: "line", reason: "Chart reading context; \"line\" is more likely than \"lions\".", clinicallySignificant: false },
  { heard: "letter", likely: "letters", reason: "Chart reading context; \"letters\" is the expected term.", clinicallySignificant: false },
  { heard: "let her", likely: "letter", reason: "Chart reading context; \"letter\" is more likely than \"let her\".", clinicallySignificant: false },
  { heard: "write eye", likely: "right eye", reason: "Eye-side context; \"right eye\" is more likely than \"write eye\".", clinicallySignificant: true },
  { heard: "light eye", likely: "right eye", reason: "Eye-side context; \"right eye\" is more likely than \"light eye\".", clinicallySignificant: true },
  { heard: "white eye", likely: "right eye", reason: "Eye-side context; \"right eye\" is more likely than \"white eye\".", clinicallySignificant: true },
  { heard: "lift eye", likely: "left eye", reason: "Eye-side context; \"left eye\" is more likely than \"lift eye\".", clinicallySignificant: true },
  { heard: "clearest", likely: "clear", reason: "Vision-testing context; \"clear\" is the expected term.", clinicallySignificant: false },
  { heard: "cloudy", likely: "blurry", reason: "Vision-testing context; \"blurry\" is more likely than \"cloudy\".", clinicallySignificant: true },
  { heard: "contacts", likely: "cataracts", reason: "Clinical-history context; \"cataracts\" is more likely than \"contacts\".", clinicallySignificant: true },
  { heard: "cat tracks", likely: "cataracts", reason: "Clinical-history context; \"cataracts\" is more likely than \"cat tracks\".", clinicallySignificant: true },
  { heard: "comfortable", likely: "uncomfortable", reason: "Comfort response may have dropped the \"un-\" prefix.", clinicallySignificant: true, negationOnly: true },
  { heard: "uncomfortable", likely: "comfortable", reason: "Comfort response may have an added \"un-\" prefix.", clinicallySignificant: true, negationOnly: true },
  { heard: "can see", likely: "cannot see", reason: "Negation may have been dropped.", clinicallySignificant: true, negationOnly: true },
  { heard: "cannot see", likely: "can see", reason: "Negation may have been added.", clinicallySignificant: true, negationOnly: true }
];

/** Subset of MISRECOGNITION_PAIRS specifically about eye-side confusion — exposed separately so rule D can add a second, eye-specific flag on top of the generic misrecognition one. */
export const EYE_SIDE_CONFUSION_PHRASES: string[] = ["write eye", "light eye", "white eye", "lift eye"];

export interface NegationPairDefinition {
  positive: string;
  negative: string;
  label: string;
}

/**
 * Negation pairs — spec §3.C. Flagged only when BOTH forms are present in the
 * same transcript (meaning could have flipped either way and must never be
 * silently resolved). "left"/"right" is deliberately excluded: every normal
 * transcript mentions both eyes, so a generic negation check on those two
 * words alone would false-positive constantly. Eye-side risk is handled by
 * the dedicated eye-side rules instead (see EYE_SIDE_CONFUSION_PHRASES and
 * the per-segment stepId check in lib/transcriptQuality.ts).
 */
export const NEGATION_PAIRS: NegationPairDefinition[] = [
  { positive: "can see", negative: "cannot see", label: "can see / cannot see" },
  { positive: "comfortable", negative: "uncomfortable", label: "comfortable / uncomfortable" },
  { positive: "has glasses", negative: "no glasses", label: "has glasses / no glasses" },
  { positive: "better", negative: "worse", label: "better / worse" }
];

/**
 * Hedge/uncertainty phrases — spec's "mark uncertain values as Check, not
 * Captured". Single source of truth for both lib/transcriptQuality.ts (feeds
 * the persisted transcript_quality_flags / requiresQc audit trail) and
 * lib/liveCapturedFields.ts (the Recording screen's live preview only).
 * Deliberately not a claim that the recognizer is wrong — a tester or client
 * who says "maybe" or "I think" meant to sound uncertain, and a value
 * extracted from that speech must never be presented as confidently
 * confirmed.
 */
export const UNCERTAINTY_PHRASES: string[] = [
  "maybe",
  "not sure",
  "unsure",
  "unclear",
  "unknown",
  "possibly",
  "perhaps",
  "i think",
  "i believe",
  "might be",
  "i guess",
  "sort of",
  "cannot tell"
];

/**
 * Expected keywords per prompt step, keyed by the real step ids from
 * lib/languagePacks.ts. A step with no entry (or an empty array) is skipped
 * by the "missing expected term" rule rather than treated as a failure.
 */
export const STEP_EXPECTED_TERMS: Record<string, string[]> = {
  intro: [],
  "right-distance": ["right eye", "line", "read", "clear", "blurry", "letters", "chart"],
  "left-distance": ["left eye", "line", "read", "clear", "blurry", "letters", "chart"],
  "glasses-check": ["glasses", "wear", "have", "yes", "no", "comfortable", "uncomfortable"]
};
