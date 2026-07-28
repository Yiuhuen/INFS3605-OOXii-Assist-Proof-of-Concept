"use client";

import { useState } from "react";
import { AlertTriangle, FlaskConical, ListChecks, RefreshCw, RotateCcw, Save, ScrollText, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import {
  NOT_TESTED_FIELD_VALUE,
  UNKNOWN_FIELD_VALUE,
  type CorrectionHistoryEntry,
  type ExtractedFields,
  type ExtractionSafetyStatus,
  type FieldConfidence,
  type ManualExtractedFields,
  type ProcessingStatus,
  type PromptMarker,
  type SuggestedCorrection,
  type TranscriptQualityFlag,
  type TranscriptQualityFlagType,
  type TranscriptQualityReport,
  type TranscriptReviewStatus,
  type TranscriptSegment,
  type TranslationSafetyReport,
  type UnclearSegment
} from "@/lib/types";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import {
  CheckboxCard,
  Disclosure,
  DetailModal,
  InfoCard,
  PrimaryButton,
  SecondaryButton,
  StatusDot,
  TranscriptTab,
  WarningCard,
  type StatusDotTone
} from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";
import { HighlightedTranscript } from "@/components/TranscriptHighlight";

const FLAG_TYPE_LABELS: Record<TranscriptQualityFlagType, string> = {
  possible_misrecognition: "Possible misrecognition",
  ambiguous_negation: "Negation ambiguity",
  low_confidence: "Low recognition confidence",
  missing_expected_term: "Unexpected transcript for this step",
  translation_uncertain: "Translation uncertain",
  clinical_contradiction: "Eye-side ambiguity",
  unclear_segment: "Unclear segment",
  uncertain_language: "Uncertain language"
};

/** Groups quality alerts into categories a tester scans for, so the detail modal reads as a short scan instead of one undifferentiated wall of cards. */
const ALERT_GROUP_LABELS: Record<TranscriptQualityFlagType, string> = {
  possible_misrecognition: "Possible misrecognition",
  ambiguous_negation: "Meaning risk",
  clinical_contradiction: "Eye-side risk",
  translation_uncertain: "Translation review",
  low_confidence: "Low confidence",
  missing_expected_term: "Missing expected terms",
  unclear_segment: "Unclear segment",
  uncertain_language: "Uncertain language"
};

const ALERT_GROUP_ORDER: TranscriptQualityFlagType[] = [
  "possible_misrecognition",
  "ambiguous_negation",
  "clinical_contradiction",
  "translation_uncertain",
  "uncertain_language",
  "low_confidence",
  "missing_expected_term",
  "unclear_segment"
];

const REVIEW_STATUS_LABELS: Record<TranscriptReviewStatus, string> = {
  not_reviewed: "Not reviewed",
  reviewed_with_corrections: "Reviewed with corrections",
  reviewed_no_changes: "Reviewed, no changes",
  sent_to_qc: "Sent to QC"
};

const REVIEW_STATUS_TONES: Record<TranscriptReviewStatus, StatusDotTone> = {
  not_reviewed: "warn",
  reviewed_with_corrections: "good",
  reviewed_no_changes: "good",
  sent_to_qc: "danger"
};

const HIGH_RISK_FIELD_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

/** The 6 fields shown by default — the rest (cataract history confirmed, additional notes) appear in the "Show all fields" detail. */
const KEY_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
];

/** Right/left lens split (Group B) — its own section below the Core grid, alongside the existing glasses_selected card. */
const LENS_FIELD_ORDER: Array<keyof ManualExtractedFields> = ["right_lens_selected", "left_lens_selected"];
/** Astigmatism/toric/axis fields (Group C) — always shown; empty/not-mentioned is a normal, non-alarming state (never forces QC on its own, see lib/qc.ts). */
const ASTIGMATISM_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "right_astigmatism_present",
  "right_toric_power",
  "right_toric_axis",
  "left_astigmatism_present",
  "left_toric_power",
  "left_toric_axis"
];
/** Short-sighted/distance module fields (Group D) — rendered as full cards only once short_sighted_test_performed is "Yes"; otherwise a single compact "Not tested" row (spec). */
const SHORT_SIGHTED_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "short_sighted_right_result",
  "short_sighted_left_result",
  "short_sighted_both_eyes_result",
  "short_sighted_notes"
];
const NEW_MODULE_FIELD_KEYS = new Set<keyof ManualExtractedFields>([
  ...LENS_FIELD_ORDER,
  ...ASTIGMATISM_FIELD_ORDER,
  "short_sighted_test_performed",
  ...SHORT_SIGHTED_FIELD_ORDER
]);

/** Review order (spec): Missing -> Check -> Captured -> Reviewed, so a reviewer clears the gaps before skimming what's already confirmed. */
const REVIEW_PRIORITY: Record<"unknown" | "needs_review" | "captured" | "reviewed", number> = {
  unknown: 0,
  needs_review: 1,
  captured: 2,
  reviewed: 3
};

const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript" | "unknown", string> = {
  manual: "Manual entry",
  transcript: "Auto-filled from transcript",
  corrected_transcript: "Auto-filled from corrected transcript",
  unknown: "Not captured"
};

/**
 * Honest per-field review status — the load-bearing distinction this screen
 * exists for. "A value exists" is never enough to look done:
 *
 * - "suggested": auto-filled from the transcript, not yet confirmed by the
 *   tester. Extracted fields DEFAULT here, no matter how confident the
 *   extraction was — a clean regex match is still a draft.
 * - "reviewed": the tester has explicitly confirmed the fields ("Confirm all
 *   fields reviewed" below). Only then may a field read as settled.
 * - "needs_review": low/medium confidence, contradiction, misheard alias, or
 *   any other requiresReview signal from lib/fieldExtraction.ts.
 * - "manual": the tester typed this value themselves after extraction —
 *   shown as its own status, never dressed up as a transcript-backed value.
 * - "unknown": nothing captured.
 * - "not_tested": the optional short-sighted/distance module — never
 *   Missing, never forces QC on its own (see lib/qc.ts).
 */
type FieldReviewStatus = "suggested" | "reviewed" | "needs_review" | "manual" | "unknown" | "not_tested";

/** Closed status vocabulary (spec): Captured / Reviewed / Check / Edited / Missing / Not tested — one dot per row, sentence case. */
const STATUS_PRESENTATION: Record<FieldReviewStatus, { label: string; tone: StatusDotTone }> = {
  suggested: { label: "Captured", tone: "neutral" },
  reviewed: { label: "Reviewed", tone: "good" },
  needs_review: { label: "Check", tone: "warn" },
  manual: { label: "Edited", tone: "neutral" },
  unknown: { label: "Missing", tone: "muted" },
  not_tested: { label: "Not tested", tone: "muted" }
};

function deriveFieldStatus(value: string, meta: FieldConfidence | undefined, confirmed: boolean): FieldReviewStatus {
  const trimmed = value.trim();
  if (trimmed === NOT_TESTED_FIELD_VALUE) return "not_tested";
  const hasValue = Boolean(trimmed) && value !== UNKNOWN_FIELD_VALUE;
  if (!hasValue) return "unknown";
  if (meta?.source === "manual") return "manual";
  if (meta?.requiresReview) return "needs_review";
  return confirmed ? "reviewed" : "suggested";
}

/** Sort-priority bucket for a field's status — "manual"/"suggested" both read as "Captured" for ordering purposes; only an explicitly confirmed "reviewed" field sorts last. "not_tested" sorts alongside "reviewed" — settled, nothing to chase. */
function priorityForStatus(status: FieldReviewStatus | undefined): number {
  if (status === "unknown") return REVIEW_PRIORITY.unknown;
  if (status === "needs_review") return REVIEW_PRIORITY.needs_review;
  if (status === "reviewed" || status === "not_tested") return REVIEW_PRIORITY.reviewed;
  return REVIEW_PRIORITY.captured;
}

function severityDotTone(severity: TranscriptQualityFlag["severity"]): StatusDotTone {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warn";
  return "neutral";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatClock(timestamp: string | number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const NAVIGATION_ACTION_LABELS: Record<PromptMarker["navigationAction"], string> = {
  start: "Started",
  next: "Swiped next",
  previous: "Swiped back",
  finish: "Finished"
};

function QualityFlagCard({
  flag,
  correction,
  isIgnored,
  onApply,
  onIgnore,
  onMarkUnclear
}: {
  flag: TranscriptQualityFlag;
  correction?: SuggestedCorrection;
  isIgnored: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onMarkUnclear: () => void;
}) {
  return (
    <div className="field-card space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusDot label={FLAG_TYPE_LABELS[flag.type]} tone={severityDotTone(flag.severity)} />
        {flag.translationRiskType && <span className="text-[11px] font-semibold opacity-60">Translation</span>}
        {isIgnored && <span className="text-[11px] font-semibold opacity-60">Ignored</span>}
      </div>
      <p className="text-sm">
        <span className="font-bold">Detected:</span> &ldquo;{flag.originalText}&rdquo;
      </p>
      {flag.suggestedText && (
        <p className="text-sm">
          <span className="font-bold">Suggestion:</span> &ldquo;{flag.suggestedText}&rdquo;
        </p>
      )}
      <p className="text-xs opacity-70">{flag.reason}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {correction && (
          <SecondaryButton className="py-2 text-xs" onClick={onApply}>
            Apply suggestion
          </SecondaryButton>
        )}
        <SecondaryButton className="py-2 text-xs" onClick={onIgnore} disabled={isIgnored}>
          {isIgnored ? "Ignored" : "Ignore"}
        </SecondaryButton>
        <SecondaryButton className="py-2 text-xs" onClick={onMarkUnclear}>
          Mark unclear
        </SecondaryButton>
      </div>
    </div>
  );
}

export function ReviewScreen({
  clientId,
  isOnline,
  onBack,
  onRerecordRequest,
  onSave,
  // Fields
  extracted,
  editedFields,
  onEditField,
  extractionSafetyStatus,
  onAutoFill,
  autoFillSummary,
  fieldsReviewedConfirmed,
  onToggleFieldsReviewed,
  fieldSuggestions,
  onUseSuggestion,
  // Audio + transcript
  rawTranscript,
  rawTranscriptLanguageName,
  englishProcessingTranscript,
  correctedTranscript,
  setCorrectedTranscript,
  processingStatus,
  needsQc,
  manualOverrideReason,
  audioUrl,
  recordingDurationSeconds,
  unclearSegments,
  promptMarkers,
  transcriptSegments,
  missingPromptLabels,
  unrecordedPromptLabels,
  canGenerateDraft,
  onGenerateDraft,
  qualityReport,
  translationReport,
  appliedCorrections,
  ignoredFlagIds,
  reviewStatus,
  onApplyCorrection,
  onIgnoreFlag,
  onMarkFlagUnclear,
  demoHelpersEnabled,
  demoHelperUsed,
  onInsertDemoTranscript
}: {
  clientId: string;
  isOnline: boolean;
  onBack: () => void;
  /** Opens the "Discard this recording and rerecord?" confirmation. */
  onRerecordRequest: () => void;
  onSave: () => void;
  extracted: ExtractedFields;
  editedFields: ExtractedFields | null;
  onEditField: (key: keyof ManualExtractedFields, value: string) => void;
  /** "draft_review_required" when the transcript/translation this extraction is based on was flagged uncertain — see lib/transcriptQuality.ts deriveExtractionSafetyStatus. */
  extractionSafetyStatus: ExtractionSafetyStatus;
  /** Re-runs draft extraction against the latest corrected transcript — only ever fills fields the tester hasn't hand-edited. */
  onAutoFill: () => void;
  /** e.g. "4 fields suggested, 2 still need review." — set right after onAutoFill runs, null otherwise. */
  autoFillSummary: string | null;
  /** Tester's explicit "Fields reviewed" confirmation — see lib/qc.ts evaluateNeedsQc fieldsRequireReviewUnconfirmed. */
  fieldsReviewedConfirmed: boolean;
  onToggleFieldsReviewed: () => void;
  /** Non-destructive transcript-derived values for fields the tester has already hand-edited — never auto-applied, see app/page.tsx autoFillFromTranscript. */
  fieldSuggestions: Partial<Record<keyof ManualExtractedFields, string>>;
  onUseSuggestion: (key: keyof ManualExtractedFields) => void;
  rawTranscript: string;
  rawTranscriptLanguageName: string;
  englishProcessingTranscript: string;
  correctedTranscript: string;
  setCorrectedTranscript: (value: string) => void;
  processingStatus: ProcessingStatus;
  needsQc: boolean;
  manualOverrideReason: string;
  audioUrl: string;
  recordingDurationSeconds: number;
  unclearSegments: UnclearSegment[];
  promptMarkers: PromptMarker[];
  transcriptSegments: TranscriptSegment[];
  /** Client-facing prompt text for any fixed-sequence step the tester never viewed at all — never a reorder, just a gap to flag. */
  missingPromptLabels: string[];
  /** Client-facing prompt text for steps the tester DID view, but never while continuous audio recording was active (e.g. mic failure) — distinct from missingPromptLabels; must never be worded as "never shown". */
  unrecordedPromptLabels: string[];
  /** True when recording happened but no live transcript segments were captured — audio exists, so a manual rebuild is worth offering instead of leaving the tester stuck. */
  canGenerateDraft: boolean;
  onGenerateDraft: () => void;
  qualityReport: TranscriptQualityReport;
  translationReport: TranslationSafetyReport;
  appliedCorrections: CorrectionHistoryEntry[];
  ignoredFlagIds: string[];
  reviewStatus: TranscriptReviewStatus;
  onApplyCorrection: (correction: SuggestedCorrection) => void;
  onIgnoreFlag: (flagId: string) => void;
  onMarkFlagUnclear: (flag: TranscriptQualityFlag) => void;
  /** True only in a local dev build, or when an operator has explicitly opted in via NEXT_PUBLIC_DEMO_HELPERS=true — see lib/demoHelpers.ts. Hidden in a normal deployment. */
  demoHelpersEnabled: boolean;
  /** True once "Insert sample transcript for demo" has been used on this in-progress record — never set by real recording/STT. */
  demoHelperUsed: boolean;
  onInsertDemoTranscript: () => void;
}) {
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  const [transcriptDetailOpen, setTranscriptDetailOpen] = useState(false);
  /** Full transcript is collapsed by default — a 20-minute recording must never open as a wall of text. */
  const [fullTranscriptExpanded, setFullTranscriptExpanded] = useState(false);
  /** Evidence phrase to spotlight in the transcript once expanded — set by a field's "View in transcript" link, so evidence highlighting stays in-page instead of a separate modal jump. */
  const [focusedEvidence, setFocusedEvidence] = useState<string | undefined>(undefined);

  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields) || extractionSafetyStatus === "draft_review_required";

  const allFieldKeys = Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>;
  // Right/left lens, astigmatism, and the short-sighted module each get their
  // own dedicated section + count below (spec) — kept out of the
  // top-of-screen summary and the generic "Show all fields" modal so an
  // ordinary record with no astigmatism/short-sighted data never reads as
  // "N missing" for fields that were simply never applicable.
  // additional_notes is a free-text optional field, never extracted — counting
  // it as perpetually "unknown" would make the summary read scarier than the
  // clinical reality. Every clinical field (the 6 key ones + cataract) counts.
  const countedKeys = allFieldKeys.filter((key) => key !== "additional_notes" && !NEW_MODULE_FIELD_KEYS.has(key));
  const statusByKey = new Map<keyof ManualExtractedFields, FieldReviewStatus>(
    allFieldKeys.map((key) => [key, deriveFieldStatus(String(effective[key] ?? ""), effective.field_confidence?.[key], fieldsReviewedConfirmed)])
  );
  const statuses = countedKeys.map((key) => statusByKey.get(key)!);
  // "Captured" = a value exists and nothing flags it for a check — covers
  // auto-filled, tester-confirmed, and manually entered values. Edited values
  // still carry their own "Edited" row status (and QC flag when high-risk) so
  // they are never mistaken for transcript-backed values.
  const capturedCount = statuses.filter((status) => status === "suggested" || status === "reviewed" || status === "manual").length;
  const editedCount = statuses.filter((status) => status === "manual").length;
  const needsReviewCount = statuses.filter((status) => status === "needs_review").length;
  const unknownCount = statuses.filter((status) => status === "unknown").length;
  const otherFieldKeys = allFieldKeys.filter((key) => !KEY_FIELD_ORDER.includes(key) && !NEW_MODULE_FIELD_KEYS.has(key));

  const shortSightedPerformedValue = String(effective.short_sighted_test_performed ?? "").trim();
  const shortSightedPerformed = shortSightedPerformedValue === "Yes";
  const glassesAstigmatismStatuses = [...LENS_FIELD_ORDER, ...ASTIGMATISM_FIELD_ORDER].map((key) => statusByKey.get(key)!);
  const glassesAstigmatismCaptured = glassesAstigmatismStatuses.filter((status) => status === "suggested" || status === "reviewed" || status === "manual").length;
  const shortSightedStatuses = SHORT_SIGHTED_FIELD_ORDER.map((key) => statusByKey.get(key)!);
  const shortSightedCaptured = shortSightedStatuses.filter((status) => status === "suggested" || status === "reviewed" || status === "manual").length;

  function byReviewPriority(a: keyof ManualExtractedFields, b: keyof ManualExtractedFields): number {
    return priorityForStatus(statusByKey.get(a)) - priorityForStatus(statusByKey.get(b));
  }
  const sortedKeyFields = [...KEY_FIELD_ORDER].sort(byReviewPriority);
  const sortedAllFields = [...KEY_FIELD_ORDER, ...otherFieldKeys].sort(byReviewPriority);

  /** Expands the transcript section and highlights/scrolls to this field's supporting evidence — the in-page replacement for the old separate evidence modal. */
  function openTranscriptEvidence(evidence: string) {
    setFocusedEvidence(evidence);
    setFullTranscriptExpanded(true);
  }

  function renderFieldCard(key: keyof ManualExtractedFields) {
    const rawValue = String(effective[key] ?? "");
    const fieldMeta = effective.field_confidence?.[key];
    const status = deriveFieldStatus(rawValue, fieldMeta, fieldsReviewedConfirmed);
    const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
    const hasValue = status !== "unknown";
    const attention = status === "needs_review" || (status === "unknown" && isHighRisk);
    const presentation = STATUS_PRESENTATION[status];

    const detailParts: string[] = [];
    if (hasValue && fieldMeta) {
      detailParts.push(SOURCE_LABELS[fieldMeta.source]);
      if (fieldMeta.source !== "manual" && fieldMeta.confidence !== "unknown") {
        detailParts.push(`${fieldMeta.confidence} confidence`);
      }
      if (status === "manual" && isHighRisk) detailParts.push("Needs QC");
    }

    return (
      <label
        key={key}
        className={`block rounded-xl border px-3 py-2.5 ${attention ? "border-yellow-300/60 bg-yellow-200/10" : "border-field-line bg-field-card"}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold leading-snug opacity-90">{FIELD_DISPLAY_LABELS[key]}</span>
          <StatusDot label={presentation.label} tone={presentation.tone} className="shrink-0" />
        </span>
        <input
          className="field-input mt-1.5 min-h-[2.75rem] px-3 text-sm"
          value={rawValue === UNKNOWN_FIELD_VALUE ? "" : rawValue}
          placeholder={hasValue ? undefined : "Not captured"}
          onChange={(event) => onEditField(key, event.target.value)}
        />
        {detailParts.length > 0 && <p className="mt-1 text-[11px] opacity-60">{detailParts.join(" · ")}</p>}
        {fieldMeta?.evidence && hasValue && (
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-1 text-left text-[11px] font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              openTranscriptEvidence(fieldMeta.evidence!);
            }}
            title="Jump to this evidence in the transcript"
          >
            <ScrollText className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1 break-words">View in transcript: &ldquo;{fieldMeta.evidence}&rdquo;</span>
          </button>
        )}
        {status === "unknown" && (
          <p className="mt-1 text-[11px] opacity-60">No transcript evidence found — enter manually or leave for QC.</p>
        )}
        {status !== "unknown" && fieldMeta?.reason && <p className="mt-1 text-[11px] opacity-60">{fieldMeta.reason}</p>}
        {fieldSuggestions[key] && (
          <button
            type="button"
            className="mt-1 line-clamp-1 text-left text-[11px] font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              onUseSuggestion(key);
            }}
          >
            Use suggestion: {fieldSuggestions[key]}
          </button>
        )}
      </label>
    );
  }

  // --- Transcript / audio (supporting evidence) ---
  const transcriptLineCount = transcriptSegments.filter((segment) => segment.isFinal && segment.text.trim()).length;
  const allFlags = [...qualityReport.flags, ...translationReport.flags];
  const correctionsByFlagId = new Map(qualityReport.suggestedCorrections.map((correction) => [correction.relatedFlagId, correction]));
  const alertGroups = ALERT_GROUP_ORDER.map((type) => ({
    type,
    label: ALERT_GROUP_LABELS[type],
    flags: allFlags.filter((flag) => flag.type === type)
  })).filter((group) => group.flags.length > 0);
  const showEnglishProcessingCopy = translationReport.isTranslation || englishProcessingTranscript.trim() !== rawTranscript.trim();
  const hasRecordingNotes =
    Boolean(manualOverrideReason.trim()) ||
    canGenerateDraft ||
    unclearSegments.length > 0 ||
    missingPromptLabels.length > 0 ||
    unrecordedPromptLabels.length > 0;
  const recordingNotesCount =
    (manualOverrideReason.trim() ? 1 : 0) + unclearSegments.length + missingPromptLabels.length + unrecordedPromptLabels.length;
  const topFlag = allFlags[0];

  return (
    <OneScreenShell
      header={
        <CompactHeader
          title="Review test"
          subtitle={clientId}
          onBack={onBack}
          isOnline={isOnline}
          right={<StatusDot label={REVIEW_STATUS_LABELS[reviewStatus]} tone={REVIEW_STATUS_TONES[reviewStatus]} />}
        />
      }
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          <CheckboxCard
            checked={fieldsReviewedConfirmed}
            onToggle={onToggleFieldsReviewed}
            label="Confirm all fields reviewed — checked against the recording."
          />
          <div className="flex items-center gap-2">
            <SecondaryButton className="min-h-[2.75rem] shrink-0 whitespace-nowrap px-3 text-sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onRerecordRequest}>
              Rerecord
            </SecondaryButton>
            <PrimaryButton
              fullWidth
              className="min-h-[2.75rem] flex-1 text-sm"
              icon={<Save className="h-4 w-4" />}
              onClick={onSave}
              disabled={!fieldsReviewedConfirmed}
            >
              {qcRequired ? "Save with QC" : "Save reviewed record"}
            </PrimaryButton>
          </div>
          {!fieldsReviewedConfirmed && (
            <p className="text-center text-[11px] opacity-60">Confirm the fields above to enable saving. Fields flagged for QC stay flagged after saving.</p>
          )}
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
        {(needsQc || processingStatus === "needs_qc") && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
            <StatusDot label="Needs QC" tone="danger" />
            {demoHelperUsed && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)]">
                <FlaskConical className="h-3.5 w-3.5" />
                Demo transcript
              </span>
            )}
          </div>
        )}

        {/* Section 1 — Fields to check: the primary review surface, captured fields first. */}
        <div className="shrink-0">
          <p className="text-sm font-bold">
            {capturedCount} captured · {unknownCount} missing · {needsReviewCount} check
            {editedCount > 0 && ` · ${editedCount} edited`}
          </p>
          <p className="mt-0.5 text-[11px] opacity-60">
            Draft fields from the transcript — confirm before saving.
            {qcRequired && " This record stays flagged for QC after saving."}
            {demoHelperUsed && " Demo transcript in use."}
          </p>
        </div>

        {extractionSafetyStatus === "draft_review_required" && (
          <div className="shrink-0">
            <WarningCard icon={<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}>
              <span className="line-clamp-2">Draft extraction from a flagged transcript — verify each field against the audio.</span>
            </WarningCard>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <SecondaryButton className="min-h-[2.75rem] py-1.5 text-xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={onAutoFill}>
            Auto-fill from transcript
          </SecondaryButton>
          <button
            className="min-h-[2.75rem] px-2 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={() => setAllFieldsOpen(true)}
          >
            Show all fields
          </button>
        </div>
        {autoFillSummary && (
          <div className="shrink-0">
            <InfoCard>
              <span className="line-clamp-1">{autoFillSummary}</span>
            </InfoCard>
          </div>
        )}

        <div className="grid shrink-0 grid-cols-1 content-start gap-2 sm:grid-cols-2">
          {sortedKeyFields.map((key) => renderFieldCard(key))}
        </div>

        {/* Right/left lens split + astigmatism — always shown; an unmentioned
            astigmatism field reads as a normal Missing dot here, but never
            forces QC on its own (lib/qc.ts OPTIONAL_MODULE_FIELD_KEYS). */}
        <div className="shrink-0">
          <p className="text-xs font-bold opacity-80">
            Glasses &amp; astigmatism · {glassesAstigmatismCaptured} of {LENS_FIELD_ORDER.length + ASTIGMATISM_FIELD_ORDER.length} captured
          </p>
          <div className="mt-2 grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            {[...LENS_FIELD_ORDER, ...ASTIGMATISM_FIELD_ORDER].map((key) => renderFieldCard(key))}
          </div>
        </div>

        {/* Optional short-sighted/distance module. Compact "Not tested" row
            unless the tester has explicitly said this module was performed —
            never a wall of Missing dots for a module most tests never run. */}
        <div className="shrink-0">
          <p className="text-xs font-bold opacity-80">
            Short-sighted (optional) · {shortSightedPerformed ? `${shortSightedCaptured} of ${SHORT_SIGHTED_FIELD_ORDER.length} captured` : "Not tested"}
          </p>
          <div className="mt-2 grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            {renderFieldCard("short_sighted_test_performed")}
            {shortSightedPerformed && SHORT_SIGHTED_FIELD_ORDER.map((key) => renderFieldCard(key))}
          </div>
          {!shortSightedPerformed && (
            <p className="mt-1.5 text-[11px] opacity-60">
              {shortSightedPerformedValue === "No" || shortSightedPerformedValue === "Not applicable"
                ? "Short-sighted test not performed — no QC required."
                : "Was the short-sighted test performed? Enter above to confirm."}
            </p>
          )}
        </div>

        {/* Section 2 — Audio: supporting evidence, always visible (not behind a toggle). */}
        <div className="field-card-soft flex shrink-0 items-center justify-between gap-2 py-2">
          <p className="text-xs font-bold opacity-80">Audio record</p>
          <span className="text-xs font-semibold tabular-nums opacity-70">{formatDuration(recordingDurationSeconds)}</span>
        </div>
        {audioUrl ? <audio className="h-8 shrink-0 w-full" controls src={audioUrl} /> : <p className="shrink-0 text-xs opacity-60">No audio available.</p>}

        {hasRecordingNotes && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs opacity-80">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
            <span className="line-clamp-1">{recordingNotesCount} recording note{recordingNotesCount === 1 ? "" : "s"} flagged for QC.</span>
            {canGenerateDraft && (
              <SecondaryButton className="px-2 py-1 text-xs" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onGenerateDraft}>
                Generate draft
              </SecondaryButton>
            )}
          </div>
        )}

        {allFlags.length > 0 && (
          <div className="shrink-0 rounded-xl border border-field-line bg-field-surface px-3 py-2 text-xs">
            <p className="line-clamp-1 font-semibold opacity-90">
              {allFlags.length} quality alert{allFlags.length === 1 ? "" : "s"} — {topFlag && FLAG_TYPE_LABELS[topFlag.type]}
            </p>
          </div>
        )}

        {/* Section 3 — Transcript: collapsed by default, supporting evidence only. Evidence links above expand this and scroll/highlight the relevant phrase. */}
        <div className="shrink-0">
          <TranscriptTab
            title="Full transcript"
            subtitle={transcriptLineCount > 0 ? `${transcriptLineCount} line${transcriptLineCount === 1 ? "" : "s"} captured` : "Full text"}
            expanded={fullTranscriptExpanded}
            onToggle={() => setFullTranscriptExpanded((value) => !value)}
            maxHeightClass="max-h-48"
          >
            <div className="text-sm">
              <HighlightedTranscript text={correctedTranscript} focusPhrase={focusedEvidence} />
            </div>
          </TranscriptTab>
        </div>

        <div className="shrink-0">
          <Disclosure label="Edit transcript">
            <textarea
              className="field-input resize-none text-sm"
              rows={5}
              aria-label="Corrected transcript"
              value={correctedTranscript}
              onChange={(event) => setCorrectedTranscript(event.target.value)}
            />
            <p className="mt-1 text-[11px] opacity-60">Edits change only the corrected copy — the raw transcript is preserved.</p>
          </Disclosure>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <button
            className="text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={() => setTranscriptDetailOpen(true)}
          >
            View full transcript &amp; details
          </button>
          {demoHelpersEnabled && (
            <SecondaryButton className="px-2 py-1 text-xs" icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={onInsertDemoTranscript}>
              Insert demo transcript
            </SecondaryButton>
          )}
        </div>
      </div>

      <DetailModal open={allFieldsOpen} title="All captured fields" onClose={() => setAllFieldsOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs opacity-70">Editing fields does not change the source transcript. Edited fields are flagged for QC review.</p>
          {sortedAllFields.map((key) => renderFieldCard(key))}
        </div>
      </DetailModal>

      <DetailModal open={transcriptDetailOpen} title="Full transcript & details" onClose={() => setTranscriptDetailOpen(false)}>
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-field-muted">Raw draft transcript ({rawTranscriptLanguageName})</p>
              <StatusDot label="Preserved" tone="good" />
            </div>
            <p className="mt-1 text-xs opacity-60">Read-only — generated from audio, never edited or overwritten.</p>
            <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">{rawTranscript || "No transcript captured yet."}</pre>
          </div>

          {showEnglishProcessingCopy && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-field-muted">English processing copy</p>
                <StatusDot
                  label={translationReport.isTranslation ? translationReport.label : "Local mock only"}
                  tone={translationReport.isTranslation ? "warn" : "neutral"}
                />
              </div>
              <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">
                {englishProcessingTranscript || "No transcript captured yet."}
              </pre>
            </div>
          )}

          {hasRecordingNotes && (
            <div className="field-card space-y-2 text-sm">
              <p className="text-xs font-bold text-field-muted">Recording notes</p>
              {manualOverrideReason.trim() && (
                <p className="opacity-80">
                  <span className="font-bold">Manual override:</span> {manualOverrideReason.trim()}
                </p>
              )}
              {unclearSegments.length > 0 && (
                <p className="opacity-80">
                  {unclearSegments.length} section{unclearSegments.length === 1 ? "" : "s"} flagged unclear during recording —
                  verify against the audio in QC.
                </p>
              )}
              {missingPromptLabels.length > 0 && (
                <p className="opacity-80">
                  {missingPromptLabels.length} prompt{missingPromptLabels.length === 1 ? "" : "s"} not viewed — flagged for QC:{" "}
                  {missingPromptLabels.join(" · ")}
                </p>
              )}
              {unrecordedPromptLabels.length > 0 && (
                <p className="opacity-80">
                  {unrecordedPromptLabels.length} prompt{unrecordedPromptLabels.length === 1 ? "" : "s"} viewed but not captured
                  in audio because recording failed — flagged for QC: {unrecordedPromptLabels.join(" · ")}
                </p>
              )}
            </div>
          )}

          {alertGroups.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-field-muted">
                Quality alerts — draft transcript, review required ({allFlags.length})
              </p>
              {alertGroups.map((group) => (
                <div key={group.type} className="space-y-2">
                  <p className="text-xs font-bold opacity-70">{group.label}</p>
                  {group.flags.map((flag) => (
                    <QualityFlagCard
                      key={flag.id}
                      flag={flag}
                      correction={correctionsByFlagId.get(flag.id)}
                      isIgnored={ignoredFlagIds.includes(flag.id)}
                      onApply={() => {
                        const correction = correctionsByFlagId.get(flag.id);
                        if (correction) onApplyCorrection(correction);
                      }}
                      onIgnore={() => onIgnoreFlag(flag.id)}
                      onMarkUnclear={() => onMarkFlagUnclear(flag)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {appliedCorrections.length > 0 && (
            <Disclosure label={`Corrections applied (${appliedCorrections.length})`}>
              <div className="space-y-2">
                {appliedCorrections.map((correction) => (
                  <p key={correction.id} className="text-sm opacity-80">
                    &ldquo;{correction.originalText}&rdquo; → &ldquo;{correction.suggestedText}&rdquo;
                    {correction.affectsClinicalMeaning && <span className="ml-2 text-xs font-bold text-[var(--danger)]">Clinical — verify in QC</span>}
                  </p>
                ))}
              </div>
            </Disclosure>
          )}

          {promptMarkers.length > 0 && (
            <Disclosure label={`Prompt markers (${promptMarkers.length})`}>
              <div className="space-y-2">
                {promptMarkers.map((marker) => (
                  <div key={marker.id} className="flex items-start gap-2 text-sm opacity-80">
                    <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="tabular-nums opacity-60">{formatClock(marker.timestamp)}</span>
                    <span className="text-[11px] font-semibold opacity-50">{NAVIGATION_ACTION_LABELS[marker.navigationAction]}</span>
                    <span>{marker.promptText}</span>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}

          <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
            Audio is the source record — the raw transcript is never edited. Suggestions only ever change the corrected transcript.
          </InfoCard>
        </div>
      </DetailModal>
    </OneScreenShell>
  );
}
