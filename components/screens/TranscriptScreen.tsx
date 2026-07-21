"use client";

import { AlertTriangle, Languages, ListChecks, PencilLine, RefreshCw, ShieldCheck } from "lucide-react";
import type {
  CorrectionHistoryEntry,
  ProcessingStatus,
  PromptMarker,
  SuggestedCorrection,
  TranscriptQualityFlag,
  TranscriptQualityFlagType,
  TranscriptQualityReport,
  TranscriptReviewStatus,
  TranslationSafetyReport,
  UnclearSegment
} from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { Disclosure, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, type BadgeTone } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const FLAG_TYPE_LABELS: Record<TranscriptQualityFlagType, string> = {
  possible_misrecognition: "Possible misrecognition",
  ambiguous_negation: "Negation ambiguity",
  low_confidence: "Low recognition confidence",
  missing_expected_term: "Unexpected transcript for this step",
  translation_uncertain: "Translation uncertain",
  clinical_contradiction: "Eye-side ambiguity",
  unclear_segment: "Unclear segment"
};

/** Groups quality alerts into the six categories a tester scans for, so the list reads as a short scan instead of one undifferentiated wall of cards. */
const ALERT_GROUP_LABELS: Record<TranscriptQualityFlagType, string> = {
  possible_misrecognition: "Possible misrecognition",
  ambiguous_negation: "Meaning risk",
  clinical_contradiction: "Eye-side risk",
  translation_uncertain: "Translation review",
  low_confidence: "Low confidence",
  missing_expected_term: "Missing expected terms",
  unclear_segment: "Unclear segment"
};

const ALERT_GROUP_ORDER: TranscriptQualityFlagType[] = [
  "possible_misrecognition",
  "ambiguous_negation",
  "clinical_contradiction",
  "translation_uncertain",
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

const REVIEW_STATUS_TONES: Record<TranscriptReviewStatus, BadgeTone> = {
  not_reviewed: "warn",
  reviewed_with_corrections: "good",
  reviewed_no_changes: "good",
  sent_to_qc: "danger"
};

function severityTone(severity: TranscriptQualityFlag["severity"]): BadgeTone {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warn";
  return "neutral";
}

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
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={FLAG_TYPE_LABELS[flag.type]} tone={severityTone(flag.severity)} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        {flag.translationRiskType && <StatusBadge label="Translation" tone="neutral" icon={<Languages className="h-3.5 w-3.5" />} />}
        {isIgnored && <StatusBadge label="Ignored" tone="neutral" />}
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

export function TranscriptScreen({
  clientId,
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
  missingPromptLabels,
  isOnline,
  canGenerateDraft,
  onGenerateDraft,
  onNext,
  onBack,
  qualityReport,
  translationReport,
  appliedCorrections,
  ignoredFlagIds,
  reviewStatus,
  onApplyCorrection,
  onIgnoreFlag,
  onMarkFlagUnclear
}: {
  clientId: string;
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
  /** Client-facing prompt text for any fixed-sequence step the swipe card never showed while recording — never a reorder, just a gap to flag. */
  missingPromptLabels: string[];
  isOnline: boolean;
  /** True when recording happened but no live transcript segments were captured — audio exists, so a manual rebuild is worth offering instead of leaving the tester stuck. */
  canGenerateDraft: boolean;
  onGenerateDraft: () => void;
  onNext: () => void;
  onBack: () => void;
  qualityReport: TranscriptQualityReport;
  translationReport: TranslationSafetyReport;
  appliedCorrections: CorrectionHistoryEntry[];
  ignoredFlagIds: string[];
  reviewStatus: TranscriptReviewStatus;
  onApplyCorrection: (correction: SuggestedCorrection) => void;
  onIgnoreFlag: (flagId: string) => void;
  onMarkFlagUnclear: (flag: TranscriptQualityFlag) => void;
}) {
  const allFlags = [...qualityReport.flags, ...translationReport.flags];
  const correctionsByFlagId = new Map(qualityReport.suggestedCorrections.map((correction) => [correction.relatedFlagId, correction]));
  const alertGroups = ALERT_GROUP_ORDER.map((type) => ({
    type,
    label: ALERT_GROUP_LABELS[type],
    flags: allFlags.filter((flag) => flag.type === type)
  })).filter((group) => group.flags.length > 0);
  // Showing the same text twice (once as "raw", once as "English processing
  // copy") for an English-language record adds nothing — only show this
  // panel when it's an actual translation-review artifact for a non-English
  // record, i.e. when it genuinely differs from the raw transcript.
  const showEnglishProcessingCopy = translationReport.isTranslation || englishProcessingTranscript.trim() !== rawTranscript.trim();
  const hasRecordingNotes = Boolean(manualOverrideReason.trim()) || canGenerateDraft || unclearSegments.length > 0 || missingPromptLabels.length > 0;

  return (
    <section>
      <ScreenHeader title="Review transcript" subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <div className="field-card mb-4">
        <div className="flex items-center justify-between">
          <p className="font-bold">Audio record</p>
          <StatusBadge label={formatDuration(recordingDurationSeconds)} tone="neutral" />
        </div>
        {audioUrl ? (
          <audio className="mt-3 w-full" controls src={audioUrl} />
        ) : (
          <p className="mt-2 text-sm opacity-60">No audio available for this record.</p>
        )}
      </div>

      <p className="mb-3 text-sm font-bold opacity-90">Draft transcript — review required.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
        {/* processingStatusLabel already reads "Needs QC" once processingStatus is "needs_qc" — only repeat it here when the transcript isn't captured yet, so the same risk isn't shown twice. */}
        {needsQc && processingStatus !== "needs_qc" && (
          <StatusBadge label="Needs QC" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        )}
        <StatusBadge label={`Review: ${REVIEW_STATUS_LABELS[reviewStatus]}`} tone={REVIEW_STATUS_TONES[reviewStatus]} />
      </div>

      {hasRecordingNotes && (
        <div className="field-card mb-5 space-y-2 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Recording notes</p>
          {manualOverrideReason.trim() && (
            <p className="opacity-80">
              <span className="font-bold">Manual override:</span> {manualOverrideReason.trim()}
            </p>
          )}
          {canGenerateDraft && (
            <div>
              <p className="opacity-80">Audio recorded, but no live transcript segments were captured.</p>
              <SecondaryButton className="mt-1.5" icon={<RefreshCw className="h-4 w-4" />} onClick={onGenerateDraft}>
                Generate transcript from captured draft
              </SecondaryButton>
            </div>
          )}
          {unclearSegments.length > 0 && (
            <p className="opacity-80">
              {unclearSegments.length} section{unclearSegments.length === 1 ? "" : "s"} flagged unclear during recording — verify
              against the audio in QC.
            </p>
          )}
          {missingPromptLabels.length > 0 && (
            <p className="opacity-80">
              {missingPromptLabels.length} prompt{missingPromptLabels.length === 1 ? "" : "s"} never shown — flagged for QC:{" "}
              {missingPromptLabels.join(" · ")}
            </p>
          )}
        </div>
      )}

      {alertGroups.length > 0 && (
        <div className="mb-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wide text-field-muted">
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
        <div className="mb-5">
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
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Raw draft transcript ({rawTranscriptLanguageName})</p>
        <StatusBadge label="Preserved" tone="good" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
      </div>
      <p className="mt-1 text-xs opacity-60">Read-only — generated from audio, never edited or overwritten.</p>
      <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
        {rawTranscript || "No transcript captured yet."}
      </pre>

      {showEnglishProcessingCopy && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-field-muted">English processing copy</p>
            <StatusBadge
              label={translationReport.isTranslation ? translationReport.label : "Local mock only"}
              tone={translationReport.isTranslation ? "warn" : "neutral"}
              icon={<Languages className="h-3.5 w-3.5" />}
            />
          </div>
          <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
            {englishProcessingTranscript || "No transcript captured yet."}
          </pre>
        </>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Corrected transcript — tester-reviewed</p>
        <StatusBadge label="Editable" tone="warn" icon={<PencilLine className="h-3.5 w-3.5" />} />
      </div>
      <textarea
        className="field-input mt-2 min-h-32"
        value={correctedTranscript}
        onChange={(event) => setCorrectedTranscript(event.target.value)}
      />

      {promptMarkers.length > 0 && (
        <div className="mt-5">
          <Disclosure label={`Prompt markers (${promptMarkers.length})`}>
            <div className="space-y-2">
              {promptMarkers.map((marker) => (
                <div key={marker.id} className="flex items-start gap-2 text-sm opacity-80">
                  <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="tabular-nums opacity-60">{formatClock(marker.timestamp)}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{NAVIGATION_ACTION_LABELS[marker.navigationAction]}</span>
                  <span>{marker.promptText}</span>
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      )}

      <div className="mt-4">
        <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
          Audio is the source record — the raw transcript is never edited. Suggestions only ever change the corrected copy below.
        </InfoCard>
      </div>

      <PrimaryButton fullWidth className="mt-6" onClick={onNext}>
        Review captured fields
      </PrimaryButton>
    </section>
  );
}
