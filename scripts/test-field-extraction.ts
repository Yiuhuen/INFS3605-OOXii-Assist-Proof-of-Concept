/**
 * Lightweight, dependency-free regression test for the deterministic field
 * extraction / transcript quality pipeline (lib/fieldExtraction.ts,
 * lib/transcriptQuality.ts). No test framework — plain assertions, plain
 * console output, exits non-zero on any failure so it can gate CI/builds.
 *
 * Run: npm run test:extraction
 */
import { extractFieldsFromTranscript, runFieldExtractionSelfTest } from "../lib/fieldExtraction";
import { buildLiveCapturedFields } from "../lib/liveCapturedFields";
import { qcReasons } from "../lib/qc";
import { analyseTranscriptQuality, runTranscriptQualitySelfTest } from "../lib/transcriptQuality";
import type { ExtractedFieldMap, TestRecord } from "../lib/types";

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

function liveExtract(params: { finalTranscriptText?: string; interimTranscriptText?: string; manualFallbackText?: string }) {
  return buildLiveCapturedFields({
    finalTranscriptText: params.finalTranscriptText ?? "",
    interimTranscriptText: params.interimTranscriptText ?? "",
    manualFallbackText: params.manualFallbackText ?? "",
    transcriptSegments: [],
    promptMarkers: [],
    language: "en"
  });
}

const LIVE_FIELD_COUNT = 7;

function liveCapturedCount(map: NonNullable<ReturnType<typeof liveExtract>>): number {
  return Object.values(map).filter((field) => field.status !== "Missing").length;
}

// ---------------------------------------------------------------------------
// Live "Captured so far" preview (lib/liveCapturedFields.ts) — Phase 10 cases.
// Note: glasses_selected's captured VALUE below is "+1.00", the bare diopter
// the shared extractor (lib/fieldExtraction.ts) actually produces and the
// existing "captures +1.00 conservatively" test above already locks in —
// not "+1.00 reading glasses". Asserting the richer descriptive string here
// would mean inventing new extraction behaviour never exercised anywhere
// else (CSV export, QC, Review captured fields), for a live-only preview
// that must stay a faithful glance at the same data those screens show.
// ---------------------------------------------------------------------------

cases.push({
  name: "Live 1. 'The client already has glasses.' — Current glasses Yes, 1 of 7, Glasses selected stays Missing",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The client already has glasses." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("current_glasses value", map.current_glasses.value, "Yes") ??
      expectEqual("current_glasses status", map.current_glasses.status, "Captured") ??
      expectEqual("glasses_selected status", map.glasses_selected.status, "Missing") ??
      expectEqual("count", liveCapturedCount(map), 1)
    );
  }
});

cases.push({
  name: "Live 2. Adding cataract sentence brings count to 2 of 7",
  run: () => {
    const map = liveExtract({
      finalTranscriptText: "The client already has glasses. The client has not had cataract surgery."
    });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("current_glasses value", map.current_glasses.value, "Yes") ??
      expectEqual("cataract value", map.cataract_history_confirmed.value, "No") ??
      expectEqual("cataract status", map.cataract_history_confirmed.status, "Captured") ??
      expectEqual("count", liveCapturedCount(map), 2)
    );
  }
});

cases.push({
  name: "Live 3. Right/left eye lines captured together",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The right eye can read line five. The left eye can read line four." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("right eye", map.right_eye_distance_result.value, "Line 5") ??
      expectEqual("left eye", map.left_eye_distance_result.value, "Line 4") ??
      expectEqual("right eye status", map.right_eye_distance_result.status, "Captured") ??
      expectEqual("left eye status", map.left_eye_distance_result.status, "Captured")
    );
  }
});

cases.push({
  name: "Live 4. Final line and comfort captured together",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The final readable line is line four. The glasses feel comfortable." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("final line", map.final_readable_line.value, "Line 4") ??
      expectEqual("comfort", map.comfort_response.value, "Comfortable")
    );
  }
});

cases.push({
  name: "Live 5. Glasses selected diopter captured from spoken diopter phrase",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The glasses selected are plus one point zero zero reading glasses." });
    if (!map) return "expected a non-null live captured field map";
    return expectEqual("glasses_selected", map.glasses_selected.value, "+1.00");
  }
});

cases.push({
  name: "Live 6. Current glasses and Glasses selected are never confused",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The client already has glasses." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("current_glasses", map.current_glasses.value, "Yes") ??
      expectEqual("glasses_selected value", map.glasses_selected.value, "") ??
      expectEqual("glasses_selected status", map.glasses_selected.status, "Missing")
    );
  }
});

cases.push({
  name: "Live 7. Hedge word 'maybe' downgrades an otherwise-clean match to Check",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The right eye maybe line five." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("right eye value", map.right_eye_distance_result.value, "Line 5") ??
      expectEqual("right eye status", map.right_eye_distance_result.status, "Check")
    );
  }
});

cases.push({
  name: "Live 8. A value that only exists once interim text is folded in is Check, not Captured",
  run: () => {
    const map = liveExtract({ interimTranscriptText: "right eye can read line five" });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("right eye value", map.right_eye_distance_result.value, "Line 5") ??
      expectEqual("right eye status", map.right_eye_distance_result.status, "Check")
    );
  }
});

cases.push({
  name: "Live 9. Once the same phrase lands as a final segment, status upgrades to Captured",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "The right eye can read line five.", interimTranscriptText: "the left eye" });
    if (!map) return "expected a non-null live captured field map";
    return expectEqual("right eye status once final", map.right_eye_distance_result.status, "Captured");
  }
});

cases.push({
  name: "Live 10. No transcript at all returns null (all seven fields render Missing)",
  run: () => {
    const map = liveExtract({});
    return map === null ? null : "expected null when there is no final, interim, or manual transcript text yet";
  }
});

cases.push({
  name: "Live 11. Manual fallback text is extracted, but always marked Check",
  run: () => {
    const map = liveExtract({ manualFallbackText: "The client already has glasses. The final readable line is line four." });
    if (!map) return "expected a non-null live captured field map";
    return (
      expectEqual("current_glasses value", map.current_glasses.value, "Yes") ??
      expectEqual("current_glasses status", map.current_glasses.status, "Check") ??
      expectEqual("final line status", map.final_readable_line.status, "Check")
    );
  }
});

cases.push({
  name: "Live 12. Manual fallback is ignored once real STT text exists",
  run: () => {
    const map = liveExtract({
      finalTranscriptText: "The client already has glasses.",
      manualFallbackText: "The client does not have glasses."
    });
    if (!map) return "expected a non-null live captured field map";
    // STT text wins outright per the priority order — the stale manual note
    // must not override or blend with a real transcript.
    return expectEqual("current_glasses value", map.current_glasses.value, "Yes");
  }
});

cases.push({
  name: "Live 13. Hedge word 'unknown' downgrades cataract to Check",
  run: () => {
    const map = liveExtract({ finalTranscriptText: "Cataract history unknown." });
    if (!map) return "expected a non-null live captured field map";
    return map.cataract_history_confirmed.status === "Check"
      ? null
      : `expected Check, got ${map.cataract_history_confirmed.status} (value: ${JSON.stringify(map.cataract_history_confirmed.value)})`;
  }
});

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
      // "already has glasses" is current-glasses evidence ONLY — it must never
      // leak into glasses_selected, which is the fitting-step outcome field.
      expectEqual("glasses_selected stays not captured", result.glasses_selected.value, "") ??
      (result.glasses_selected.requiresReview ? null : "expected glasses_selected (high-risk, not captured) to require review") ??
      (result.right_eye_distance_result.evidence ? null : "expected evidence to be present for right_eye_distance_result") ??
      (result.right_eye_distance_result.value !== result.left_eye_distance_result.value ? null : "right/left eye values must not be identical/swapped")
    );
  }
});

// Phase-4 fixture: current-glasses evidence alone, no selection/dispense
// language anywhere — glasses_selected must stay Unknown/not captured.
cases.push({
  name: "Current-glasses evidence never sets Glasses selected / dispensed",
  run: () => {
    const result = extract("The client already has glasses. The right eye can read line five. The left eye can read line four.");
    return (
      expectEqual("current_glasses", result.current_glasses.value, "Yes") ??
      expectEqual("glasses_selected", result.glasses_selected.value, "") ??
      expectEqual("glasses_selected source", result.glasses_selected.source, "unknown") ??
      (result.glasses_selected.requiresReview ? null : "expected glasses_selected to require review while not captured")
    );
  }
});

// Phase-4 fixture: an explicit selected-lens statement IS captured — but
// conservatively, never above medium confidence, always still needing review.
cases.push({
  name: "'Glasses selected are plus one point zero zero.' captures +1.00 conservatively",
  run: () => {
    const result = extract("Glasses selected are plus one point zero zero.");
    return (
      expectEqual("glasses_selected", result.glasses_selected.value, "+1.00") ??
      (result.glasses_selected.evidence ? null : "expected evidence for glasses_selected") ??
      (result.glasses_selected.confidence !== "high" ? null : "expected glasses_selected confidence capped below high") ??
      (result.glasses_selected.requiresReview ? null : "expected glasses_selected to require review (capped confidence)")
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

// Phase-9 case C: a tester manually edits glasses_selected from Unknown to
// "+1.00 reading glasses". The record must (1) carry a QC reason naming the
// manual high-risk edit, (2) keep the ORIGINAL extraction metadata intact in
// extracted_json while the edited copy lives in edited_extracted_json — the
// exact split app/page.tsx editExtractedField() + saveCurrentRecord() produce.
// (Auto-fill never overwriting an edited field lives in page-component
// closures and remains exercised by the browser walkthrough.)
cases.push({
  name: "C. Manual edit of high-risk glasses_selected adds a QC reason; original extraction metadata retained",
  run: () => {
    const transcript = "The client already has glasses. The right eye can read line five.";
    const extractedMap = extract(transcript);
    const extractedJson = {
      comfort_response: "",
      cataract_history_confirmed: "",
      current_glasses: "Yes",
      right_eye_distance_result: "Line 5",
      left_eye_distance_result: "",
      final_readable_line: "",
      glasses_selected: "",
      additional_notes: "",
      missing_fields: [],
      confidence_score: 0.6,
      field_confidence: extractedMap
    };
    // Mirrors editExtractedField(): edited copy gets the manual value with
    // source "manual"; the original extracted_json above is left untouched.
    const editedJson = {
      ...extractedJson,
      glasses_selected: "+1.00 reading glasses",
      field_confidence: {
        ...extractedMap,
        glasses_selected: { value: "+1.00 reading glasses", source: "manual" as const, confidence: "high" as const, requiresReview: false }
      }
    };
    const record = {
      qc_status: "Unreviewed",
      sync_status: "Local only",
      recording_status: "recorded",
      raw_transcript_text: transcript,
      unclear_segments: [],
      has_unvisited_prompts: false,
      has_unrecorded_viewed_prompts: false,
      demo_helper_used: false,
      confidence_score: 0.6,
      missing_fields: [],
      edited_by_user: true,
      transcript_quality_flags: [],
      unresolved_transcript_flag_ids: [],
      translation_review_required: false,
      corrections_applied: [],
      extraction_safety_status: "safe",
      transcript_quality_risk: "low",
      extracted_json: extractedJson,
      edited_extracted_json: editedJson,
      fields_reviewed_by_tester: false
    } as unknown as TestRecord;

    const reasons = qcReasons(record);
    return (
      (reasons.some((reason) => reason.includes("manually entered") && reason.includes("Glasses selected / dispensed"))
        ? null
        : `expected a manual high-risk QC reason for glasses_selected, got: ${JSON.stringify(reasons)}`) ??
      (reasons.some((reason) => reason.includes("Edited by tester")) ? null : "expected 'Edited by tester' QC reason") ??
      // Original extraction metadata survives separately from the edit:
      expectEqual("original glasses_selected source retained", record.extracted_json.field_confidence?.glasses_selected?.source, "unknown") ??
      (record.extracted_json.field_confidence?.current_glasses?.evidence
        ? null
        : "expected original current_glasses evidence retained in extracted_json") ??
      expectEqual("edited copy source", record.edited_extracted_json?.field_confidence?.glasses_selected?.source, "manual")
    );
  }
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
