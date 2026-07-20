"use client";

import { AlertTriangle, Languages, ListChecks, PencilLine, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProcessingStatus, PromptMarker, UnclearSegment } from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { Disclosure, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

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
  onBack
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
}) {
  return (
    <section>
      <ScreenHeader title="Review transcript" subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
        {needsQc && <StatusBadge label="Needs QC" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" />} />}
      </div>

      {manualOverrideReason.trim() && (
        <div className="mb-5">
          <WarningCard>
            <strong className="font-bold">Manual override reason:</strong> {manualOverrideReason.trim()}
          </WarningCard>
        </div>
      )}

      <div className="field-card mb-5">
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

      {canGenerateDraft && (
        <div className="mb-5">
          <WarningCard>
            Audio recorded, but no live transcript segments were captured. Please add a manual transcript or continue
            with QC review.
          </WarningCard>
          <SecondaryButton fullWidth className="mt-2" icon={<RefreshCw className="h-4 w-4" />} onClick={onGenerateDraft}>
            Generate transcript from captured draft
          </SecondaryButton>
        </div>
      )}

      {unclearSegments.length > 0 && (
        <div className="mb-5">
          <WarningCard>
            {unclearSegments.length} section{unclearSegments.length === 1 ? "" : "s"} flagged unclear during recording — verify
            against the audio during QC.
          </WarningCard>
        </div>
      )}

      {missingPromptLabels.length > 0 && (
        <div className="mb-5">
          <WarningCard>
            {missingPromptLabels.length} prompt{missingPromptLabels.length === 1 ? "" : "s"} never shown during recording — flagged
            for QC: {missingPromptLabels.join(" · ")}
          </WarningCard>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Original transcript ({rawTranscriptLanguageName})</p>
        <StatusBadge label="Preserved" tone="good" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
      </div>
      <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
        {rawTranscript || "No transcript captured yet."}
      </pre>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">English processing copy</p>
        <StatusBadge label="Local mock only" tone="neutral" icon={<Languages className="h-3.5 w-3.5" />} />
      </div>
      <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
        {englishProcessingTranscript || "No transcript captured yet."}
      </pre>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Corrected transcript</p>
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
          The original transcript is always preserved in its original language. The English processing copy is a local,
          offline mock — not a paid AI call — used only to help fill in the fields on the next screen, which you can
          correct below before saving.
        </InfoCard>
      </div>

      <PrimaryButton fullWidth className="mt-6" onClick={onNext}>
        Review captured fields
      </PrimaryButton>
    </section>
  );
}
