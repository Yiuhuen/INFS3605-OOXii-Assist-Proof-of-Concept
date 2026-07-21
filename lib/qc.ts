import { FIELD_DISPLAY_LABELS } from "./fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "./transcriptQuality";
import type { ManualExtractedFields, ProcessingStatus, QCStatus, RecordingStatus, TestRecord, TranscriptQualityRisk } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Cost-safe future-AI design note
 * ---------------------------------------------------------------------------
 * Nothing in this app calls a paid AI/STT API. All "processing" below is a
 * local, deterministic mock (see lib/mockAi.ts, lib/liveTranscript.ts) so the
 * field workflow works fully offline with zero API cost.
 *
 * If a real AI pass is added later, it should only ever run:
 *   1. after the device is back online and the record has synced,
 *   2. in a batch job, not per-keystroke or per-recording,
 *   3. only for records this module already flags "needs_qc" (i.e. the local
 *      mock could not confidently fill required fields),
 *   4. only on the already-anonymous transcript/field data — no names, DOB,
 *      phone, address, or GPS ever leave the device, because none is collected,
 *   5. as a suggestion queued *before* human QC review, never auto-applied, and
 *   6. export stays blocked or warns (see filterRecords/"needs_qc") until a
 *      human has approved the record — a real AI pass would feed into that
 *      same review step, not skip it.
 * This keeps the offline field workflow authoritative and any future AI spend
 * opt-in, batched, and reviewable rather than a hard dependency.
 * ---------------------------------------------------------------------------
 */

const processingStatusLabels: Record<ProcessingStatus, string> = {
  not_processed: "Not processed",
  ready_for_review: "Ready for review",
  needs_qc: "Needs QC",
  processed_after_sync: "Processed after sync"
};

/** Friendlier copy for the raw ProcessingStatus enum. Display-only. */
export function processingStatusLabel(status: ProcessingStatus): string {
  return processingStatusLabels[status] ?? status;
}

const processingStatusTones: Record<ProcessingStatus, "neutral" | "warn" | "good" | "danger"> = {
  not_processed: "neutral",
  ready_for_review: "warn",
  needs_qc: "danger",
  processed_after_sync: "good"
};

export function processingStatusTone(status: ProcessingStatus) {
  return processingStatusTones[status];
}

/**
 * Single source of truth for whether a record needs human QC before it can be
 * treated as clean. Used both for the real save (post-extraction, full signal)
 * and for lighter pre-save previews (transcript-only signal, before fields
 * have been extracted yet).
 */
export function evaluateNeedsQc({
  recordingStatus,
  editedByUser,
  confidenceScore,
  missingFieldsCount,
  transcriptCaptured,
  manualFallbackUsed,
  hasUnclearSegments = false,
  hasUnvisitedPrompts = false,
  transcriptQualityRisk = "low",
  hasClinicalCorrection = false,
  translationReviewRequired = false,
  extractionUnsafe = false,
  fieldsRequireReviewUnconfirmed = false
}: {
  recordingStatus: RecordingStatus;
  editedByUser: boolean;
  confidenceScore: number;
  missingFieldsCount: number;
  transcriptCaptured: boolean;
  manualFallbackUsed: boolean;
  hasUnclearSegments?: boolean;
  /** True when the tester finished/saved without the swipe-card ever showing one or more of the fixed clinical prompts — the sequence itself is never skipped, but a QC reviewer should confirm the gap. */
  hasUnvisitedPrompts?: boolean;
  /** Overall transcript-content risk from lib/transcriptQuality.ts — see analyseTranscriptQuality. Medium/high always forces QC. */
  transcriptQualityRisk?: TranscriptQualityRisk;
  /** True when an applied suggested correction touched a clinically significant term (eye-side, can/cannot, comfort, cataract, final line, glasses). */
  hasClinicalCorrection?: boolean;
  /** True for any non-English record — the English processing copy is an unverified draft, never a validated translation. */
  translationReviewRequired?: boolean;
  /** True when the transcript/translation was too uncertain to auto-extract structured fields confidently — see deriveExtractionSafetyStatus. */
  extractionUnsafe?: boolean;
  /** True when at least one draft-extracted field is flagged requiresReview and the tester has not ticked "Fields reviewed" — see lib/fieldExtraction.ts and the CapturedFieldsScreen confirmation. */
  fieldsRequireReviewUnconfirmed?: boolean;
}): boolean {
  return (
    recordingStatus !== "recorded" ||
    editedByUser ||
    confidenceScore < 0.7 ||
    missingFieldsCount > 0 ||
    (recordingStatus === "recorded" && !transcriptCaptured) ||
    manualFallbackUsed ||
    hasUnclearSegments ||
    hasUnvisitedPrompts ||
    transcriptQualityRisk !== "low" ||
    hasClinicalCorrection ||
    translationReviewRequired ||
    extractionUnsafe ||
    fieldsRequireReviewUnconfirmed
  );
}

/**
 * Derives the local-mock processing lifecycle. Never reflects a paid API —
 * "processed_after_sync" only means the device has synced, which is the
 * point a future cost-safe batch AI pass (see design note above) would run.
 */
export function computeProcessingStatus({
  transcriptCaptured,
  needsQc,
  qcApproved,
  synced
}: {
  transcriptCaptured: boolean;
  needsQc: boolean;
  qcApproved: boolean;
  synced: boolean;
}): ProcessingStatus {
  if (!transcriptCaptured) return "not_processed";
  if (needsQc && !qcApproved) return "needs_qc";
  if (synced) return "processed_after_sync";
  return "ready_for_review";
}

/** Convenience wrapper for computing processing status directly from a saved TestRecord. */
export function computeRecordProcessingStatus(record: TestRecord): ProcessingStatus {
  const transcriptCaptured = Boolean(record.raw_transcript_text.trim()) || record.transcript_segments.some((segment) => segment.isFinal && segment.text.trim());
  return computeProcessingStatus({
    transcriptCaptured,
    needsQc: record.needs_qc,
    qcApproved: record.qc_status === "Approved",
    synced: record.sync_status === "Synced"
  });
}

const qcStatusLabels: Record<QCStatus, string> = {
  Unreviewed: "Needs review",
  "In review": "In review",
  Corrected: "Edited",
  Approved: "Complete"
};

/** Friendlier copy for the raw QCStatus enum. The stored value never changes — this is display-only. */
export function qcStatusLabel(status: QCStatus): string {
  return qcStatusLabels[status] ?? status;
}

export type QcFilter = "needs_qc" | "edited" | "missing_fields" | "low_confidence" | "recording_issues" | "pending_sync" | "all";

export const qcFilters: Array<{ id: QcFilter; label: string }> = [
  { id: "needs_qc", label: "Needs QC" },
  { id: "edited", label: "Edited" },
  { id: "missing_fields", label: "Missing fields" },
  { id: "low_confidence", label: "Low confidence" },
  { id: "recording_issues", label: "Recording issues" },
  { id: "pending_sync", label: "Pending sync" },
  { id: "all", label: "All records" }
];

export function isLowConfidence(record: TestRecord) {
  return record.confidence_score < 0.7;
}

export function hasMissingFields(record: TestRecord) {
  return record.missing_fields.length > 0;
}

export function recordingIncomplete(record: TestRecord) {
  return record.recording_status !== "recorded";
}

export function hasUnclearSegments(record: TestRecord) {
  return record.unclear_segments.length > 0;
}

/** True when the record relied on the tester's manual-override fallback rather than a captured recording. */
export function usedManualOverride(record: TestRecord) {
  return record.recording_status === "manual_override" || Boolean(record.manual_override_reason.trim());
}

/** True when any transcript_quality_flags entry is still uncovered by an applied correction — see unresolved_transcript_flag_ids. */
export function hasUnresolvedCriticalTranscriptFlag(record: TestRecord) {
  return record.unresolved_transcript_flag_ids.some((flagId) => {
    const flag = record.transcript_quality_flags.find((candidate) => candidate.id === flagId);
    return flag?.severity === "critical";
  });
}

export function recordNeedsQc(record: TestRecord) {
  // QC sign-off is terminal for data-quality issues, but sync problems remain
  // visible because the demo/export flows need to show pending local records.
  if (record.qc_status === "Approved" && record.sync_status === "Synced") return false;
  return (
    record.needs_qc ||
    record.requires_qc_verification ||
    record.edited_by_user ||
    isLowConfidence(record) ||
    hasMissingFields(record) ||
    recordingIncomplete(record) ||
    hasUnclearSegments(record) ||
    record.has_unvisited_prompts ||
    record.qc_status === "Unreviewed" ||
    record.sync_status === "Pending sync" ||
    record.sync_status === "Failed" ||
    record.transcript_quality_risk !== "low" ||
    hasUnresolvedCriticalTranscriptFlag(record) ||
    record.translation_review_required ||
    record.extraction_safety_status === "draft_review_required" ||
    record.corrections_applied.some((correction) => correction.affectsClinicalMeaning)
  );
}

/** The four groups QC reasons render under — keeps a badge-heavy record from becoming a wall of undifferentiated chips (see components/screens/QcScreen.tsx). */
export type QcReasonCategory = "Transcript quality" | "Missing & edited fields" | "Recording & manual fallback" | "Sync & export status";

const QC_REASON_CATEGORY_ORDER: QcReasonCategory[] = [
  "Transcript quality",
  "Missing & edited fields",
  "Recording & manual fallback",
  "Sync & export status"
];

interface CategorizedQcReason {
  category: QcReasonCategory;
  reason: string;
}

function buildCategorizedQcReasons(record: TestRecord): CategorizedQcReason[] {
  if (record.qc_status === "Approved") return [{ category: "Sync & export status", reason: "QC complete" }];
  const reasons: CategorizedQcReason[] = [];

  if (recordingIncomplete(record)) {
    reasons.push({ category: "Recording & manual fallback", reason: `Recording ${record.recording_status.replace("_", " ")}` });
  }
  if (record.recording_status === "recorded" && !record.raw_transcript_text.trim()) {
    reasons.push({ category: "Recording & manual fallback", reason: "Audio recorded but no transcript captured" });
  }
  if (hasUnclearSegments(record)) {
    reasons.push({
      category: "Recording & manual fallback",
      reason: `${record.unclear_segments.length} unclear section${record.unclear_segments.length === 1 ? "" : "s"}`
    });
  }
  if (record.has_unvisited_prompts) reasons.push({ category: "Recording & manual fallback", reason: "Prompt(s) not shown" });

  if (isLowConfidence(record)) reasons.push({ category: "Missing & edited fields", reason: "Low confidence" });
  if (hasMissingFields(record)) reasons.push({ category: "Missing & edited fields", reason: "Missing fields" });
  if (record.edited_by_user) reasons.push({ category: "Missing & edited fields", reason: "Edited by tester" });

  for (const flag of record.transcript_quality_flags) {
    if (flag.type === "possible_misrecognition" && flag.suggestedText) {
      reasons.push({ category: "Transcript quality", reason: `Possible STT misrecognition: '${flag.originalText}' may mean '${flag.suggestedText}'` });
    }
  }
  if (record.transcript_quality_flags.some((flag) => flag.type === "ambiguous_negation")) {
    reasons.push({ category: "Transcript quality", reason: "Negation ambiguity: 'can see' vs 'cannot see'" });
  }
  if (record.transcript_quality_flags.some((flag) => flag.type === "clinical_contradiction")) {
    reasons.push({ category: "Transcript quality", reason: "Eye-side ambiguity detected" });
  }
  if (record.translation_review_required) reasons.push({ category: "Transcript quality", reason: "Translation requires review" });
  if (record.corrections_applied.some((correction) => correction.affectsClinicalMeaning)) {
    reasons.push({ category: "Transcript quality", reason: "Clinical field edited after transcript review" });
  }
  if (record.extraction_safety_status === "draft_review_required") {
    reasons.push({ category: "Transcript quality", reason: "Draft extraction — requires review" });
  }
  if (record.transcript_quality_risk !== "low") {
    reasons.push({ category: "Transcript quality", reason: "Transcript quality risk affects extracted fields" });
  }

  // Per-field draft-extraction reasons (spec: lib/fieldExtraction.ts field_confidence) —
  // one line per field so a QC reviewer knows exactly which value to double-check,
  // rather than a single "something's wrong" badge.
  const effectiveFields = record.edited_extracted_json ?? record.extracted_json;
  const fieldConfidenceMap = effectiveFields.field_confidence;
  if (fieldConfidenceMap) {
    let genericDraftReviewNeeded = false;
    (Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).forEach((key) => {
      const meta = fieldConfidenceMap[key];
      if (!meta) return;
      const label = FIELD_DISPLAY_LABELS[key];
      const isHighRisk = HIGH_RISK_EXTRACTED_FIELDS.includes(key);

      if (isHighRisk && !meta.value.trim()) {
        reasons.push({ category: "Missing & edited fields", reason: `High-risk field not captured: ${label}` });
        return;
      }
      if (meta.source === "manual" && isHighRisk) {
        reasons.push({ category: "Missing & edited fields", reason: `Manual value entered for high-risk field: ${label}` });
      }
      if (meta.confidence === "low") {
        reasons.push({ category: "Transcript quality", reason: `Low-confidence extracted field: ${label}` });
      } else if (meta.requiresReview) {
        genericDraftReviewNeeded = true;
      }
    });
    if (genericDraftReviewNeeded) {
      reasons.push({ category: "Transcript quality", reason: "Draft field extracted from transcript requires review" });
    }
  }
  if (fieldConfidenceMap && !record.fields_reviewed_by_tester && Object.values(fieldConfidenceMap).some((meta) => meta?.requiresReview)) {
    reasons.push({ category: "Missing & edited fields", reason: "Draft fields not yet confirmed reviewed by tester" });
  }

  if (record.sync_status === "Pending sync") reasons.push({ category: "Sync & export status", reason: "Pending sync" });
  if (record.sync_status === "Failed") reasons.push({ category: "Sync & export status", reason: "Sync failed" });
  if (record.qc_status === "Unreviewed") reasons.push({ category: "Sync & export status", reason: "Unreviewed" });

  return reasons;
}

/** Flat list — same reasons as qcReasonGroups, just without category grouping. Kept for any caller that only needs the plain text. */
export function qcReasons(record: TestRecord): string[] {
  return buildCategorizedQcReasons(record).map((item) => item.reason);
}

/** Grouped for display — see components/screens/QcScreen.tsx, which renders each non-empty group under its own short header instead of one undifferentiated badge row. */
export function qcReasonGroups(record: TestRecord): Array<{ category: QcReasonCategory; reasons: string[] }> {
  const categorized = buildCategorizedQcReasons(record);
  return QC_REASON_CATEGORY_ORDER.map((category) => ({
    category,
    reasons: categorized.filter((item) => item.category === category).map((item) => item.reason)
  })).filter((group) => group.reasons.length > 0);
}

export function filterRecords(records: TestRecord[], filter: QcFilter): TestRecord[] {
  switch (filter) {
    case "needs_qc":
      return records.filter(recordNeedsQc);
    case "edited":
      return records.filter((record) => record.edited_by_user);
    case "missing_fields":
      return records.filter(hasMissingFields);
    case "low_confidence":
      return records.filter(isLowConfidence);
    case "recording_issues":
      return records.filter(recordingIncomplete);
    case "pending_sync":
      return records.filter((record) => record.sync_status === "Pending sync");
    case "all":
    default:
      return records;
  }
}
