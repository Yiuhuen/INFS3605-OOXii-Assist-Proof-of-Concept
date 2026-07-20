"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Mic,
  Pause,
  Play,
  Square,
  Volume2
} from "lucide-react";
import type { ManualExtractedFields, PromptStep, RecordingStatus, TranscriptSegment, UnclearSegment } from "@/lib/types";
import {
  Disclosure,
  FormField,
  PrimaryButton,
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

/** Compact sticky prompt card — step context, the client-facing question, and
 * the tester note, with "Play aloud" and "Why this matters" as small chip
 * buttons rather than a full-height hero card. Stays visible near the top
 * while the tester scrolls through recording controls and the transcript. */
function CompactPromptCard({
  step,
  stepIndex,
  totalSteps,
  languageName,
  englishGloss,
  onPlay,
  speechAvailable
}: {
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  languageName: string;
  englishGloss?: string;
  onPlay: () => void;
  speechAvailable: boolean;
}) {
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="prompt-card-compact">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="status-pill">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <StepBadges stepId={step.id} languageName={languageName} />
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-lg font-black leading-snug">
        {step.icon && <span className="text-base leading-none">{step.icon}</span>}
        &ldquo;{step.client_prompt}&rdquo;
      </p>
      {englishGloss && <p className="mt-0.5 text-xs opacity-60">English: &ldquo;{englishGloss}&rdquo;</p>}

      <p className="mt-1.5 text-xs opacity-80">
        <span className="font-bold opacity-100">Tester instruction:</span> {step.tester_instruction}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="chip-button" onClick={onPlay} disabled={!speechAvailable} title={speechAvailable ? undefined : "Speech playback unavailable on this device"}>
          <Volume2 className="h-3.5 w-3.5" />
          Play aloud
        </button>
        <button type="button" className={`chip-button ${whyOpen ? "is-active" : ""}`} onClick={() => setWhyOpen((value) => !value)} aria-expanded={whyOpen}>
          <HelpCircle className="h-3.5 w-3.5" />
          Why this matters
        </button>
      </div>
      {whyOpen && <p className="mt-2 text-xs leading-relaxed opacity-70">{step.why_this_matters}</p>}
    </div>
  );
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
  manualTranscriptNote,
  onManualTranscriptNoteChange
}: {
  segments: TranscriptSegment[];
  interimText: string;
  transcriptUnavailable: boolean;
  languageName: string;
  unclearSegments: UnclearSegment[];
  manualTranscriptNote: string;
  onManualTranscriptNoteChange: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [segments, interimText]);

  return (
    <div className="field-card mt-3 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--gold)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--gold)]" />
          </span>
          Live transcript
        </p>
        <StatusBadge label={languageName} tone="language" />
      </div>

      {transcriptUnavailable ? (
        <div className="mt-2 space-y-2">
          <WarningCard>Live transcript unavailable. Audio is still saved.</WarningCard>
          <TextAreaField
            label="Manual transcript entry"
            value={manualTranscriptNote}
            onChange={(event) => onManualTranscriptNoteChange(event.target.value)}
            placeholder="Type what the client said, since live transcript isn't available in this browser."
            rows={3}
          />
        </div>
      ) : (
        <div ref={scrollRef} className="ink-panel mt-2 max-h-40 space-y-1.5 overflow-y-auto p-2.5 text-sm">
          {segments.length === 0 && !interimText && (
            <p className="opacity-60">Draft transcript will appear here once recording starts.</p>
          )}
          {segments.map((segment) => (
            <p key={segment.id} className="leading-snug">
              <span className="mr-1.5 text-[11px] font-bold tabular-nums opacity-50">{formatClock(segment.timestamp)}</span>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-40">{stepTitle(segment.stepId)}</span>
              {segment.text}
            </p>
          ))}
          {interimText && (
            <p className="italic leading-snug opacity-60">
              <span className="mr-1.5 text-[11px] font-bold tabular-nums opacity-50">…</span>
              {interimText}
            </p>
          )}
        </div>
      )}

      <p className="mt-1.5 text-[11px] opacity-60">
        Optional draft only — the recording (and any manual notes) is the official record.
        {unclearSegments.length > 0 &&
          ` ${unclearSegments.length} section${unclearSegments.length === 1 ? "" : "s"} flagged unclear — will need QC review.`}
      </p>
    </div>
  );
}

/** Collapsed-by-default preview of the remaining clinical steps — display only, never reorders or edits the sequence. */
function NextPrompts({ steps }: { steps: PromptStep[] }) {
  if (steps.length === 0) return null;
  return (
    <Disclosure label={`Upcoming prompts (${steps.length})`}>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-start gap-2 rounded-xl border border-field-line bg-field-surface px-3 py-2 text-sm opacity-80">
            <span className="mt-0.5 text-xs font-bold tabular-nums opacity-50">{index + 2}.</span>
            {step.icon && <span className="leading-none">{step.icon}</span>}
            <span className="leading-snug">{step.client_prompt}</span>
          </li>
        ))}
      </ol>
    </Disclosure>
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
          label="Currently has glasses"
          value={manualFields.current_glasses}
          onChange={(event) => setManualFields({ ...manualFields, current_glasses: event.target.value })}
        />
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
  const canMarkUnclear = recordingEverStarted && !micError;

  return (
    <section>
      <ScreenHeader title="Record conversation" subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <CompactPromptCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        languageName={languageName}
        englishGloss={englishGloss}
        onPlay={() => speakPrompt(step.audio_prompt_text ?? step.client_prompt)}
        speechAvailable={isSpeechAvailable()}
      />

      {nudgeVisible && (
        <div className="mt-3">
          <WarningCard>Start recording before asking the question, so the conversation can be checked later.</WarningCard>
        </div>
      )}
      {micError && (
        <div className="mt-3">
          <WarningCard>Microphone unavailable. An unresolved segment was saved with a timestamp — add a manual note to continue.</WarningCard>
        </div>
      )}

      <div className="field-card mt-3 p-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge label={recordingLabel} tone={recordingTone} />
            <StatusBadge label={isOnline ? "Online" : "Offline"} tone={isOnline ? "good" : "warn"} />
            {(recordingEverStarted || overrideReason.trim()) && <StatusBadge label="Saved locally" tone="good" />}
          </div>
          <span className="text-2xl font-black tabular-nums">{formatElapsed(elapsedSeconds)}</span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {!recordingEverStarted && (
            <RecordButton fullWidth className="px-4 py-2.5 text-sm" icon={<Mic className="h-4 w-4" />} onClick={startRecording}>
              Start recording
            </RecordButton>
          )}
          {recording && !paused && (
            <SecondaryButton className="px-3.5 py-2 text-sm" icon={<Pause className="h-4 w-4" />} onClick={pauseRecording}>
              Pause
            </SecondaryButton>
          )}
          {recording && paused && (
            <SecondaryButton className="px-3.5 py-2 text-sm" icon={<Play className="h-4 w-4" />} onClick={resumeRecording}>
              Resume
            </SecondaryButton>
          )}
          {recording && (
            <SecondaryButton className="px-3.5 py-2 text-sm" icon={<Square className="h-4 w-4" />} onClick={stopRecording}>
              Stop
            </SecondaryButton>
          )}
        </div>

        {!isOnline && <p className="mt-2 text-[11px] opacity-60">Processing can happen after sync — this test still completes fully offline.</p>}

        {recordingStatus === "recorded" && !recording && audioUrl && !micError && (
          <div className="mt-2.5">
            <Disclosure label="Audio preview">
              <audio className="w-full" controls src={audioUrl} />
            </Disclosure>
          </div>
        )}
      </div>

      {recordingEverStarted && !micError && (
        <LiveTranscriptPanel
          segments={transcriptSegments}
          interimText={interimText}
          transcriptUnavailable={transcriptUnavailable}
          languageName={languageName}
          unclearSegments={unclearSegments}
          manualTranscriptNote={manualFields.additional_notes}
          onManualTranscriptNoteChange={(value) => setManualFields({ ...manualFields, additional_notes: value })}
        />
      )}

      <div className="mt-3">
        <NextPrompts steps={upcomingSteps} />
      </div>

      <button
        className="mt-1 flex w-full items-center justify-between rounded-2xl border border-field-line bg-field-card px-3 py-2.5 text-left text-sm font-semibold"
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

      {/* Spacer so content never sits directly under the sticky action bar. */}
      <div className="h-4" />

      <div className="sticky-action-bar flex items-center gap-2">
        <SecondaryButton
          className="px-3.5 py-2.5 text-sm"
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={onMarkUnclear}
          disabled={!canMarkUnclear}
        >
          Mark unclear
        </SecondaryButton>
        <PrimaryButton fullWidth className="py-2.5 text-sm" disabled={!canProceed} icon={<ChevronRight className="h-4 w-4" />} onClick={onNext}>
          {isLastStep ? "Finish & review" : "Next prompt"}
        </PrimaryButton>
      </div>
    </section>
  );
}
