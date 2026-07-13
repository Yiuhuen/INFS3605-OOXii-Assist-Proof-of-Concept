"use client";

import { ChevronDown, ChevronRight, Mic, Pause, Play, Square } from "lucide-react";
import type { PromptStep, RecordingStatus } from "@/lib/types";
import { PrimaryButton, PromptCard, RecordButton, SecondaryButton, StatusBadge, StepBadges, TextAreaField, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechAvailable } from "@/lib/speech";

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function RecordingScreen({
  clientId,
  step,
  stepIndex,
  totalSteps,
  languageName,
  englishGloss,
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
  languageName: string;
  englishGloss?: string;
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
  speakPrompt: (text: string) => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const isLastStep = stepIndex === totalSteps - 1;
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
      </div>

      <PromptCard
        eyebrow="Ask the client — say this aloud"
        prompt={step.client_prompt}
        englishGloss={englishGloss}
        onPlay={() => speakPrompt(step.audio_prompt_text ?? step.client_prompt)}
        speechAvailable={isSpeechAvailable()}
      />

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
          {!recording && (
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
          <StatusBadge label={isOnline ? "Online" : "Offline · will save locally"} tone={isOnline ? "good" : "warn"} />
        </div>
      </div>

      <button
        className="mt-5 flex w-full items-center justify-between rounded-2xl border border-field-line bg-field-card px-4 py-3 text-left text-sm font-semibold"
        onClick={() => setShowOverrideInput(!showOverrideInput)}
      >
        Cannot record?
        <ChevronDown className={`h-4 w-4 transition ${showOverrideInput ? "rotate-180" : ""}`} />
      </button>
      {showOverrideInput && (
        <TextAreaField
          label="Reason recording is missing or was skipped"
          className="mt-3"
          value={overrideReason}
          onChange={(event) => setOverrideReason(event.target.value)}
          placeholder="e.g. Client declined recording; noisy environment; device microphone broken."
          rows={3}
        />
      )}

      <PrimaryButton fullWidth className="mt-6" disabled={!canProceed} icon={<ChevronRight className="h-5 w-5" />} onClick={onNext}>
        Continue
      </PrimaryButton>
      <p className="mt-2 text-center text-xs opacity-60">
        {canProceed ? (isLastStep ? "Ready to review the transcript." : "Ready to continue.") : "Start recording or use manual override to continue."}
      </p>
    </section>
  );
}
