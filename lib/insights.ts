import { REQUIRED_EXTRACTED_FIELDS, UNKNOWN_FIELD_VALUE, type ExtractedFields, type LanguageCode, type TestRecord } from "./types";
import { hasUnclearSegments, usedManualOverride } from "./qc";

/**
 * ---------------------------------------------------------------------------
 * Actionable insights — aggregate, non-personal only.
 * ---------------------------------------------------------------------------
 * Every input here is a TestRecord/ClientRecord, neither of which ever holds
 * a name, DOB, phone, address, or GPS coordinate (see lib/types.ts). Output
 * is always a count/rate/label across many records, never a single-client
 * result or a clinical prescription — this feeds program-level decisions
 * (training, staffing, device checks), not individual test outcomes. These
 * are local, deterministic, threshold-based summaries — never call this
 * feature "AI insights" in any UI copy; it is "Actionable insights".
 * ---------------------------------------------------------------------------
 */

const FIELD_LABELS: Record<keyof Omit<ExtractedFields, "missing_fields" | "confidence_score" | "field_confidence">, string> = {
  comfort_response: "Comfort response",
  cataract_history_confirmed: "Cataract history confirmed",
  current_glasses: "Current glasses",
  right_eye_distance_result: "Right eye distance result",
  left_eye_distance_result: "Left eye distance result",
  final_readable_line: "Final readable line",
  glasses_selected: "Glasses selected",
  additional_notes: "Additional notes"
};

const SHORT_FIELD_LABELS: Partial<Record<string, string>> = {
  right_eye_distance_result: "Right eye result",
  left_eye_distance_result: "Left eye result",
  current_glasses: "Current glasses",
  cataract_history_confirmed: "Cataract history",
  comfort_response: "Comfort response",
  glasses_selected: "Glasses selected"
};

export interface FieldGapInsight {
  field: string;
  label: string;
  missingCount: number;
  missingRate: number;
}

export interface GroupInsight {
  key: string;
  totalRecords: number;
  needsQcCount: number;
  needsQcRate: number;
}

export type InsightPriority = "High" | "Medium" | "Low";
export type InsightTargetPage = "QC" | "Export" | "Prompt Editor" | "Record";

/** One actionable insight card — always: what we saw, why, what to do, how urgent, and where to act. */
export interface ActionableInsight {
  id: string;
  title: string;
  evidence: string;
  action: string;
  priority: InsightPriority;
  targetPage: InsightTargetPage;
}

export interface InsightsSummary {
  totalRecords: number;
  needsQcCount: number;
  needsQcRate: number;
  averageConfidence: number;
  recordingSuccessRate: number;
  editedRate: number;
  pendingSyncCount: number;
  failedSyncCount: number;
  unclearSegmentRecordCount: number;
  manualOverrideCount: number;
  fieldGaps: FieldGapInsight[];
  bySite: GroupInsight[];
  byLanguage: GroupInsight[];
  insights: ActionableInsight[];
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function groupBy(records: TestRecord[], keyOf: (record: TestRecord) => string): GroupInsight[] {
  const groups = new Map<string, TestRecord[]>();
  for (const record of records) {
    const key = keyOf(record) || "Unspecified";
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => {
      const needsQcCount = group.filter((record) => record.needs_qc).length;
      return { key, totalRecords: group.length, needsQcCount, needsQcRate: rate(needsQcCount, group.length) };
    })
    .sort((a, b) => b.totalRecords - a.totalRecords);
}

const LANGUAGE_LABELS: Record<LanguageCode, string> = { en: "English", tpi: "Tok Pisin", bis: "Bislama" };

const PRIORITY_RANK: Record<InsightPriority, number> = { High: 0, Medium: 1, Low: 2 };

/** Most frequent non-empty, non-UNKNOWN value for a field across records' effective (edited-or-extracted) fields. */
function findMostRepeatedValue(records: TestRecord[], field: keyof ExtractedFields): { value: string; count: number; total: number } | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const record of records) {
    const effective = record.edited_extracted_json ?? record.extracted_json;
    const value = String(effective[field] ?? "").trim();
    if (!value || value === UNKNOWN_FIELD_VALUE) continue;
    total += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts.entries()) {
    if (!best || count > best.count) best = { value, count };
  }
  return best && total > 0 ? { ...best, total } : null;
}

function buildInsights(records: TestRecord[], stats: {
  needsQcCount: number;
  needsQcRate: number;
  pendingSyncCount: number;
  failedSyncCount: number;
  unclearSegmentRecordCount: number;
  manualOverrideCount: number;
  editedCount: number;
  fieldGaps: FieldGapInsight[];
}): ActionableInsight[] {
  const totalRecords = records.length;
  const insights: ActionableInsight[] = [];

  if (stats.needsQcCount > 0) {
    insights.push({
      id: "needs-qc",
      title: `${stats.needsQcCount} record${stats.needsQcCount === 1 ? "" : "s"} need${stats.needsQcCount === 1 ? "s" : ""} QC before export`,
      evidence: `${stats.needsQcCount} of ${totalRecords} saved records (${pct(stats.needsQcRate)}) are flagged for QC review.`,
      action: "Open QC Review and resolve flagged records before exporting.",
      priority: stats.needsQcRate > 0.5 ? "High" : stats.needsQcRate > 0.2 ? "Medium" : "Low",
      targetPage: "QC"
    });
  }

  if (stats.failedSyncCount > 0) {
    insights.push({
      id: "sync-failed",
      title: `${stats.failedSyncCount} record${stats.failedSyncCount === 1 ? "" : "s"} failed to sync`,
      evidence: `${stats.failedSyncCount} of ${totalRecords} records attempted a cloud sync and failed.`,
      action: "Check connectivity and Supabase configuration, then retry from Export.",
      priority: "High",
      targetPage: "Export"
    });
  }

  if (stats.pendingSyncCount > 0) {
    insights.push({
      id: "pending-sync",
      title: `${stats.pendingSyncCount} record${stats.pendingSyncCount === 1 ? "" : "s"} pending sync`,
      evidence: `${stats.pendingSyncCount} of ${totalRecords} records are saved locally but not yet synced.`,
      action: "Reconnect and let pending records sync before relying on the cloud copy.",
      priority: rate(stats.pendingSyncCount, totalRecords) > 0.5 ? "High" : "Medium",
      targetPage: "Export"
    });
  }

  stats.fieldGaps.slice(0, 3).forEach((gap) => {
    const label = SHORT_FIELD_LABELS[gap.field] ?? gap.label;
    insights.push({
      id: `missing-${gap.field}`,
      title: `${label} missing in ${gap.missingCount} record${gap.missingCount === 1 ? "" : "s"}`,
      evidence: `${pct(gap.missingRate)} of records are missing "${gap.label}".`,
      action: `Review and fill "${gap.label}" during QC, or refresh tester training on that prompt step.`,
      priority: gap.missingRate > 0.4 ? "High" : gap.missingRate > 0.15 ? "Medium" : "Low",
      targetPage: "QC"
    });
  });

  if (stats.unclearSegmentRecordCount > 0) {
    insights.push({
      id: "unclear-segments",
      title: `${stats.unclearSegmentRecordCount} record${stats.unclearSegmentRecordCount === 1 ? "" : "s"} have unclear audio sections flagged`,
      evidence: `${stats.unclearSegmentRecordCount} of ${totalRecords} records have a tester-flagged unclear section.`,
      action: "Review flagged sections against the audio during QC.",
      priority: rate(stats.unclearSegmentRecordCount, totalRecords) > 0.3 ? "High" : "Medium",
      targetPage: "QC"
    });
  }

  if (stats.manualOverrideCount > 0) {
    const overrideRate = rate(stats.manualOverrideCount, totalRecords);
    insights.push({
      id: "manual-override",
      title: `${stats.manualOverrideCount} record${stats.manualOverrideCount === 1 ? "" : "s"} used manual override`,
      evidence: `${stats.manualOverrideCount} of ${totalRecords} records (${pct(overrideRate)}) relied on a manual override instead of a captured recording.`,
      action: "Check microphone access and refresh tester training on continuous recording.",
      priority: overrideRate > 0.4 ? "High" : overrideRate > 0.15 ? "Medium" : "Low",
      targetPage: "Record"
    });
  }

  if (stats.editedCount > 0) {
    insights.push({
      id: "edited-fields",
      title: `${stats.editedCount} record${stats.editedCount === 1 ? "" : "s"} have edited fields awaiting QC verification`,
      evidence: `${stats.editedCount} of ${totalRecords} records were hand-edited and are marked "requires QC verification".`,
      action: "Confirm each edited field is correct in QC Review.",
      priority: rate(stats.editedCount, totalRecords) > 0.4 ? "High" : "Medium",
      targetPage: "QC"
    });
  }

  const repeatedGlasses = findMostRepeatedValue(records, "glasses_selected");
  if (repeatedGlasses && repeatedGlasses.count >= 2 && rate(repeatedGlasses.count, repeatedGlasses.total) > 0.3) {
    insights.push({
      id: "repeated-glasses",
      title: `"${repeatedGlasses.value}" selected often — check stock`,
      evidence: `${repeatedGlasses.count} of ${repeatedGlasses.total} records with a captured selection chose "${repeatedGlasses.value}".`,
      action: "Check trial lens/frame stock for this option before the next field session.",
      priority: rate(repeatedGlasses.count, repeatedGlasses.total) > 0.6 ? "Medium" : "Low",
      targetPage: "Record"
    });
  }

  const languageGroups = new Map<string, TestRecord[]>();
  for (const record of records) {
    const label = LANGUAGE_LABELS[record.language] ?? record.language;
    const bucket = languageGroups.get(label) ?? [];
    bucket.push(record);
    languageGroups.set(label, bucket);
  }
  const overallOverrideRate = rate(stats.manualOverrideCount, totalRecords);
  let worstLanguage: { label: string; count: number; total: number; overrideRate: number } | null = null;
  for (const [label, group] of languageGroups.entries()) {
    if (group.length < 2) continue;
    const overrideCount = group.filter(usedManualOverride).length;
    const overrideRateForLanguage = rate(overrideCount, group.length);
    if (overrideRateForLanguage > 0.4 && overrideRateForLanguage > overallOverrideRate) {
      if (!worstLanguage || overrideRateForLanguage > worstLanguage.overrideRate) {
        worstLanguage = { label, count: overrideCount, total: group.length, overrideRate: overrideRateForLanguage };
      }
    }
  }
  if (worstLanguage) {
    insights.push({
      id: "language-override-rate",
      title: `${worstLanguage.label} records have more manual overrides`,
      evidence: `${worstLanguage.count} of ${worstLanguage.total} ${worstLanguage.label} records (${pct(worstLanguage.overrideRate)}) used manual override, vs ${pct(overallOverrideRate)} overall.`,
      action: "Review recording conditions or refresh tester training/prompts for this language.",
      priority: worstLanguage.overrideRate > 0.6 ? "High" : "Medium",
      targetPage: "Prompt Editor"
    });
  }

  if (insights.length === 0 && totalRecords > 0) {
    insights.push({
      id: "all-clear",
      title: "No urgent issues detected",
      evidence: "All saved records look healthy across QC, sync, and field completeness.",
      action: "Continue testing as normal — records look ready to export.",
      priority: "Low",
      targetPage: "Export"
    });
  }

  return insights.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

export function computeInsights(records: TestRecord[]): InsightsSummary {
  const totalRecords = records.length;
  const needsQcCount = records.filter((record) => record.needs_qc).length;
  const editedCount = records.filter((record) => record.edited_by_user).length;
  const recordingOkCount = records.filter((record) => record.recording_status === "recorded").length;
  const pendingSyncCount = records.filter((record) => record.sync_status === "Pending sync").length;
  const failedSyncCount = records.filter((record) => record.sync_status === "Failed").length;
  const unclearSegmentRecordCount = records.filter(hasUnclearSegments).length;
  const manualOverrideCount = records.filter(usedManualOverride).length;
  const averageConfidence = totalRecords
    ? Math.round((records.reduce((sum, record) => sum + record.confidence_score, 0) / totalRecords) * 100) / 100
    : 0;

  const fieldGaps: FieldGapInsight[] = REQUIRED_EXTRACTED_FIELDS.map((field) => {
    const missingCount = records.filter((record) => record.missing_fields.includes(field)).length;
    const label = FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? field;
    return { field, label, missingCount, missingRate: rate(missingCount, totalRecords) };
  })
    .filter((gap) => gap.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);

  const bySite = groupBy(records, (record) => record.client_snapshot.location_site);
  const byLanguage = groupBy(records, (record) => LANGUAGE_LABELS[record.language] ?? record.language);

  const insights = buildInsights(records, {
    needsQcCount,
    needsQcRate: rate(needsQcCount, totalRecords),
    pendingSyncCount,
    failedSyncCount,
    unclearSegmentRecordCount,
    manualOverrideCount,
    editedCount,
    fieldGaps
  });

  return {
    totalRecords,
    needsQcCount,
    needsQcRate: rate(needsQcCount, totalRecords),
    averageConfidence,
    recordingSuccessRate: rate(recordingOkCount, totalRecords),
    editedRate: rate(editedCount, totalRecords),
    pendingSyncCount,
    failedSyncCount,
    unclearSegmentRecordCount,
    manualOverrideCount,
    fieldGaps,
    bySite,
    byLanguage,
    insights
  };
}
