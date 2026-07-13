"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Mic, Pause, Play, Radio, Square } from "lucide-react";
import type { ManualExtractedFields, PromptStep, RecordingStatus, TranscriptSegment, UnclearSegment } from "@/lib/types";
import {
  Disclosure,
  FormField,
  PrimaryButton,
  PromptCard,
  RecordButton,
  SecondaryButton,
  StatusBadge,
  StepBadges,
  TextAreaField,
  WarningCard
} from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechAvailable } from "@/lib/speech";

function stepTitle(stepId: string) {
  if (stepId === "right-distance" || stepId === "left-distance") return "Distance vision";
  if (stepId === "glasses-check") return "Glasses fitting";
  return "Introduction";
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatClock(isoTimestamp: string) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * "Live transcript assist" is a helper only — a growing draft of what was
 * heard, never the source record. The audio recording and/or manual notes
 * remain valid on their own, and any unclear segment still needs a human to
 * confirm it during QC review before export.
 */
function LiveTranscriptPanel({
  segments,
  interimText,
  transcriptUnavailable,
  languageName,
  unclearSegments,
  onMarkUnclear
}: {
  segments: TranscriptSegment[];
  interimText: string;
  transcriptUnavailable: boolean;
  languageName: string;
  unclearSegments: UnclearSegment[];
  onMarkUnclear: () => void;
}) {
  return (
    <div className="field-card mt-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <Radio className="h-4 w-4 text-[var(--gold)]" />
          Live transcript assist
        </p>
        <StatusBadge label={languageName} tone="language" />
      </div>
      <p className="mt-1 text-xs opacity-60">
        Optional draft only — the recording (and any manual notes) is the official record. Unclear lines still need QC review.
      </p>

      {transcriptUnavailable && (
        <div className="mt-3">
          <WarningCard>Recording saved. Add manual notes if needed — live transcript assist isn&apos;t available in this browser.</WarningCard>
        </div>
      )}

      <div className="ink-panel mt-3 max-h-56 space-y-2 overflow-auto text-sm">
        {segments.length === 0 && !interimText && (
          <p className="opacity-60">Draft transcript will appear here once recording starts.</p>
        )}
        {segments.map((segment) => (
          <p key={segment.id}>
            <span className="mr-2 text-xs font-bold tabular-nums opacity-50">{formatClock(segment.timestamp)}</span>
            {segment.text}
          </p>
        ))}
        {interimText && (
          <p className="italic opacity-60">
            <span className="mr-2 text-xs font-bold tabular-nums opacity-50">…</span>
            {interimText}
          </p>
        )}
      </div>

      <SecondaryButton fullWidth className="mt-3" icon={<AlertTriangle className="h-4 w-4" />} onClick={onMarkUnclear}>
        Mark section unclear
      </SecondaryButton>
      {unclearSegments.length > 0 && (
        <p className="mt-2 text-xs opacity-70">
          {unclearSegments.length} section{unclearSegments.length === 1 ? "" : "s"} flagged unclear — will need QC review.
        </p>
      )}
    </div>
  );
}

/** Small collapsed cards previewing the remaining clinical steps — display only, never reorders or edits the sequence. */
function NextPrompts({ steps }: { steps: PromptStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="field-card mt-5">
      <p className="font-bold">Next prompts</p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-start gap-2 rounded-xl border border-field-line bg-field-surface px-3 py-2 text-sm opacity-80">
            <span className="mt-0.5 text-xs font-bold tabular-nums opacity-50">{index + 2}.</span>
            {step.icon && <span className="leading-none">{step.icon}</span>}
            <span className="leading-snug">{step.client_prompt}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Optional structured quick-entry fields, per clinical step, used as a fallback input alongside (not instead of) the recording/transcript. */
function ManualEntryFields({
  step,
  manualFields,
  setManualFields
}: {
  step: PromptStep;
  manualFields: ManualExtractedFields;
  setManualFields: (fields: ManualExtractedFields) => void;
}) {
  const [line, setLine] = useState("");
  const [letters, setLetters] = useState("");

  function updateDistance(nextLine: string, nextLetters: string, field: "right_eye_distance_result" | "left_eye_distance_result") {
    setLine(nextLine);
    setLetters(nextLetters);
    const value = nextLine ? `Line ${nextLine}${nextLetters ? ` + ${nextLetters} letters` : ""}` : "";
    setManualFields({ ...manualFields, [field]: value });
  }

  if (step.id === "right-distance" || step.id === "left-distance") {
    const field = step.id === "right-distance" ? "right_eye_distance_result" : "left_eye_distance_result";
    return (
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Final readable line" value={line} onChange={(event) => updateDistance(event.target.value, letters, field)} />
        <FormField label="Letters on next line" value={letters} onChange={(event) => updateDistance(line, event.target.value, field)} />
      </div>
    );
  }
  if (step.id === "glasses-check") {
    return (
      <div className="space-y-4">
        <FormField
          label="Glasses selected"
          value={manualFields.glasses_selected}
          onChange={(event) => setManualFields({ ...manualFields, glasses_selected: event.target.value })}
        />
        <FormField
          label="Comfort response"
          value={manualFields.comfort_response}
          onChange={(event) => setManualFields({ ...manualFields, comfort_response: event.target.value })}
        />
        <FormField
          label="Cataract history confirmed"
          value={manualFields.cataract_history_confirmed}
          onChange={(event) => setManualFields({ ...manualFields, cataract_history_confirmed: event.target.value })}
        />
      </div>
    );
  }
  return null;
}

export function RecordingScreen({
  clientId,
  step,
  stepIndex,
  totalSteps,
  upcomingSteps,
  languageName,
  englishGloss,
  manualFields,
  setManualFields,
  recording,
  paused,
  elapsedSeconds,
  audioUrl,
  micError,
  overrideReason,
  setOverrideReason,
  showOverrideInput,
  setShowOverrideInput,
  recordingStatus,
  isOnline,
  nudgeVisible,
  canProceed,
  transcriptSegments,
  interimText,
  transcriptUnavailable,
  unclearSegments,
  onMarkUnclear,
  speakPrompt,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  onBack,
  onNext
}: {
  clientId: string;
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  upcomingSteps: PromptStep[];
  languageName: string;
  englishGloss?: string;
  manualFields: ManualExtractedFields;
  setManualFields: (fields: ManualExtractedFields) => void;
  recording: boolean;
  paused: boolean;
  elapsedSeconds: number;
  audioUrl: string;
  micError: boolean;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  showOverrideInput: boolean;
  setShowOverrideInput: (value: boolean) => void;
  recordingStatus: RecordingStatus;
  isOnline: boolean;
  nudgeVisible: boolean;
  canProceed: boolean;
  transcriptSegments: TranscriptSegment[];
  interimText: string;
  transcriptUnavailable: boolean;
  unclearSegments: UnclearSegment[];
  onMarkUnclear: () => void;
  speakPrompt: (text: string) => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const isLastStep = stepIndex === totalSteps - 1;
  const recordingEverStarted = recording || paused || recordingStatus === "recorded";
  const recordingLabel = recording && !paused ? "Recording" : recording && paused ? "Paused" : recordingStatus === "recorded" ? "Recorded" : "Not started";
  const recordingTone = recording && !paused ? "danger" : recordingStatus === "recorded" ? "good" : "warn";

  return (
    <section>
      <ScreenHeader title="Record conversation" subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="status-pill">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <StepBadges stepId={step.id} languageName={languageName} />
        {recording && <StatusBadge label="Continuous recording" tone="good" />}
      </div>

      <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-60">{stepTitle(step.id)}</p>
      <PromptCard
        eyebrow="Ask this question — say it aloud"
        prompt={step.client_prompt}
        englishGloss={englishGloss}
        icon={step.icon}
        onPlay={() => speakPrompt(step.audio_prompt_text ?? step.client_prompt)}
        speechAvailable={isSpeechAvailable()}
      />

      <p className="mt-3 text-sm opacity-80">
        <span className="font-bold opacity-100">Tester instruction:</span> {step.tester_instruction}
      </p>

      <Disclosure label="Why this matters">{step.why_this_matters}</Disclosure>

      {nudgeVisible && (
        <div className="mt-4">
          <WarningCard>Start recording before asking the question, so the conversation can be checked later.</WarningCard>
        </div>
      )}
      {micError && (
        <div className="mt-4">
          <WarningCard>Microphone unavailable. An unresolved segment was saved with a timestamp — add a manual note to continue.</WarningCard>
        </div>
      )}

      <div className="field-card mt-5">
        <div className="flex items-center justify-between">
          <p className="font-bold">Recording</p>
          <span className="text-2xl font-black tabular-nums">{formatElapsed(elapsedSeconds)}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {!recordingEverStarted && (
            <RecordButton fullWidth icon={<Mic className="h-5 w-5" />} onClick={startRecording}>
              Start recording
            </RecordButton>
          )}
          {recording && !paused && (
            <SecondaryButton icon={<Pause className="h-5 w-5" />} onClick={pauseRecording}>
              Pause
            </SecondaryButton>
          )}
          {recording && paused && (
            <SecondaryButton icon={<Play className="h-5 w-5" />} onClick={resumeRecording}>
              Resume
            </SecondaryButton>
          )}
          {recording && (
            <SecondaryButton icon={<Square className="h-5 w-5" />} onClick={stopRecording}>
              Stop
            </SecondaryButton>
          )}
        </div>

        {audioUrl && !micError && <audio className="mt-4 w-full" controls src={audioUrl} />}

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge label={recordingLabel} tone={recordingTone} />
          <StatusBadge label={isOnline ? "Online" : "Offline"} tone={isOnline ? "good" : "warn"} />
          {(recordingEverStarted || overrideReason.trim()) && <StatusBadge label="Saved locally" tone="good" />}
        </div>
        {!isOnline && <p className="mt-2 text-xs opacity-60">Processing can happen after sync — this test still completes fully offline.</p>}
      </div>

      {recordingEverStarted && !micError && (
        <LiveTranscriptPanel
          segments={transcriptSegments}
          interimText={interimText}
          transcriptUnavailable={transcriptUnavailable}
          languageName={languageName}
          unclearSegments={unclearSegments}
          onMarkUnclear={onMarkUnclear}
        />
      )}

      <NextPrompts steps={upcomingSteps} />

      <button
        className="mt-5 flex w-full items-center justify-between rounded-2xl border border-field-line bg-field-card px-4 py-3 text-left text-sm font-semibold"
        onClick={() => setShowOverrideInput(!showOverrideInput)}
      >
        Cannot record?
        <ChevronDown className={`h-4 w-4 transition ${showOverrideInput ? "rotate-180" : ""}`} />
      </button>
      {showOverrideInput && (
        <div className="mt-3 space-y-4">
          <TextAreaField
            label="Reason recording or transcript is unavailable"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder="e.g. Client declined recording; noisy environment; device microphone broken; live transcript did not capture the answer."
            rows={3}
          />
          <ManualEntryFields step={step} manualFields={manualFields} setManualFields={setManualFields} />
          <TextAreaField
            label="Additional notes"
            value={manualFields.additional_notes}
            onChange={(event) => setManualFields({ ...manualFields, additional_notes: event.target.value })}
            placeholder="Optional — prescription/test result notes, lens dispensed, or anything else worth recording manually"
            rows={2}
          />
          <WarningCard>Manual entries without a captured transcript always require QC review before the record can be exported.</WarningCard>
        </div>
      )}

      <PrimaryButton fullWidth className="mt-6" disabled={!canProceed} icon={<ChevronRight className="h-5 w-5" />} onClick={onNext}>
        {isLastStep ? "Finish & review transcript" : "Next prompt"}
      </PrimaryButton>
      <p className="mt-2 text-center text-xs opacity-60">
        {canProceed
          ? isLastStep
            ? "Stop recording, then review the transcript."
            : "Recording continues — moving to the next prompt won't interrupt it."
          : isLastStep
            ? "Stop recording or use manual override to continue."
            : "Start recording or use manual override to continue."}
      </p>
    </section>
  );
}
