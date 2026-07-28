/**
 * ---------------------------------------------------------------------------
 * Transcript highlighting — number/result-related phrase spotting.
 * ---------------------------------------------------------------------------
 * Pure text matching only, no AI/network calls (same cost-safe design note as
 * lib/fieldExtraction.ts). Used so a reviewer can scan a long transcript for
 * the clinically significant sections (line numbers, eye side, diopters,
 * comfort, cataract, glasses selected) instead of re-reading or re-listening
 * to the whole recording — and so a captured field can jump straight to its
 * supporting evidence phrase (see HighlightedTranscript component).
 * ---------------------------------------------------------------------------
 */

const NUMBER_WORD_ALT = "zero|one|two|three|four|five|six|seven|eight|nine|ten";

/** Broad, display-only phrase spotting — deliberately wider net than lib/fieldExtraction.ts's strict clinical parsing, since this only highlights, never extracts a value. */
const HIGHLIGHT_PATTERNS: RegExp[] = [
  new RegExp(`\\bline\\s*(?:number\\s*)?(?:\\d+|${NUMBER_WORD_ALT})\\b`, "gi"),
  /\b(right|left)\s+eye\b/gi,
  /\bfinal\s+(?:readable\s+)?line\b/gi,
  /\b(un)?comfortable\b/gi,
  /\bunclear\b/gi,
  /\bcataracts?(?:\s+surgery)?\b/gi,
  /\bglasses\b[^.\n]{0,20}?\b(selected|dispensed)\b/gi,
  /\b(selected|dispensed)\b[^.\n]{0,20}?\bglasses\b/gi,
  /\bdispensed\b/gi,
  new RegExp(`[+-]\\s?\\d+(?:\\.\\d+)?`, "g"),
  // Spoken diopters may carry several digits after "point" ("plus one point
  // zero zero", "plus zero point seven five") — match every trailing number
  // word so the whole spoken value highlights, not just the first digit.
  new RegExp(`\\b(plus|minus)\\s+(?:${NUMBER_WORD_ALT})(?:\\s+point(?:\\s+(?:${NUMBER_WORD_ALT}))+)?\\b`, "gi")
];

export type HighlightToken = {
  text: string;
  /** "plain" — no match. "pattern" — matched a general highlight pattern (line/eye/diopter/etc). "focus" — matched the specific evidence phrase this token stream was asked to spotlight. */
  kind: "plain" | "pattern" | "focus";
};

interface Range {
  start: number;
  end: number;
  kind: "pattern" | "focus";
}

/**
 * Builds non-overlapping highlight ranges for `text`. `focusPhrase` (an
 * evidence quote from FieldConfidence.evidence) always wins over a general
 * pattern match at the same position — a reviewer jumping to "right eye can
 * read line five" should see that whole phrase highlighted as the answer,
 * not just the "line five" fragment inside it.
 */
function buildRanges(text: string, focusPhrase?: string): Range[] {
  const ranges: Range[] = [];

  if (focusPhrase && focusPhrase.trim()) {
    const needle = focusPhrase.trim().toLowerCase();
    const haystack = text.toLowerCase();
    let fromIndex = 0;
    while (fromIndex <= haystack.length) {
      const index = haystack.indexOf(needle, fromIndex);
      if (index === -1) break;
      ranges.push({ start: index, end: index + needle.length, kind: "focus" });
      fromIndex = index + needle.length;
    }
  }

  for (const pattern of HIGHLIGHT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      ranges.push({ start: match.index, end: match.index + match[0].length, kind: "pattern" });
    }
  }

  // Sort by start, then prefer "focus" and longer matches when ranges tie/overlap.
  ranges.sort((a, b) => a.start - b.start || (a.kind === b.kind ? b.end - a.end : a.kind === "focus" ? -1 : 1));

  const nonOverlapping: Range[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    nonOverlapping.push(range);
    cursor = range.end;
  }
  return nonOverlapping;
}

/** Tokenizes `text` into plain/pattern/focus segments for rendering — see components/TranscriptHighlight.tsx. */
export function tokenizeTranscript(text: string, focusPhrase?: string): HighlightToken[] {
  if (!text) return [];
  const ranges = buildRanges(text, focusPhrase);
  if (ranges.length === 0) return [{ text, kind: "plain" }];

  const tokens: HighlightToken[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) tokens.push({ text: text.slice(cursor, range.start), kind: "plain" });
    tokens.push({ text: text.slice(range.start, range.end), kind: range.kind });
    cursor = range.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor), kind: "plain" });
  return tokens;
}

/** True when `text` contains at least one general highlight-pattern match — used to decide whether it's worth rendering the highlighted view at all. */
export function hasHighlightableContent(text: string): boolean {
  return HIGHLIGHT_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
