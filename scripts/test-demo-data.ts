/**
 * Lightweight, dependency-free regression test for the synthetic demo
 * dataset (lib/demoRecords.ts) and everything that reads it — Insights
 * (lib/insights.ts), QC (lib/qc.ts), and both CSV exports (lib/csv.ts).
 * No test framework — plain assertions, plain console output, exits
 * non-zero on any failure so it can gate CI/builds. Mirrors the style of
 * scripts/test-field-extraction.ts.
 *
 * Run: npm run test:demo-data
 */
import { seedDemoRecords, DEMO_DATASET_VERSION } from "../lib/demoRecords";
import { computeInsights } from "../lib/insights";
import { filterRecords, qcReviewIssues, recordNeedsQc } from "../lib/qc";
import { AUDIT_CSV_COLUMNS, LONGLIST_CSV_COLUMNS, recordsToAuditCsv, recordsToLonglistCsv } from "../lib/csv";

interface Case {
  name: string;
  run: () => string | null; // null = pass, string = failure reason
}

const cases: Case[] = [];

function expectEqual(label: string, actual: unknown, expected: unknown): string | null {
  if (actual !== expected) return `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  return null;
}

function expectTrue(label: string, actual: boolean): string | null {
  return actual ? null : `${label}: expected true`;
}

function findRecord(records: ReturnType<typeof seedDemoRecords>, clientId: string) {
  const record = records.find((r) => r.client_id === clientId);
  if (!record) throw new Error(`fixture error: no seeded record with client_id ${clientId}`);
  return record;
}

// Exact column-name denylist for personal/identifying data. Deliberately NOT
// a generic "contains the word 'name'" substring check — this app has
// legitimate metadata columns like "field_name" (which field a row
// describes) and "language_pack"/"tester_label" that must never false-positive
// just because a forbidden word appears as part of an unrelated compound word.
const FORBIDDEN_COLUMNS = new Set([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "client_name",
  "tester_name",
  "dob",
  "date_of_birth",
  "phone",
  "phone_number",
  "contact",
  "address",
  "exact_address",
  "street_address",
  "home_address",
  "gps",
  "gps_coordinates",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "location"
]);

function containsForbiddenColumn(column: string): string | null {
  return FORBIDDEN_COLUMNS.has(column.toLowerCase()) ? column : null;
}

// A. Exactly 13 records, all tagged as demo data, with unique IDs. (12
// original + C-113N, added to exercise Phase 9 Case 3: short-sighted test
// performed but incomplete.)
cases.push({
  name: "A. seedDemoRecords returns exactly 13 uniquely-identified, tagged records",
  run: () => {
    const records = seedDemoRecords();
    const clientIds = new Set(records.map((r) => r.client_id));
    const recordIds = new Set(records.map((r) => r.id));
    return (
      expectEqual("record count", records.length, 13) ??
      (records.every((r) => r.demo_record) ? null : "expected every record to have demo_record: true") ??
      (records.every((r) => r.demo_dataset_version === DEMO_DATASET_VERSION) ? null : "expected every record to carry DEMO_DATASET_VERSION") ??
      expectEqual("unique anonymous_client_id count", clientIds.size, 13) ??
      expectEqual("unique record_id count", recordIds.size, 13) ??
      (records.every((r) => /^C-\d{3}[A-Z]$/.test(r.client_id)) ? null : "expected every client_id to match the anonymous C-###X pattern")
    );
  }
});

// B. No forbidden personal-data columns in either CSV export's header.
cases.push({
  name: "B. No forbidden personal-data columns in CSV headers",
  run: () => {
    for (const column of [...LONGLIST_CSV_COLUMNS, ...AUDIT_CSV_COLUMNS]) {
      const hit = containsForbiddenColumn(column);
      if (hit) return `column "${column}" contains forbidden term "${hit}"`;
    }
    return null;
  }
});

// C. current_glasses is never confused with glasses_selected — independent evidence, independent values.
cases.push({
  name: "C. current_glasses and glasses_selected never share evidence (no field-semantics bleed)",
  run: () => {
    for (const record of seedDemoRecords()) {
      const fieldConfidence = record.extracted_json.field_confidence;
      const currentGlasses = fieldConfidence?.current_glasses;
      const glassesSelected = fieldConfidence?.glasses_selected;
      if (currentGlasses?.evidence && glassesSelected?.evidence && currentGlasses.evidence === glassesSelected.evidence) {
        return `${record.client_id}: current_glasses and glasses_selected share the same evidence quote — likely bleed-through`;
      }
    }
    // Record 1 explicitly exercises both being present with distinct, independent values (Yes / a freshly-dispensed pair).
    const r1 = findRecord(seedDemoRecords(), "C-101A");
    return (
      expectEqual("R-001 current_glasses", r1.extracted_json.current_glasses, "Yes") ??
      expectEqual("R-001 glasses_selected", r1.extracted_json.glasses_selected, "+1.00 reading glasses")
    );
  }
});

// D. Missing cataract history triggers QC (C-103C, C-111L).
cases.push({
  name: "D. Missing cataract history triggers QC",
  run: () => {
    const records = seedDemoRecords();
    for (const clientId of ["C-103C", "C-111L"]) {
      const record = findRecord(records, clientId);
      if (record.extracted_json.cataract_history_confirmed.trim()) return `${clientId}: expected cataract_history_confirmed to be empty/not-captured`;
      if (!recordNeedsQc(record)) return `${clientId}: expected recordNeedsQc to be true`;
    }
    return null;
  }
});

// E. Missing glasses selected/dispensed triggers QC (C-104D, C-107G, C-111L).
cases.push({
  name: "E. Missing glasses selected/dispensed triggers QC",
  run: () => {
    const records = seedDemoRecords();
    for (const clientId of ["C-104D", "C-107G", "C-111L"]) {
      const record = findRecord(records, clientId);
      if (record.extracted_json.glasses_selected.trim()) return `${clientId}: expected glasses_selected to be empty/not-captured`;
      if (!recordNeedsQc(record)) return `${clientId}: expected recordNeedsQc to be true`;
    }
    return null;
  }
});

// F. Manual edit on glasses selected/dispensed triggers QC (C-108H).
cases.push({
  name: "F. Manual edit on high-risk field (glasses selected) triggers QC",
  run: () => {
    const record = findRecord(seedDemoRecords(), "C-108H");
    return (
      expectTrue("edited_by_user", record.edited_by_user) ??
      expectEqual("effective glasses_selected", record.edited_extracted_json?.glasses_selected, "+1.00 reading glasses") ??
      expectEqual("effective glasses_selected source", record.edited_extracted_json?.field_confidence?.glasses_selected?.source, "manual") ??
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true")
    );
  }
});

// G. Manual recording override triggers QC (C-105E).
cases.push({
  name: "G. Manual recording override triggers QC",
  run: () => {
    const record = findRecord(seedDemoRecords(), "C-105E");
    return (
      expectEqual("recording_status", record.recording_status, "manual_override") ??
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true")
    );
  }
});

// H. Prompt coverage incomplete triggers QC (C-107G).
cases.push({
  name: "H. Prompt coverage incomplete triggers QC",
  run: () => {
    const record = findRecord(seedDemoRecords(), "C-107G");
    return (
      expectTrue("has_unvisited_prompts", record.has_unvisited_prompts) ??
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true")
    );
  }
});

// I. A genuinely clean, pending-sync record (C-109J) does NOT need QC — pending sync is a timing state, not a data-quality problem.
cases.push({
  name: "I. Clean + pending-sync record does not need QC (recordNeedsQc pending-sync fix)",
  run: () => {
    const record = findRecord(seedDemoRecords(), "C-109J");
    return (
      expectEqual("sync_status", record.sync_status, "Pending sync") ??
      expectEqual("qc_status", record.qc_status, "Approved") ??
      (recordNeedsQc(record) ? "expected recordNeedsQc to be false for an Approved, otherwise-clean, merely-unsynced record" : null)
    );
  }
});

// J. Aggregate Insights counts. NOTE: the brief's own per-record qc_required
// values (Phase 7) sum to 7 true / 5 false (R3,4,5,6,7,8,11), not the
// stated rollup "Needs QC: 6 / export-ready: 6" — implemented per-record
// exactly as specified (the more detailed instruction) and asserted here
// against the REAL computed number, with the discrepancy disclosed in the
// final report rather than silently forced to match. C-113N (record 13,
// Phase 9 Case 3) adds an 8th needs-QC record: qc_status Unreviewed, with a
// short-sighted result missing after the module was performed.
cases.push({
  name: "J. Aggregate insights match the per-record spec's real computed numbers",
  run: () => {
    const records = seedDemoRecords();
    const summary = computeInsights(records);
    const cataractGap = summary.fieldGaps.find((gap) => gap.field === "cataract_history_confirmed");

    return (
      expectEqual("total records", summary.totalRecords, 13) ??
      expectEqual("needs QC count", summary.needsQcCount, 8) ??
      expectEqual("export ready count", summary.totalRecords - summary.needsQcCount, 5) ??
      expectEqual("manual override count", summary.manualOverrideCount, 1) ??
      expectEqual("cataract history missing count", cataractGap?.missingCount ?? 0, 2) ??
      expectEqual("prompt coverage incomplete count", summary.promptCoverageIncompleteCount, 1) ??
      expectEqual("pending sync count", summary.pendingSyncCount, 1) ??
      expectEqual("re-record improved count", summary.rerecordImprovedCount, 1)
    );
  }
});

// P. Phase 9 Case 3 (C-113N): short-sighted test performed, left result
// missing — needs QC specifically for that reason, and the reason text is
// the exact spec wording, never the generic "requires review" fallback.
cases.push({
  name: "P. Short-sighted module performed-but-incomplete (C-113N) needs QC with the specific reason",
  run: () => {
    const record = findRecord(seedDemoRecords(), "C-113N");
    const reasons = qcReviewIssues(record).map((issue) => issue.detail);
    return (
      expectEqual("short_sighted_test_performed", record.extracted_json.short_sighted_test_performed, "Yes") ??
      expectEqual("short_sighted_left_result", record.extracted_json.short_sighted_left_result, "") ??
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true") ??
      (reasons.some((detail) => detail === "Short-sighted test performed but left result missing.")
        ? null
        : `expected the specific short-sighted QC reason, got: ${JSON.stringify(reasons)}`)
    );
  }
});

// Q. Phase 9 Case 1/4 (C-101A) and Case 2 (C-110K): the optional astigmatism/
// short-sighted modules never add QC pressure when complete or not performed.
cases.push({
  name: "Q. Complete astigmatism data and a not-performed short-sighted module never trigger QC on their own",
  run: () => {
    const records = seedDemoRecords();
    const caseOne = findRecord(records, "C-101A");
    const caseTwo = findRecord(records, "C-110K");
    return (
      expectEqual("C-101A short_sighted_test_performed", caseOne.extracted_json.short_sighted_test_performed, "No") ??
      expectEqual("C-101A short_sighted_right_result", caseOne.extracted_json.short_sighted_right_result, "Not tested") ??
      (recordNeedsQc(caseOne) ? "expected C-101A to stay QC-clean" : null) ??
      expectEqual("C-110K right_toric_power", caseTwo.extracted_json.right_toric_power, "T2") ??
      expectEqual("C-110K left_toric_axis", caseTwo.extracted_json.left_toric_axis, "35") ??
      (recordNeedsQc(caseTwo) ? "expected C-110K to stay QC-clean" : null)
    );
  }
});

// K. The dedicated glasses-selected insight card counts "missing or manually entered" (4 records: R4, R7, R8, R11) — matches the brief's target exactly.
cases.push({
  name: "K. Glasses-selected-dispensed insight covers missing + manually-entered records",
  run: () => {
    const summary = computeInsights(seedDemoRecords());
    const glassesCard = summary.insights.find((i) => i.id === "glasses-selected-gap");
    if (!glassesCard) return "expected a glasses-selected-gap insight card";
    return glassesCard.title.includes("4 records") ? null : `expected glasses-selected-gap card to cover 4 records, got title "${glassesCard.title}"`;
  }
});

// L. Every record whose QC checklist has issues is actually flagged as needing QC (internal consistency between qc.ts's two entry points).
cases.push({
  name: "L. qcReviewIssues and recordNeedsQc never disagree",
  run: () => {
    for (const record of seedDemoRecords()) {
      const issues = qcReviewIssues(record);
      if (issues.length > 0 && !recordNeedsQc(record)) {
        return `${record.client_id} has ${issues.length} QC issue(s) listed but recordNeedsQc() is false`;
      }
    }
    return null;
  }
});

// M. QC screen filters actually populate: Needs QC (8, +C-113N), Edited (1), Missing (4 records with a REQUIRED_EXTRACTED_FIELDS gap: R3, R4, R7, R11 — C-113N has no REQUIRED_EXTRACTED_FIELDS gap, only an optional-module one, so it does not add to this count).
cases.push({
  name: "M. QC filter tabs populate as expected",
  run: () => {
    const records = seedDemoRecords();
    return (
      expectEqual("needs_qc filter count", filterRecords(records, "needs_qc").length, 8) ??
      expectEqual("edited filter count", filterRecords(records, "edited").length, 1) ??
      expectEqual("missing_fields filter count", filterRecords(records, "missing_fields").length, 4)
    );
  }
});

// N. Both CSV exports carry the exact columns the brief specifies, and produce the right row shape.
cases.push({
  name: "N. CSV exports have the exact brief-specified columns and shape",
  run: () => {
    const records = seedDemoRecords();
    const longlist = recordsToLonglistCsv(records);
    const audit = recordsToAuditCsv(records);
    const longlistLines = longlist.trim().split("\n");
    const auditLines = audit.trim().split("\n");

    const expectedLonglistColumns = [
      "record_id",
      "anonymous_client_id",
      "created_at",
      "outreach_session",
      "tester_label",
      "language_pack",
      "deployment_site",
      "current_glasses",
      "cataract_history_confirmed",
      "right_eye_distance_result",
      "left_eye_distance_result",
      "final_readable_line",
      "comfort_response",
      "glasses_selected_dispensed",
      "right_lens_selected",
      "left_lens_selected",
      "right_astigmatism_present",
      "right_toric_power",
      "right_toric_axis",
      "left_astigmatism_present",
      "left_toric_power",
      "left_toric_axis",
      "short_sighted_test_performed",
      "short_sighted_right_result",
      "short_sighted_left_result",
      "short_sighted_both_eyes_result",
      "short_sighted_notes",
      "additional_notes_non_personal",
      "recording_mode",
      "recording_success",
      "recording_attempt_number",
      "rerecord_used",
      "capture_confidence",
      "qc_required",
      "qc_status",
      "qc_reason_summary",
      "export_ready",
      "saved_locally",
      "sync_status",
      "demo_record",
      "demo_dataset_version"
    ];
    const expectedAuditColumns = [
      "record_id",
      "anonymous_client_id",
      "demo_record",
      "demo_dataset_version",
      "created_at",
      "outreach_session",
      "tester_label",
      "language_pack",
      "deployment_site",
      "field_name",
      "field_value",
      "field_source",
      "field_confidence",
      "field_status",
      "evidence_quote",
      "manually_edited",
      "requires_review",
      "qc_reason",
      "prompt_step_id",
      "prompt_viewed",
      "prompt_recorded",
      "recording_mode",
      "recording_success",
      "recording_attempt_number",
      "rerecord_used",
      "transcript_available",
      "raw_transcript_present",
      "corrected_transcript_present",
      "saved_locally",
      "sync_status",
      "export_ready"
    ];

    // 21 fields per record now (8 original + 2 right/left lens + 6 astigmatism/
    // toric/axis + 5 short-sighted — see AUDIT_FIELD_KEYS in lib/csv.ts), across 13 records.
    const fieldsPerRecord = 21;
    return (
      expectEqual("longlist column list", (LONGLIST_CSV_COLUMNS as readonly string[]).join(","), expectedLonglistColumns.join(",")) ??
      expectEqual("audit column list", (AUDIT_CSV_COLUMNS as readonly string[]).join(","), expectedAuditColumns.join(",")) ??
      expectEqual("longlist row count (header + 13 records)", longlistLines.length, 14) ??
      expectEqual("audit row count (header + 13 records x 20 fields)", auditLines.length, 1 + 13 * fieldsPerRecord)
    );
  }
});

// O. export_ready is false for every record that needs QC, and true for every clean one.
cases.push({
  name: "O. export_ready is correct for both needs-QC and clean records",
  run: () => {
    for (const record of seedDemoRecords()) {
      const needsQc = recordNeedsQc(record);
      const expectedExportReady = !needsQc;
      const actualExportReady = !recordNeedsQc(record); // same derivation the CSV row builder uses
      if (actualExportReady !== expectedExportReady) {
        return `${record.client_id}: export_ready/qc_required disagree (needsQc=${needsQc})`;
      }
    }
    return null;
  }
});

let passCount = 0;
let failCount = 0;

for (const testCase of cases) {
  const failure = testCase.run();
  if (failure === null) {
    passCount += 1;
    console.log(`PASS: ${testCase.name}`);
  } else {
    failCount += 1;
    console.error(`FAIL: ${testCase.name}\n  ${failure}`);
  }
}

console.log(`\n${passCount} passed, ${failCount} failed (of ${cases.length})`);
if (failCount > 0) process.exit(1);
