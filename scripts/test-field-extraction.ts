/**
 * Lightweight, dependency-free regression test for the deterministic field
 * extraction / transcript quality pipeline (lib/fieldExtraction.ts,
 * lib/transcriptQuality.ts). No test framework — plain assertions, plain
 * console output, exits non-zero on any failure so it can gate CI/builds.
 *
 * Run: npm run test:extraction
 */
import { extractFieldsFromTranscript, runFieldExtractionSelfTest } from "../lib/fieldExtraction";
import { analyseTranscriptQuality, runTranscriptQualitySelfTest } from "../lib/transcriptQuality";
import type { ExtractedFieldMap } from "../lib/types";

interface Case {
  name: string;
  run: () => string | null; // null = pass, string = failure reason
}

const cases: Case[] = [];

function extract(rawTranscriptText: string, extra: Partial<Parameters<typeof extractFieldsFromTranscript>[0]> = {}): ExtractedFieldMap {
  return extractFieldsFromTranscript({
    rawTranscriptText,
    transcriptSegments: [],
    promptMarkers: [],
    language: "en",
    ...extra
  });
}

function expectEqual(label: string, actual: unknown, expected: unknown): string | null {
  if (actual !== expected) return `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  return null;
}

// A. Clear transcript — the exact task-brief fixture (client already has
// glasses, right eye line 5, left eye line 4, comfortable, explicit final line).
cases.push({
  name: "A. Clear transcript — full worked example",
  run: () => {
    const result = extract(
      "The client already has glasses. The right eye can read line five. The left eye can read line four. The client feels comfortable. The final readable line is line four."
    );
    return (
      expectEqual("current_glasses", result.current_glasses.value, "Yes") ??
      expectEqual("right_eye_distance_result", result.right_eye_distance_result.value, "Line 5") ??
      expectEqual("left_eye_distance_result", result.left_eye_distance_result.value, "Line 4") ??
      expectEqual("comfort_response", result.comfort_response.value, "Comfortable") ??
      expectEqual("final_readable_line", result.final_readable_line.value, "Line 4") ??
      (result.right_eye_distance_result.evidence ? null : "expected evidence to be present for right_eye_distance_result") ??
      (result.right_eye_distance_result.value !== result.left_eye_distance_result.value ? null : "right/left eye values must not be identical/swapped")
    );
  }
});

// B. Eye/line pairing without an explicit connector phrase — must not swap sides.
cases.push({
  name: "B. Line six with the right eye and line five with the left eye (no swap)",
  run: () => {
    const result = extract("Line six with the right eye and line five with the left eye.");
    return (
      expectEqual("right_eye_distance_result", result.right_eye_distance_result.value, "Line 6") ??
      expectEqual("left_eye_distance_result", result.left_eye_distance_result.value, "Line 5")
    );
  }
});

// C. STT misrecognition ("classes" -> glasses, "write eye" -> right eye) — must
// flag for review, not confidently resolve, and never touch the raw transcript.
cases.push({
  name: "C. STT misrecognition — 'classes' / 'write eye' flagged, not confidently resolved",
  run: () => {
    const rawTranscriptText = "The client has classes. The write eye reads line five.";
    const qualityReport = analyseTranscriptQuality({ rawText: rawTranscriptText, segments: [], language: "en" });
    const result = extract(rawTranscriptText, { transcriptQualityReport: qualityReport });
    return (
      (qualityReport.flags.some((flag) => flag.type === "possible_misrecognition") ? null : "expected a possible_misrecognition flag") ??
      (qualityReport.requiresQc ? null : "expected requiresQc true") ??
      (result.current_glasses.confidence === "low" && result.current_glasses.requiresReview ? null : "expected current_glasses low-confidence + requiresReview") ??
      (result.right_eye_distance_result.confidence !== "high" && result.right_eye_distance_result.requiresReview
        ? null
        : "expected right_eye_distance_result not confidently high, requiresReview true") ??
      (rawTranscriptText === "The client has classes. The write eye reads line five." ? null : "raw transcript source string must be unchanged")
    );
  }
});

// D. Negation ambiguity — "can see" and "cannot see" both present.
cases.push({
  name: "D. Negation ambiguity — 'can see' vs 'cannot see' forces QC, no confident extraction",
  run: () => {
    const rawTranscriptText = "The client can see line five. The client cannot see line five.";
    const qualityReport = analyseTranscriptQuality({ rawText: rawTranscriptText, segments: [], language: "en" });
    return (
      (qualityReport.flags.some((flag) => flag.type === "ambiguous_negation") ? null : "expected ambiguous_negation flag") ??
      expectEqual("overallRisk", qualityReport.overallRisk, "high") ??
      (qualityReport.requiresQc ? null : "expected requiresQc true")
    );
  }
});

// E. Comfortable vs uncomfortable — must never extract the positive value
// when only the negative was said.
cases.push({
  name: "E. 'The client is uncomfortable.' extracts Uncomfortable, never Comfortable",
  run: () => {
    const result = extract("The client is uncomfortable.");
    return expectEqual("comfort_response", result.comfort_response.value, "Uncomfortable");
  }
});

// Explicit final line, independent of eye-line values.
cases.push({
  name: "Explicit final readable line statement",
  run: () => {
    const result = extract("The final readable line is line six.");
    return expectEqual("final_readable_line", result.final_readable_line.value, "Line 6");
  }
});

// Comfortable alone (no negative form present) — sanity check the positive path.
cases.push({
  name: "Comfortable alone extracts Comfortable",
  run: () => {
    const result = extract("The client feels comfortable wearing the glasses.");
    return expectEqual("comfort_response", result.comfort_response.value, "Comfortable");
  }
});

// Empty transcript — every high-risk field must stay unknown/empty and flagged for review.
cases.push({
  name: "Empty transcript — all high-risk fields empty + requiresReview",
  run: () => {
    const result = extract("");
    const highRiskKeys: Array<keyof ExtractedFieldMap> = [
      "right_eye_distance_result",
      "left_eye_distance_result",
      "final_readable_line",
      "glasses_selected",
      "cataract_history_confirmed",
      "comfort_response"
    ];
    for (const key of highRiskKeys) {
      if (result[key].value !== "") return `expected ${key} to stay empty on an empty transcript`;
      if (!result[key].requiresReview) return `expected ${key}.requiresReview true on an empty transcript`;
    }
    return null;
  }
});

// Corrected transcript must take priority over the raw transcript when both are present.
cases.push({
  name: "Corrected transcript takes priority over raw transcript",
  run: () => {
    const result = extract("The right eye can read line five.", {
      correctedTranscriptText: "The right eye can read line seven."
    });
    return (
      expectEqual("right_eye_distance_result", result.right_eye_distance_result.value, "Line 7") ??
      expectEqual("source", result.right_eye_distance_result.source, "corrected_transcript")
    );
  }
});

// Left/right eye separation stays independent across separate sentences —
// regression guard against a shared/overlapping match window.
cases.push({
  name: "Left/right eye values stay independently correct across separate sentences",
  run: () => {
    const result = extract("The right eye can read line five. The left eye can read line four.");
    return (
      expectEqual("right_eye_distance_result", result.right_eye_distance_result.value, "Line 5") ??
      expectEqual("right_eye_distance_result confidence", result.right_eye_distance_result.confidence, "high") ??
      expectEqual("left_eye_distance_result", result.left_eye_distance_result.value, "Line 4") ??
      expectEqual("left_eye_distance_result confidence", result.left_eye_distance_result.confidence, "high")
    );
  }
});

// Manual-edit protection: app/page.tsx editExtractedField() marks a field
// source "manual" and autoFillFromTranscript() never overwrites a field the
// tester has already hand-edited (fieldEditedByUser). That gating lives in
// the page component's closures, not a standalone exported function, so it
// isn't unit-testable here — it is exercised directly in the Phase 6 manual
// browser walkthrough (edit a high-risk field, then run Auto-fill again, and
// confirm the typed value survives unchanged).
cases.push({
  name: "Manual edit protection (documented, exercised via browser walkthrough — see comment above)",
  run: () => null
});

function runSuite(name: string, results: Array<{ name: string; passed: boolean; detail?: string }>): boolean {
  console.log(`\n${name}`);
  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  [${status}] ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
    if (!result.passed) allPassed = false;
  }
  return allPassed;
}

function main() {
  let allPassed = true;

  // Reuse the two in-code self-test suites already shipped in
  // lib/fieldExtraction.ts and lib/transcriptQuality.ts — this proves they're
  // actually wired up and run, not just present as dead dev-only code.
  const fieldSelfTest = runFieldExtractionSelfTest();
  allPassed = runSuite("lib/fieldExtraction.ts — runFieldExtractionSelfTest()", fieldSelfTest.results) && allPassed;

  const qualitySelfTest = runTranscriptQualitySelfTest();
  allPassed = runSuite("lib/transcriptQuality.ts — runTranscriptQualitySelfTest()", qualitySelfTest.results) && allPassed;

  const briefResults = cases.map((testCase) => {
    let detail: string | undefined;
    let passed: boolean;
    try {
      const failure = testCase.run();
      passed = failure === null;
      detail = failure ?? undefined;
    } catch (error) {
      passed = false;
      detail = error instanceof Error ? error.message : String(error);
    }
    return { name: testCase.name, passed, detail };
  });
  allPassed = runSuite("scripts/test-field-extraction.ts — task-brief cases (A-E) + extras", briefResults) && allPassed;

  const total = fieldSelfTest.results.length + qualitySelfTest.results.length + briefResults.length;
  const failed = [...fieldSelfTest.results, ...qualitySelfTest.results, ...briefResults].filter((result) => !result.passed).length;
  console.log(`\n${total - failed}/${total} passed.`);

  if (!allPassed) {
    console.error("\nFAIL: one or more field extraction / transcript quality tests failed.");
    process.exit(1);
  }
  console.log("\nPASS: all field extraction / transcript quality tests passed.");
}

main();
