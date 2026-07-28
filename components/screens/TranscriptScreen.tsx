"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, ListChecks, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import type {
  CorrectionHistoryEntry,
  LanguageCode,
  ManualExtractedFields,
  ProcessingStatus,
  PromptMarker,
  SuggestedCorrection,
  TranscriptQualityFlag,
  TranscriptQualityFlagType,
  TranscriptQualityReport,
  TranscriptReviewStatus,
  TranscriptSegment,
  TranslationSafetyReport,
  UnclearSegment
} from "@/lib/types";
import { Disclosure, DetailModal, InfoCard, PrimaryButton, SecondaryButton, StatusDot, TranscriptTab, type StatusDotTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";
import { HighlightedTranscript } from "@/components/TranscriptHighlight";
import { extractFieldsFromTranscript } from "@/lib/fieldExtraction";

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

/** The 7 result categories shown under "Key captured phrases", in the clinical spec's order — short labels, same set as the recording screen's Captured so far panel. */
const KEY_PHRASE_FIELDS: Array<{ key: keyof ManualExtractedFields; label: string }> = [
  { key: "current_glasses", label: "Current glasses" },
  { key: "cataract_history_confirmed", label: "Cataract" },
  { key: "right_eye_distance_result", label: "Right eye" },
  { key: "left_eye_distance_result", label: "Left eye" },
  { key: "final_readable_line", label: "Final line" },
  { key: "comfort_response", label: "Comfort" },
  { key: "glasses_selected", label: "Glasses selected" }
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

function severityDotTone(severity: TranscriptQualityFlag["severity"]): StatusDotTone {
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
      {/* One dot per alert, extra context as plain text — never a pill cluster. */}
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
  transcriptSegments,
  language,
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
  /** Final live-transcript segments — used only to derive "Key captured phrases" (per-step draft extraction) and the full-transcript line count. */
  transcriptSegments: TranscriptSegment[];
  language: LanguageCode;
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
  /** Full transcript is collapsed by default — a 20-minute recording must never open as a wall of text. */
  const [fullTranscriptExpanded, setFullTranscriptExpanded] = useState(false);
  /**
   * Draft-extraction pass over the current transcript, purely for the "Key
   * captured phrases" section — recomputed only when the transcript text
   * actually changes (useMemo), and display-only here: the extraction that
   * feeds Review captured fields still runs in app/page.tsx on Continue.
   */
  const draftFields = useMemo(
    () =>
      extractFieldsFromTranscript({
        rawTranscriptText: rawTranscript,
        correctedTranscriptText: correctedTranscript,
        englishProcessingTranscript,
        transcriptSegments,
        promptMarkers,
        language
      }),
    [rawTranscript, correctedTranscript, englishProcessingTranscript, transcriptSegments, promptMarkers, language]
  );
  const transcriptLineCount = transcriptSegments.filter((segment) => segment.isFinal && segment.text.trim()).length;
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
          <span className="text-xs font-semibold tabular-nums opacity-70">{formatDuration(recordingDurationSeconds)}</span>
        </div>
        {audioUrl ? <audio className="h-8 shrink-0 w-full" controls src={audioUrl} /> : <p className="shrink-0 text-xs opacity-60">No audio available.</p>}

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
          <StatusDot label={REVIEW_STATUS_LABELS[reviewStatus]} tone={REVIEW_STATUS_TONES[reviewStatus]} />
          {(needsQc || processingStatus === "needs_qc") && <StatusDot label="Needs QC" tone="danger" />}
          {demoHelperUsed && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)]">
              <FlaskConical className="h-3.5 w-3.5" />
              Demo transcript
            </span>
          )}
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

        {/* 1. Key captured phrases — the primary review surface. One row per
            result category with its evidence snippet, so a 20-minute
            recording is reviewed via 7 snippets, not a wall of text. */}
        <div className="flex min-h-[7rem] flex-1 flex-col overflow-hidden rounded-xl border border-field-line bg-field-card">
          <p className="shrink-0 border-b border-field-line px-3 py-2 text-sm font-bold">Key captured phrases</p>
          <div className="min-h-0 flex-1 divide-y divide-field-line overflow-y-auto px-3">
            {KEY_PHRASE_FIELDS.map(({ key, label }) => {
              const meta = draftFields[key];
              const hasValue = Boolean(meta.value.trim());
              return (
                <div key={key} className="py-1.5 text-sm">
                  <span className="font-semibold">{label}:</span>{" "}
                  {hasValue ? (
                    <>
                      <span>{meta.value}</span>
                      {meta.evidence && (
                        <span className="ml-1.5 text-xs">
                          <mark className="transcript-highlight">&ldquo;{meta.evidence}&rdquo;</mark>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="opacity-60">Missing</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Full transcript — expandable, collapsed by default; scrolls internally when open. */}
        <div className="shrink-0">
          <TranscriptTab
            title="Full transcript"
            subtitle={transcriptLineCount > 0 ? `${transcriptLineCount} line${transcriptLineCount === 1 ? "" : "s"} captured` : "Full text"}
            expanded={fullTranscriptExpanded}
            onToggle={() => setFullTranscriptExpanded((value) => !value)}
            maxHeightClass="max-h-48"
          >
            <div className="text-sm">
              <HighlightedTranscript text={correctedTranscript} />
            </div>
          </TranscriptTab>
        </div>

        {/* 3. Edit transcript — on demand, never a huge default textarea. */}
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
