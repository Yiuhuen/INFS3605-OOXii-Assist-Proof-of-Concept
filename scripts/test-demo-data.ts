/**
 * Lightweight, dependency-free regression test for the 6-record sample
 * dataset (lib/demoRecords.ts) and both longlist exports (lib/csv.ts),
 * covering the export/demo spec's test matrix:
 *   1. OOXii Data Longlist — one row per record
 *   2. Full Audit Longlist — one row per field
 *   3. Right/left lens split
 *   4. Astigmatism/toric/axis fields
 *   5. Optional short-sighted test not performed → "Not tested", no QC
 *   6. Optional short-sighted test performed but incomplete → QC with reason
 *   7. Manual reviewed correction → audit trail preserved
 *   8. Privacy guard — no personal-data columns
 * No test framework — plain assertions, plain console output, exits non-zero
 * on any failure so it can gate CI/builds. Mirrors the style of
 * scripts/test-field-extraction.ts.
 *
 * Run: npm run test:demo-data (alias: npm run test:exports)
 */
import { seedDemoRecords, DEMO_DATASET_VERSION } from "../lib/demoRecords";
import { computeInsights } from "../lib/insights";
import { qcReasonSummary, qcReviewIssues, recordNeedsQc } from "../lib/qc";
import {
  AUDIT_CSV_COLUMNS,
  AUDIT_FIELD_KEYS,
  FORBIDDEN_EXPORT_COLUMNS,
  LONGLIST_CSV_COLUMNS,
  assertNoPersonalFields,
  buildFullAuditLonglist,
  buildOoxiiDataLonglist,
  recordsToAuditCsv,
  recordsToLonglistCsv
} from "../lib/csv";
import type { LonglistTable } from "../lib/csv";

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

/** Cell lookup helpers over the structured longlist tables (no CSV string parsing). */
function col(table: LonglistTable, name: string): number {
  const index = table.columns.indexOf(name);
  if (index === -1) throw new Error(`fixture error: column ${name} not found`);
  return index;
}

function dataRow(table: LonglistTable, clientId: string) {
  const row = table.rows.find((r) => r[col(table, "client_id")] === clientId);
  if (!row) throw new Error(`fixture error: no data row for ${clientId}`);
  return (name: string) => row[col(table, name)];
}

function auditRow(table: LonglistTable, clientId: string, fieldName: string) {
  const row = table.rows.find((r) => r[col(table, "client_id")] === clientId && r[col(table, "field_name")] === fieldName);
  if (!row) throw new Error(`fixture error: no audit row for ${clientId}/${fieldName}`);
  return (name: string) => row[col(table, name)];
}

// A. Exactly 6 sample records — one per presentation case — all tagged, unique, anonymous.
cases.push({
  name: "A. seedDemoRecords returns exactly 6 uniquely-identified, tagged sample records",
  run: () => {
    const records = seedDemoRecords();
    const clientIds = new Set(records.map((r) => r.client_id));
    const recordIds = new Set(records.map((r) => r.id));
    return (
      expectEqual("record count", records.length, 6) ??
      (records.every((r) => r.demo_record) ? null : "expected every record to have demo_record: true") ??
      (records.every((r) => r.demo_dataset_version === DEMO_DATASET_VERSION) ? null : "expected every record to carry DEMO_DATASET_VERSION") ??
      expectEqual("unique client_id count", clientIds.size, 6) ??
      expectEqual("unique record_id count", recordIds.size, 6) ??
      (records.every((r) => /^C-\d{3}[A-Z]$/.test(r.client_id)) ? null : "expected every client_id to match the generated C-###X pattern")
    );
  }
});

// B. Export-screen rollup: 6 records · 3 ready for export · 3 need review · 1 pending sync.
cases.push({
  name: "B. Status rollup — 3 ready, 3 need review, 1 pending sync",
  run: () => {
    const records = seedDemoRecords();
    const needsQc = records.filter(recordNeedsQc).length;
    const pending = records.filter((r) => r.sync_status === "Pending sync").length;
    return (
      expectEqual("needs review count", needsQc, 3) ??
      expectEqual("ready for export count", records.length - needsQc, 3) ??
      expectEqual("pending sync count", pending, 1)
    );
  }
});

// Test 1 — OOXii Data Longlist: one row per record.
cases.push({
  name: "1. OOXii Data Longlist has one row per record",
  run: () => {
    const records = seedDemoRecords();
    const table = buildOoxiiDataLonglist(records);
    const csvLines = recordsToLonglistCsv(records).trim().split("\n");
    return (
      expectEqual("table row count", table.rows.length, 6) ??
      expectEqual("csv line count (header + 6 records)", csvLines.length, 7)
    );
  }
});

// Test 2 — Full Audit Longlist: one row per (record, field) pair.
cases.push({
  name: "2. Full Audit Longlist has one row per captured/reviewed field",
  run: () => {
    const records = seedDemoRecords();
    const table = buildFullAuditLonglist(records);
    const csvLines = recordsToAuditCsv(records).trim().split("\n");
    const fieldsPerRecord = AUDIT_FIELD_KEYS.length; // 22 tracked fields
    return (
      expectEqual("fields per record", fieldsPerRecord, 22) ??
      expectEqual("audit row count (6 records x 22 fields)", table.rows.length, 6 * fieldsPerRecord) ??
      expectEqual("csv line count", csvLines.length, 1 + 6 * fieldsPerRecord)
    );
  }
});

// Test 3 — right/left lens data is split, never a single ambiguous column.
cases.push({
  name: "3. Right/left lens columns are split",
  run: () => {
    const columns = LONGLIST_CSV_COLUMNS as readonly string[];
    const table = buildOoxiiDataLonglist(seedDemoRecords());
    const r1 = dataRow(table, "C-811W");
    return (
      expectTrue("right_lens_selected column exists", columns.includes("right_lens_selected")) ??
      expectTrue("left_lens_selected column exists", columns.includes("left_lens_selected")) ??
      expectTrue("no bare glasses_selected column", !columns.includes("glasses_selected")) ??
      expectEqual("C-811W right lens", r1("right_lens_selected"), "+1.00") ??
      expectEqual("C-811W left lens", r1("left_lens_selected"), "+1.50")
    );
  }
});

// Test 4 — astigmatism/toric/axis fields exist and carry Case 2's values.
cases.push({
  name: "4. Astigmatism, toric power and axis fields per eye",
  run: () => {
    const columns = LONGLIST_CSV_COLUMNS as readonly string[];
    for (const column of ["right_astigmatism", "right_toric_power", "right_axis", "left_astigmatism", "left_toric_power", "left_axis"]) {
      if (!columns.includes(column)) return `missing column ${column}`;
    }
    const table = buildOoxiiDataLonglist(seedDemoRecords());
    const r2 = dataRow(table, "C-274K");
    return (
      expectEqual("C-274K right astigmatism", r2("right_astigmatism"), "Yes") ??
      expectEqual("C-274K right toric power", r2("right_toric_power"), "T2") ??
      expectEqual("C-274K right axis", r2("right_axis"), "90") ??
      expectEqual("C-274K left astigmatism", r2("left_astigmatism"), "Yes") ??
      expectEqual("C-274K left toric power", r2("left_toric_power"), "T1.5") ??
      expectEqual("C-274K left axis", r2("left_axis"), "85") ??
      (recordNeedsQc(findRecord(seedDemoRecords(), "C-274K")) ? "expected reviewed astigmatism record C-274K to stay QC-clean" : null)
    );
  }
});

// Test 5 — Case 4: short-sighted test explicitly not performed → "Not tested", never blank, no QC.
cases.push({
  name: "5. Short-sighted not performed exports 'Not tested', not blank, with no QC pressure",
  run: () => {
    const records = seedDemoRecords();
    const record = findRecord(records, "C-489T");
    const data = dataRow(buildOoxiiDataLonglist(records), "C-489T");
    const audit = buildFullAuditLonglist(records);
    const rightRow = auditRow(audit, "C-489T", "short_sighted_right_result");
    return (
      expectEqual("short_sighted_test_performed", data("short_sighted_test_performed"), "No") ??
      expectEqual("short_sighted_right_result", data("short_sighted_right_result"), "Not tested") ??
      expectEqual("short_sighted_left_result", data("short_sighted_left_result"), "Not tested") ??
      expectEqual("short_sighted_notes_status", data("short_sighted_notes_status"), "Not tested") ??
      expectEqual("audit field_status", rightRow("field_status"), "not_tested") ??
      expectEqual("audit field_source", rightRow("field_source"), "not_applicable") ??
      expectEqual("audit requires_review", rightRow("requires_review"), false) ??
      expectEqual("audit qc_reason", rightRow("qc_reason"), "") ??
      (recordNeedsQc(record) ? "expected C-489T (pending sync, approved) to be export ready" : null) ??
      expectEqual("export_ready", data("export_ready"), true) ??
      expectEqual("pending_sync", data("pending_sync"), true)
    );
  }
});

// Test 6 — Case 5: short-sighted performed but incomplete → Missing + QC with the specific reason.
cases.push({
  name: "6. Short-sighted performed-but-incomplete needs QC with a clear reason",
  run: () => {
    const records = seedDemoRecords();
    const record = findRecord(records, "C-560M");
    const data = dataRow(buildOoxiiDataLonglist(records), "C-560M");
    const leftRow = auditRow(buildFullAuditLonglist(records), "C-560M", "short_sighted_left_result");
    const reasons = qcReviewIssues(record).map((issue) => issue.detail);
    return (
      expectEqual("short_sighted_test_performed", data("short_sighted_test_performed"), "Yes") ??
      expectEqual("short_sighted_left_result", data("short_sighted_left_result"), "Missing") ??
      expectEqual("short_sighted_both_eyes_result", data("short_sighted_both_eyes_result"), "Line 5") ??
      expectEqual("audit field_status", leftRow("field_status"), "missing") ??
      expectEqual("audit requires_review", leftRow("requires_review"), true) ??
      expectEqual("audit qc_reason", leftRow("qc_reason"), "Short-sighted test performed but left result missing.") ??
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true") ??
      expectEqual("qc_required", data("qc_required"), true) ??
      (String(data("qc_reason_summary")).toLowerCase().includes("left result missing")
        ? null
        : `expected qc_reason_summary to explain the missing left result, got "${data("qc_reason_summary")}"`) ??
      (reasons.some((detail) => detail === "Short-sighted test performed but left result missing.")
        ? null
        : `expected the specific short-sighted QC reason, got: ${JSON.stringify(reasons)}`)
    );
  }
});

// Test 7 — Case 6: manual reviewed correction preserves the audit trail.
cases.push({
  name: "7. Manual reviewed correction — source, original value and evidence preserved",
  run: () => {
    const records = seedDemoRecords();
    const record = findRecord(records, "C-638R");
    const row = auditRow(buildFullAuditLonglist(records), "C-638R", "final_readable_line");
    return (
      expectTrue("edited_by_user", record.edited_by_user) ??
      expectEqual("original extraction preserved in extracted_json", record.extracted_json.final_readable_line, "Line 2") ??
      expectEqual("effective value", record.edited_extracted_json?.final_readable_line, "Line 3") ??
      expectEqual("audit manually_edited", row("manually_edited"), true) ??
      expectEqual("audit field_source", row("field_source"), "reviewed_manual_entry") ??
      expectEqual("audit original_extracted_value", row("original_extracted_value"), "Line 2") ??
      expectEqual("audit reviewed_value", row("reviewed_value"), "Line 3") ??
      expectEqual("audit reviewer_action", row("reviewer_action"), "corrected_value") ??
      (String(row("evidence_quote")).includes("hard to hear") ? null : `expected the original evidence quote to survive the edit, got "${row("evidence_quote")}"`) ??
      (recordNeedsQc(record) ? null : "expected the corrected-but-not-yet-approved record to still count as needing review")
    );
  }
});

// Test 8 — privacy guard: no personal-data columns in either export, and the runtime guard actually throws.
cases.push({
  name: "8. Privacy guard — no personal columns, runtime guard throws on violations",
  run: () => {
    for (const column of [...LONGLIST_CSV_COLUMNS, ...AUDIT_CSV_COLUMNS]) {
      if (FORBIDDEN_EXPORT_COLUMNS.has(column.toLowerCase())) return `column "${column}" is a forbidden personal-data field`;
    }
    try {
      assertNoPersonalFields(["record_id", "client_name"]);
      return "expected assertNoPersonalFields to throw for client_name";
    } catch {
      // expected
    }
    return null;
  }
});

// C. Case 1 — clean record: everything captured, no QC, export ready, "Not recorded" for optional values that never came up.
cases.push({
  name: "C. Clean standard capture (C-811W) is export ready with deliberate optional values",
  run: () => {
    const records = seedDemoRecords();
    const record = findRecord(records, "C-811W");
    const data = dataRow(buildOoxiiDataLonglist(records), "C-811W");
    return (
      (recordNeedsQc(record) ? "expected C-811W to stay QC-clean" : null) ??
      expectEqual("export_ready", data("export_ready"), true) ??
      expectEqual("qc_reason_summary is empty", data("qc_reason_summary"), "") ??
      expectEqual("right_eye_line", data("right_eye_line"), "Line 5") ??
      expectEqual("both_eyes_line", data("both_eyes_line"), "Line 5") ??
      expectEqual("right_astigmatism", data("right_astigmatism"), "No") ??
      expectEqual("right_toric_power reads Not recorded (never came up)", data("right_toric_power"), "Not recorded") ??
      expectEqual("glasses_dispensed_status", data("glasses_dispensed_status"), "Dispensed — +1.00 reading glasses") ??
      expectEqual("frame_colour", data("frame_colour"), "Black") ??
      expectEqual("capture_summary", data("capture_summary"), "7/7 core fields captured") ??
      expectEqual("country", data("country"), "Papua New Guinea") ??
      expectEqual("checklist_results_card_completed", data("checklist_results_card_completed"), "Yes")
    );
  }
});

// D. Case 3 — missing final line: "Missing" (never blank/"Not tested"), QC required, export blocked.
cases.push({
  name: "D. Missing final readable line (C-352P) exports 'Missing' and blocks export",
  run: () => {
    const records = seedDemoRecords();
    const record = findRecord(records, "C-352P");
    const data = dataRow(buildOoxiiDataLonglist(records), "C-352P");
    const audit = buildFullAuditLonglist(records);
    const finalRow = auditRow(audit, "C-352P", "final_readable_line");
    const rightRow = auditRow(audit, "C-352P", "right_eye_distance_result");
    return (
      (recordNeedsQc(record) ? null : "expected recordNeedsQc to be true") ??
      expectEqual("final_readable_line", data("final_readable_line"), "Missing") ??
      expectEqual("export_ready", data("export_ready"), false) ??
      (String(data("capture_summary")).includes("missing: final line") ? null : `expected capture_summary to name the gap, got "${data("capture_summary")}"`) ??
      expectEqual("audit final field_status", finalRow("field_status"), "missing") ??
      expectEqual("audit final field_source", finalRow("field_source"), "not_captured") ??
      expectEqual("audit final evidence_quote is empty (never fabricated)", finalRow("evidence_quote"), "") ??
      (String(rightRow("evidence_quote")).includes("right eye can read line four") ? null : "expected right-eye evidence quote to be present") ??
      expectTrue("right-eye evidence has a transcript line number", Number(rightRow("transcript_line_number")) > 0)
    );
  }
});

// E. Manual note without transcript evidence reads manual_fallback + "No transcript evidence" (never fabricated).
cases.push({
  name: "E. Manual value without evidence exports manual_fallback + 'No transcript evidence'",
  run: () => {
    const row = auditRow(buildFullAuditLonglist(seedDemoRecords()), "C-560M", "additional_notes");
    return (
      expectEqual("field_source", row("field_source"), "manual_fallback") ??
      expectEqual("evidence_quote", row("evidence_quote"), "No transcript evidence") ??
      expectEqual("transcript_line_number is empty", row("transcript_line_number"), "")
    );
  }
});

// F. qcReviewIssues and recordNeedsQc never disagree (internal consistency between qc.ts's two entry points).
cases.push({
  name: "F. qcReviewIssues and recordNeedsQc never disagree",
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

// G. export_ready is always the exact inverse of qc_required, for every record.
cases.push({
  name: "G. export_ready is the inverse of qc_required in every data row",
  run: () => {
    const table = buildOoxiiDataLonglist(seedDemoRecords());
    for (const row of table.rows) {
      const qcRequired = row[col(table, "qc_required")];
      const exportReady = row[col(table, "export_ready")];
      if (qcRequired === exportReady) return `row ${row[0]}: qc_required and export_ready agree (${qcRequired})`;
    }
    return null;
  }
});

// H. Every QC-required data row carries a non-empty, human-readable reason summary.
cases.push({
  name: "H. qc_required rows always carry a qc_reason_summary",
  run: () => {
    const table = buildOoxiiDataLonglist(seedDemoRecords());
    for (const row of table.rows) {
      if (row[col(table, "qc_required")] === true && !String(row[col(table, "qc_reason_summary")]).trim()) {
        return `row ${row[0]}: qc_required with empty qc_reason_summary`;
      }
    }
    return null;
  }
});

// I. Aggregate insights stay consistent with the 6-record dataset.
cases.push({
  name: "I. Aggregate insights match the sample dataset",
  run: () => {
    const summary = computeInsights(seedDemoRecords());
    return (
      expectEqual("total records", summary.totalRecords, 6) ??
      expectEqual("needs QC count", summary.needsQcCount, 3) ??
      expectEqual("pending sync count", summary.pendingSyncCount, 1) ??
      expectEqual("manual override count", summary.manualOverrideCount, 0)
    );
  }
});

// J. Region columns stay at city/state/country level and "No glasses dispensed" produces "Not applicable" frames.
cases.push({
  name: "J. Region granularity and not-dispensed frame handling",
  run: () => {
    const table = buildOoxiiDataLonglist(seedDemoRecords());
    const r4 = dataRow(table, "C-489T");
    return (
      expectEqual("C-489T country", r4("country"), "Vanuatu") ??
      expectEqual("C-489T state", r4("state"), "Shefa Province") ??
      expectEqual("C-489T city", r4("city"), "Port Vila") ??
      expectEqual("C-489T glasses_dispensed_status", r4("glasses_dispensed_status"), "Not dispensed") ??
      expectEqual("C-489T frame_colour", r4("frame_colour"), "Not applicable")
    );
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
