import { FIELD_DISPLAY_LABELS } from "./fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "./transcriptQuality";
import type { ManualExtractedFields, ProcessingStatus, QCStatus, RecordingStatus, SyncStatus, TestRecord, TranscriptQualityRisk } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Cost-safe future-AI design note
 * ---------------------------------------------------------------------------
 * Nothing in this app calls a paid AI/STT API. All "processing" below is a
 * local, deterministic pass (see lib/fieldExtraction.ts, lib/liveTranscript.ts)
 * so the field workflow works fully offline with zero API cost.
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
  hasUnrecordedViewedPrompts = false,
  transcriptQualityRisk = "low",
  hasClinicalCorrection = false,
  translationReviewRequired = false,
  extractionUnsafe = false,
  fieldsRequireReviewUnconfirmed = false,
  demoHelperUsed = false
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
  /** True when one or more prompts WERE shown to the tester but never while continuous audio recording was active (e.g. mic failure, or paused) — distinct from hasUnvisitedPrompts; never reported as "never shown". */
  hasUnrecordedViewedPrompts?: boolean;
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
  /** True when the dev/demo-only "Insert sample transcript for demo" helper (lib/demoHelpers.ts) supplied this record's transcript — always forces QC, since it never came from real recording/STT. */
  demoHelperUsed?: boolean;
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
    hasUnrecordedViewedPrompts ||
    transcriptQualityRisk !== "low" ||
    hasClinicalCorrection ||
    translationReviewRequired ||
    extractionUnsafe ||
    fieldsRequireReviewUnconfirmed ||
    demoHelperUsed
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

const syncStatusLabels: Record<SyncStatus, string> = {
  "Pending sync": "Pending sync",
  Synced: "Synced",
  Failed: "Sync failed",
  "Local only": "Saved locally"
};

/** Friendlier copy for the raw SyncStatus enum — display-only, the stored value never changes. "Local only" always reads "Saved locally", never "Synced". */
export function syncStatusLabel(status: SyncStatus): string {
  return syncStatusLabels[status] ?? status;
}

export type QcFilter = "needs_qc" | "edited" | "missing_fields" | "reviewed" | "all";

/**
 * Compact filter set — five short labels that fit a phone width without a
 * cut-off tab. The old low-confidence / recording-issue / pending-sync
 * filters were subsets of "Needs QC" in practice (every such record needs
 * QC anyway); their signals still appear per-record in qcReviewIssues and
 * the record summary, so nothing is lost — only the seven-pill tab overflow.
 */
export const qcFilters: Array<{ id: QcFilter; label: string }> = [
  { id: "needs_qc", label: "Needs QC" },
  { id: "edited", label: "Edited" },
  { id: "missing_fields", label: "Missing" },
  { id: "reviewed", label: "Reviewed" },
  { id: "all", label: "All" }
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
  // QC sign-off is terminal for data-quality issues. "Local only" (no
  // Supabase configured) and "Pending sync" are both by-design/timing sync
  // states, not data-quality problems — an Approved record that simply
  // hasn't synced yet (or never will, by design) is exactly as "done" as an
  // Approved synced one. Only a genuine sync FAILURE keeps a record visible
  // for review even after approval, since that's an unresolved problem.
  if (record.qc_status === "Approved" && record.sync_status !== "Failed") return false;
  return (
    record.needs_qc ||
    record.requires_qc_verification ||
    record.edited_by_user ||
    isLowConfidence(record) ||
    hasMissingFields(record) ||
    recordingIncomplete(record) ||
    hasUnclearSegments(record) ||
    record.has_unvisited_prompts ||
    record.has_unrecorded_viewed_prompts ||
    record.qc_status === "Unreviewed" ||
    record.sync_status === "Pending sync" ||
    record.sync_status === "Failed" ||
    record.transcript_quality_risk !== "low" ||
    hasUnresolvedCriticalTranscriptFlag(record) ||
    record.translation_review_required ||
    record.extraction_safety_status === "draft_review_required" ||
    record.corrections_applied.some((correction) => correction.affectsClinicalMeaning) ||
    record.demo_helper_used
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
  if (record.has_unvisited_prompts) reasons.push({ category: "Recording & manual fallback", reason: "Prompt(s) not viewed" });
  if (record.has_unrecorded_viewed_prompts) {
    reasons.push({
      category: "Recording & manual fallback",
      reason: "Prompt(s) viewed but not captured in audio because recording failed"
    });
  }
  if (record.demo_helper_used) reasons.push({ category: "Recording & manual fallback", reason: "Demo helper used — review required" });

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
        reasons.push({ category: "Missing & edited fields", reason: `${label} not captured` });
        return;
      }
      if (meta.source === "manual" && isHighRisk) {
        reasons.push({ category: "Missing & edited fields", reason: `${label} manually entered — verify before approval` });
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

/* ---------------------------------------------------------------------------
 * Structured QC review issues — the reviewer-facing checklist.
 * ---------------------------------------------------------------------------
 * qcReasons/qcReasonGroups above return plain strings and are kept for the
 * audit trail and tests. This is the presentation the QC screen renders: one
 * row per issue, sentence case, severity-ranked, with the concrete thing to
 * check ("Review field" vs "Review transcript") instead of an undifferentiated
 * wall of uppercase pills. Same underlying predicates — no QC logic changes.
 */

export type QcIssueSeverity = "high" | "medium" | "low";
export type QcIssueSource = "Field" | "Transcript" | "Recording" | "Prompt";

export interface QcIssue {
  id: string;
  severity: QcIssueSeverity;
  /** Short sentence-case title, e.g. "Cataract history confirmed not captured". */
  title: string;
  /** One-line explanation of what to check and why. */
  detail: string;
  source: QcIssueSource;
  /** Field this issue is about, when it maps to exactly one — lets the QC screen jump straight to that field's editable input. */
  fieldKey?: keyof ManualExtractedFields;
  /** Transcript phrase (field evidence quote, or a flag's originalText) to highlight/scroll to when the reviewer opens this issue — spec §9/§10 "click a QC issue → highlight matching evidence". Absent when there's nothing specific to jump to (e.g. a field that was never captured at all). */
  evidenceText?: string;
}

const SEVERITY_RANK: Record<QcIssueSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Priority order mirrors the reviewer's actual workflow: missing required
 * data first, then manual edits, then recording/transcript trust issues,
 * then prompt coverage. Pure status facts (Unreviewed, Pending sync) are
 * deliberately NOT issues — they belong in the record summary, not the
 * checklist, because there is nothing for the reviewer to go check.
 */
export function qcReviewIssues(record: TestRecord): QcIssue[] {
  if (record.qc_status === "Approved") return [];
  const issues: QcIssue[] = [];
  const push = (issue: Omit<QcIssue, "id">) => issues.push({ id: `${issue.source}-${issues.length}-${issue.title.slice(0, 24)}`, ...issue });

  const effectiveFields = record.edited_extracted_json ?? record.extracted_json;
  const fieldConfidenceMap = effectiveFields.field_confidence;
  const highRiskSet = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

  // 1. Missing required data (high)
  if (fieldConfidenceMap) {
    (Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).forEach((key) => {
      const meta = fieldConfidenceMap[key];
      if (!meta || !highRiskSet.has(key)) return;
      if (!meta.value.trim()) {
        push({
          severity: "high",
          title: `${FIELD_DISPLAY_LABELS[key]} not captured`,
          detail: "Not found in the transcript. Enter it from the audio or confirm it is genuinely unknown.",
          source: "Field",
          fieldKey: key
        });
      }
    });
  }

  // 2. Manual edits (high for high-risk fields, medium otherwise)
  let manualHighRiskCount = 0;
  if (fieldConfidenceMap) {
    (Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).forEach((key) => {
      const meta = fieldConfidenceMap[key];
      if (!meta || meta.source !== "manual" || !meta.value.trim()) return;
      if (highRiskSet.has(key)) {
        manualHighRiskCount += 1;
        push({
          severity: "high",
          title: `${FIELD_DISPLAY_LABELS[key]} was manually entered`,
          detail: "Check the manual value against the transcript or audio before approval.",
          source: "Field",
          fieldKey: key,
          evidenceText: meta.evidence
        });
      }
    });
  }
  if (record.edited_by_user && manualHighRiskCount === 0) {
    push({
      severity: "medium",
      title: "Fields were edited by the tester",
      detail: "Compare the edited values against the transcript before approval.",
      source: "Field"
    });
  }

  // Per-field extraction trust signals
  if (fieldConfidenceMap) {
    (Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).forEach((key) => {
      const meta = fieldConfidenceMap[key];
      if (!meta || meta.source === "manual" || !meta.value.trim()) return;
      if (meta.confidence === "low") {
        push({
          severity: "medium",
          title: `${FIELD_DISPLAY_LABELS[key]} extracted with low confidence`,
          detail: meta.reason ?? "Verify this value against the audio.",
          source: "Field",
          fieldKey: key,
          evidenceText: meta.evidence
        });
      }
    });
  }
  if (fieldConfidenceMap && !record.fields_reviewed_by_tester && Object.values(fieldConfidenceMap).some((meta) => meta?.requiresReview)) {
    push({
      severity: "medium",
      title: "Draft fields not confirmed by the tester",
      detail: "The tester saved without confirming the field review checklist.",
      source: "Field"
    });
  }

  // 3. Recording / transcript issues
  if (usedManualOverride(record)) {
    push({
      severity: "medium",
      title: "Manual recording override used",
      detail: "Audio was unavailable or skipped, so transcript evidence is weaker.",
      source: "Recording"
    });
  } else if (recordingIncomplete(record)) {
    push({
      severity: "medium",
      title: `Recording ${record.recording_status.replace("_", " ")}`,
      detail: "The audio recording did not complete normally for this test.",
      source: "Recording"
    });
  }
  if (record.recording_status === "recorded" && !record.raw_transcript_text.trim()) {
    push({
      severity: "medium",
      title: "Audio recorded but no transcript captured",
      detail: "Listen to the audio and add or correct the transcript manually.",
      source: "Transcript"
    });
  }
  if (hasUnclearSegments(record)) {
    push({
      severity: "medium",
      title: `${record.unclear_segments.length} section${record.unclear_segments.length === 1 ? "" : "s"} marked unclear`,
      detail: "The tester flagged moments they could not hear clearly — verify them against the audio.",
      source: "Transcript"
    });
  }
  for (const flag of record.transcript_quality_flags) {
    if (flag.type === "possible_misrecognition" && flag.suggestedText && record.unresolved_transcript_flag_ids.includes(flag.id)) {
      push({
        severity: "medium",
        title: `Possible mishearing: "${flag.originalText}" may mean "${flag.suggestedText}"`,
        detail: "Confirm the wording against the audio before trusting extracted values.",
        source: "Transcript",
        evidenceText: flag.originalText
      });
    }
  }
  if (record.transcript_quality_flags.some((flag) => flag.type === "ambiguous_negation")) {
    push({
      severity: "high",
      title: "Can / cannot ambiguity in transcript",
      detail: "The transcript contains both positive and negative readings — resolve which was said.",
      source: "Transcript"
    });
  }
  if (record.transcript_quality_flags.some((flag) => flag.type === "clinical_contradiction")) {
    push({
      severity: "high",
      title: "Eye-side ambiguity in transcript",
      detail: "Right/left eye references conflict — verify which eye each result belongs to.",
      source: "Transcript"
    });
  }
  if (record.translation_review_required) {
    push({
      severity: "medium",
      title: "Translation requires review",
      detail: "The English processing copy is an unverified draft translation.",
      source: "Transcript"
    });
  }
  if (record.corrections_applied.some((correction) => correction.affectsClinicalMeaning)) {
    push({
      severity: "medium",
      title: "Clinical wording corrected after transcription",
      detail: "A correction touched clinically significant wording — confirm it against the audio.",
      source: "Transcript"
    });
  }
  if (record.extraction_safety_status === "draft_review_required") {
    push({
      severity: "medium",
      title: "Extraction based on a flagged transcript",
      detail: "Field drafts came from a transcript with quality or translation risk.",
      source: "Transcript"
    });
  }
  if (record.demo_helper_used) {
    push({
      severity: "high",
      title: "Demo helper transcript used",
      detail: "This transcript was inserted by the demo helper, not captured from a real recording.",
      source: "Transcript"
    });
  }

  // 4. Prompt coverage
  if (record.has_unvisited_prompts) {
    push({
      severity: "low",
      title: "Some prompts were not viewed",
      detail: "One or more clinical prompt cards were never opened during this test.",
      source: "Prompt"
    });
  }
  if (record.has_unrecorded_viewed_prompts) {
    push({
      severity: "low",
      title: "Some prompts were not captured in audio",
      detail: "Prompts were viewed while recording was not active, so there is no audio evidence for them.",
      source: "Prompt"
    });
  }

  return issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Grouped for display — see components/screens/QcScreen.tsx, which renders each non-empty group under its own short header instead of one undifferentiated badge row. */
export function qcReasonGroups(record: TestRecord): Array<{ category: QcReasonCategory; reasons: string[] }> {
  const categorized = buildCategorizedQcReasons(record);
  return QC_REASON_CATEGORY_ORDER.map((category) => ({
    category,
    reasons: categorized.filter((item) => item.category === category).map((item) => item.reason)
  })).filter((group) => group.reasons.length > 0);
}

/**
 * Single-field version of the per-field reasons buildCategorizedQcReasons
 * loops over for every field — reused by the audit CSV's long/tidy
 * `qc_reason` column (lib/csv.ts) so the two never drift on what counts as a
 * per-field problem. Empty string when the field has no field_confidence
 * entry or is currently clean.
 */
export function fieldQcReason(record: TestRecord, key: keyof ManualExtractedFields): string {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const meta = effective.field_confidence?.[key];
  if (!meta) return "";
  const label = FIELD_DISPLAY_LABELS[key];
  const isHighRisk = HIGH_RISK_EXTRACTED_FIELDS.includes(key);
  if (isHighRisk && !meta.value.trim()) return `${label} not captured`;
  if (meta.source === "manual" && isHighRisk) return `${label} manually entered — verify before approval`;
  if (meta.confidence === "low") return `Low-confidence extracted field: ${label}`;
  if (meta.requiresReview) return `Draft field extracted from transcript requires review: ${label}`;
  return "";
}

/** Export-facing QC status vocabulary — distinct from the internal QCStatus workflow enum (Unreviewed/In review/Corrected/Approved), which stays as the QC screen's approve workflow. This is what CSV exports show. */
export type ExportQcStatus = "clean" | "needs_review" | "reviewed" | "unresolved";

/**
 * "unresolved" only for a genuine sync FAILURE (not merely pending/local-only
 * — see the exemption in recordNeedsQc above); "needs_review" for anything
 * recordNeedsQc still flags; "reviewed" for a record that WAS flagged and a
 * human corrected/approved it; "clean" for a record that never needed a
 * human touch at all.
 */
export function exportQcStatus(record: TestRecord): ExportQcStatus {
  if (record.sync_status === "Failed") return "unresolved";
  if (recordNeedsQc(record)) return "needs_review";
  if (record.edited_by_user || record.qc_status === "Corrected") return "reviewed";
  return "clean";
}

/** Short display labels used only by qcReasonSummary below — deliberately shorter than FIELD_DISPLAY_LABELS so the composed sentence reads naturally. */
const SUMMARY_FIELD_LABELS: Partial<Record<keyof ManualExtractedFields, string>> = {
  right_eye_distance_result: "right eye result",
  left_eye_distance_result: "left eye result",
  final_readable_line: "final readable line"
};
const SUMMARY_FIELD_ORDER: Array<keyof ManualExtractedFields> = ["right_eye_distance_result", "left_eye_distance_result", "final_readable_line"];

/**
 * Short, curated, operator-facing summary sentence for the OOXii Data
 * Longlist's `qc_reason_summary` column — semicolon-joined, sentence case.
 * Deliberately NOT a reuse of qcReasons()/qcReasonGroups() above: those are
 * the full reviewer checklist (every status/sync/field signal); this is a
 * short "what's actually wrong" sentence for a spreadsheet cell. When prompt
 * coverage is incomplete, missing fields are phrased "missing X" (a
 * consequence of the coverage gap); otherwise a missing field is phrased "X
 * not captured" (the field itself is the problem).
 */
export function qcReasonSummary(record: TestRecord): string {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const fieldConfidence = effective.field_confidence;
  const parts: string[] = [];

  if (usedManualOverride(record)) parts.push("manual recording override");
  if (record.has_unvisited_prompts) parts.push("prompt coverage incomplete");
  if (!record.has_unvisited_prompts && (isLowConfidence(record) || record.transcript_quality_risk !== "low")) {
    parts.push("low-confidence transcript evidence");
  }

  const comfortMeta = fieldConfidence?.comfort_response;
  if (comfortMeta?.value.trim() && (comfortMeta.value.trim().toLowerCase() === "unclear" || comfortMeta.confidence === "low")) {
    parts.push("comfort response unclear");
  }

  if (fieldConfidence) {
    for (const key of SUMMARY_FIELD_ORDER) {
      const meta = fieldConfidence[key];
      if (meta && !meta.value.trim()) {
        parts.push(record.has_unvisited_prompts ? `missing ${SUMMARY_FIELD_LABELS[key]}` : `${SUMMARY_FIELD_LABELS[key]} not captured`);
      }
    }
    const cataractMeta = fieldConfidence.cataract_history_confirmed;
    if (cataractMeta && !cataractMeta.value.trim()) {
      parts.push(record.has_unvisited_prompts ? "missing cataract history" : "cataract history not captured");
    }
    const glassesMeta = fieldConfidence.glasses_selected;
    if (glassesMeta) {
      if (!glassesMeta.value.trim()) {
        parts.push(record.has_unvisited_prompts ? "missing glasses selected / dispensed" : "glasses selected / dispensed not captured");
      } else if (glassesMeta.source === "manual") {
        parts.push("glasses selected / dispensed manually entered — verify before approval");
      }
    }
  }

  if (parts.length === 0) return "";
  const joined = parts.join("; ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Short machine-readable slugs for the same signals qcReasonSummary composes into prose — for programmatic filtering/reporting, not currently a CSV column. */
export function qcReasonCodes(record: TestRecord): string[] {
  const effective = record.edited_extracted_json ?? record.extracted_json;
  const fieldConfidence = effective.field_confidence;
  const codes: string[] = [];
  if (usedManualOverride(record)) codes.push("manual_override");
  if (record.has_unvisited_prompts) codes.push("prompt_coverage_incomplete");
  if (isLowConfidence(record) || record.transcript_quality_risk !== "low") codes.push("low_confidence");
  if (fieldConfidence?.cataract_history_confirmed && !fieldConfidence.cataract_history_confirmed.value.trim()) codes.push("cataract_history_missing");
  if (fieldConfidence?.glasses_selected) {
    if (!fieldConfidence.glasses_selected.value.trim()) codes.push("glasses_selected_missing");
    else if (fieldConfidence.glasses_selected.source === "manual") codes.push("manual_edit_high_risk");
  }
  if (record.sync_status === "Failed") codes.push("sync_failed");
  return codes;
}

export function filterRecords(records: TestRecord[], filter: QcFilter): TestRecord[] {
  switch (filter) {
    case "needs_qc":
      return records.filter(recordNeedsQc);
    case "edited":
      return records.filter((record) => record.edited_by_user);
    case "missing_fields":
      return records.filter(hasMissingFields);
    case "reviewed":
      return records.filter((record) => record.qc_status === "Approved");
    case "all":
    default:
      return records;
  }
}
