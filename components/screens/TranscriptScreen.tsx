"use client";

import { useState } from "react";
import { AlertTriangle, FlaskConical, Languages, ListChecks, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
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
import { Disclosure, DetailModal, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, type BadgeTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

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
  unrecordedPromptLabels,
  isOnline,
  canGenerateDraft,
  onGenerateDraft,
  onNext,
  onBack,
  onRerecordRequest,
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
  /** Client-facing prompt text for any fixed-sequence step the tester never viewed at all — never a reorder, just a gap to flag. */
  missingPromptLabels: string[];
  /** Client-facing prompt text for steps the tester DID view, but never while continuous audio recording was active (e.g. mic failure) — distinct from missingPromptLabels; must never be worded as "never shown". */
  unrecordedPromptLabels: string[];
  isOnline: boolean;
  /** True when recording happened but no live transcript segments were captured — audio exists, so a manual rebuild is worth offering instead of leaving the tester stuck. */
  canGenerateDraft: boolean;
  onGenerateDraft: () => void;
  onNext: () => void;
  onBack: () => void;
  /** Opens the "Discard this recording and rerecord?" confirmation. */
  onRerecordRequest: () => void;
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
  const [detailOpen, setDetailOpen] = useState(false);
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
      header={<CompactHeader title="Review transcript" subtitle={clientId} onBack={onBack} isOnline={isOnline} />}
      footer={
        <BottomActionBar>
          <SecondaryButton className="min-h-[2.75rem] shrink-0 whitespace-nowrap px-3 text-sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onRerecordRequest}>
            Rerecord
          </SecondaryButton>
          <PrimaryButton fullWidth className="min-h-[2.75rem] flex-1 text-sm" onClick={onNext}>
            Review captured fields
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
        <div className="field-card-soft flex shrink-0 items-center justify-between gap-2 py-2">
          <p className="text-xs font-bold opacity-80">Audio record</p>
          <StatusBadge label={formatDuration(recordingDurationSeconds)} tone="neutral" />
        </div>
        {audioUrl ? <audio className="h-8 shrink-0 w-full" controls src={audioUrl} /> : <p className="shrink-0 text-xs opacity-60">No audio available.</p>}

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
          {needsQc && processingStatus !== "needs_qc" && (
            <StatusBadge label="Needs QC" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
          )}
          <StatusBadge label={REVIEW_STATUS_LABELS[reviewStatus]} tone={REVIEW_STATUS_TONES[reviewStatus]} />
          {demoHelperUsed && <StatusBadge label="Demo helper used" tone="danger" icon={<FlaskConical className="h-3.5 w-3.5" />} />}
        </div>

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

        {/* The textarea scrolls its own content, so overflow here never hides
            text — min-h keeps the editor usable on very short viewports (the
            column's fallback scroll covers the rest). */}
        <div className="min-h-[8rem] flex-1 overflow-hidden">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-field-muted">Corrected transcript — editable</p>
          <textarea
            className="field-input h-full min-h-0 resize-none text-sm"
            aria-label="Corrected transcript"
            value={correctedTranscript}
            onChange={(event) => setCorrectedTranscript(event.target.value)}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <button
            className="text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={() => setDetailOpen(true)}
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

      <DetailModal open={detailOpen} title="Full transcript & details" onClose={() => setDetailOpen(false)}>
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Raw draft transcript ({rawTranscriptLanguageName})</p>
              <StatusBadge label="Preserved" tone="good" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            </div>
            <p className="mt-1 text-xs opacity-60">Read-only — generated from audio, never edited or overwritten.</p>
            <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">{rawTranscript || "No transcript captured yet."}</pre>
          </div>

          {showEnglishProcessingCopy && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-field-muted">English processing copy</p>
                <StatusBadge
                  label={translationReport.isTranslation ? translationReport.label : "Local mock only"}
                  tone={translationReport.isTranslation ? "warn" : "neutral"}
                  icon={<Languages className="h-3.5 w-3.5" />}
                />
              </div>
              <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">
                {englishProcessingTranscript || "No transcript captured yet."}
              </pre>
            </div>
          )}

          {hasRecordingNotes && (
            <div className="field-card space-y-2 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Recording notes</p>
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
                    <span className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{NAVIGATION_ACTION_LABELS[marker.navigationAction]}</span>
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
