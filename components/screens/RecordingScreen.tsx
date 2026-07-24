"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  HelpCircle,
  Mic,
  Pause,
  PencilLine,
  Play,
  Square,
  Volume2,
  VolumeX
} from "lucide-react";
import type { LanguageCode, ManualExtractedFields, PromptStep, RecordingStatus, TranscriptSegment, UnclearSegment } from "@/lib/types";
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
import { buildClientSpokenPrompt, isSpeechSupported, speakPrompt, stopSpeaking, type SpeechSpeed } from "@/lib/speech";
import { type TranscriptEngineStatus } from "@/lib/liveTranscript";

/** Dev diagnostics panel: on by default outside production, or opt-in in production via NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG=true. Both sides are inlined at build time by Next.js. */
const SHOW_TRANSCRIPT_DEBUG = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG === "true";

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

const SWIPE_THRESHOLD_PX = 60;
const SWIPE_DRAG_CLAMP_PX = 90;
const INTERACTIVE_SELECTOR = "textarea, input, select, button, a, [role='button']";

/**
 * Pointer-based swipe gesture for the prompt card — touch, mouse, and pen all
 * go through the same Pointer Events path, so this works on mobile Chrome,
 * iOS Safari, and desktop drag without separate touch/mouse handlers.
 *
 * A gesture starting on an interactive child (buttons inside the card,
 * inputs elsewhere) never begins tracking, so it can't hijack a tap or a
 * text-field drag. `touch-action: pan-y` on the card (applied by the caller)
 * lets the browser keep handling vertical scroll natively — this hook only
 * ever reacts to horizontal movement, so a vertical scroll gesture never
 * turns into an accidental prompt change.
 */
function useSwipeCard({
  onSwipeLeft,
  onSwipeRight,
  disabled
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  function reset() {
    gestureRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    setDragging(true);
    // Without pointer capture, a finger that drifts slightly off the card
    // mid-drag (very easy on a real phone) stops delivering pointermove/up
    // to this element — the gesture silently dies, which reads as "swipe
    // doesn't work" even though the handlers are firing correctly.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Unsupported in this environment — gesture still works, just less robust to drift.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    // Only follow the drag visually once the gesture is clearly horizontal —
    // a vertical scroll never nudges the card sideways.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-SWIPE_DRAG_CLAMP_PX, Math.min(SWIPE_DRAG_CLAMP_PX, dx)));
    }
  }

  function releaseCapture(event: ReactPointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Not captured — ignore.
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    releaseCapture(event);
    if (!gesture || gesture.pointerId !== event.pointerId) {
      reset();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    reset();
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    releaseCapture(event);
    reset();
  }

  return {
    dragX,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel
    }
  };
}

/** "● ○ ○ ○" — a small progress row, not a heavy carousel control. Highlights the active step only. */
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={`h-1.5 rounded-full transition-all ${index === current ? "w-5 bg-[var(--gold)]" : "w-1.5 bg-field-line"}`}
        />
      ))}
    </div>
  );
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
  isSpeaking,
  isAudioMode,
  voiceInfoMessage,
  speechAvailable,
  onPlayToggle
}: {
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  languageName: string;
  englishGloss?: string;
  isSpeaking: boolean;
  /** True when this step plays a pre-recorded audio file rather than browser TTS. */
  isAudioMode: boolean;
  voiceInfoMessage: string | null;
  speechAvailable: boolean;
  onPlayToggle: () => void;
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
        <button
          type="button"
          className="chip-button"
          onClick={onPlayToggle}
          disabled={!speechAvailable}
          title={speechAvailable ? undefined : "Speech playback unavailable on this device"}
        >
          {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {isSpeaking ? "Stop speaking" : "Play aloud"}
        </button>
        {isSpeaking && <StatusBadge label={isAudioMode ? "Recorded audio" : "Speaking…"} tone="warn" />}
        <button type="button" className={`chip-button ${whyOpen ? "is-active" : ""}`} onClick={() => setWhyOpen((value) => !value)} aria-expanded={whyOpen}>
          <HelpCircle className="h-3.5 w-3.5" />
          Why this matters
        </button>
      </div>
      {voiceInfoMessage && <p className="mt-1 text-[11px] opacity-50">{voiceInfoMessage}.</p>}
      {whyOpen && <p className="mt-2 text-xs leading-relaxed opacity-70">{step.why_this_matters}</p>}
    </div>
  );
}

type TranscriptPanelStatus = { label: string; tone: "neutral" | "warn" | "good" | "danger" };

/**
 * Priority-ordered status the tester sees above the transcript box. Mirrors
 * the actual data (segments/interimText) plus the underlying engine's
 * lifecycle (transcriptEngineStatus) so "nothing here yet" always reads as
 * either "still listening" or an honest failure — never a dead placeholder.
 */
function deriveTranscriptPanelStatus({
  recording,
  paused,
  recordingStatus,
  segments,
  interimText,
  engineStatus
}: {
  recording: boolean;
  paused: boolean;
  recordingStatus: RecordingStatus;
  segments: TranscriptSegment[];
  interimText: string;
  engineStatus: TranscriptEngineStatus;
}): TranscriptPanelStatus {
  const stopped = !recording && !paused;
  if (stopped && recordingStatus === "recorded" && segments.length > 0) {
    return { label: "Transcript ready for review", tone: "good" };
  }
  if (stopped && recordingStatus === "recorded" && segments.length === 0) {
    return { label: "No transcript captured", tone: "warn" };
  }
  if (interimText) {
    return { label: "Transcript updating…", tone: "neutral" };
  }
  if (recording && segments.length === 0) {
    return { label: "Listening…", tone: "neutral" };
  }
  if (engineStatus === "restarting") {
    return { label: "Reconnecting…", tone: "warn" };
  }
  if (paused) {
    return { label: "Paused", tone: "neutral" };
  }
  return { label: "Listening…", tone: "neutral" };
}

/**
 * "Live transcript" is a helper only — a growing draft of what was heard,
 * never the source record. The audio recording and/or manual notes remain
 * valid on their own, and any unclear segment still needs a human to
 * confirm it during QC review before export.
 */
function LiveTranscriptPanel({
  segments,
  interimText,
  transcriptUnavailable,
  transcriptUnavailableReason,
  recording,
  paused,
  recordingStatus,
  engineStatus,
  unclearSegments,
  manualTranscriptNote,
  onManualTranscriptNoteChange
}: {
  segments: TranscriptSegment[];
  interimText: string;
  transcriptUnavailable: boolean;
  transcriptUnavailableReason: "browser" | "language" | null;
  recording: boolean;
  paused: boolean;
  recordingStatus: RecordingStatus;
  engineStatus: TranscriptEngineStatus;
  unclearSegments: UnclearSegment[];
  manualTranscriptNote: string;
  onManualTranscriptNoteChange: (value: string) => void;
}) {
  const audioRecordedNoSegments = !recording && !paused && recordingStatus === "recorded" && segments.length === 0 && !transcriptUnavailable;
  const status = deriveTranscriptPanelStatus({ recording, paused, recordingStatus, segments, interimText, engineStatus });
  const unavailableMessage =
    transcriptUnavailableReason === "language"
      ? "Not available for this language in the PoC. Audio is still saved."
      : "Unavailable in this browser. Audio is still saved.";
  const [manualOpen, setManualOpen] = useState(false);

  // Compact by design: this panel is a live draft glance, not the archive —
  // only the most recent lines are shown so the screen never needs its own
  // internal scrollbar, and never grows past the "core visible" viewport
  // budget. The full transcript (every segment, in order) is always
  // available afterwards on Transcript Review.
  const RECENT_LINE_COUNT = 2;
  const recentSegments = segments.slice(-RECENT_LINE_COUNT);
  const olderSegmentCount = segments.length - recentSegments.length;

  function manualEntryToggleOrField(placeholder: string) {
    if (manualOpen) {
      return (
        <TextAreaField
          label="Manual transcript entry"
          value={manualTranscriptNote}
          onChange={(event) => onManualTranscriptNoteChange(event.target.value)}
          placeholder={placeholder}
          rows={2}
        />
      );
    }
    return (
      <button type="button" className="chip-button" onClick={() => setManualOpen(true)}>
        <PencilLine className="h-3.5 w-3.5" />
        Add manual transcript
      </button>
    );
  }

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
        <StatusBadge label={status.label} tone={status.tone} />
      </div>

      {transcriptUnavailable ? (
        <div className="mt-2 space-y-2">
          <WarningCard>{unavailableMessage}</WarningCard>
          {manualEntryToggleOrField("Type what the client said, since live transcript isn't available.")}
        </div>
      ) : (
        <div className="ink-panel mt-2 space-y-1.5 p-2.5 text-sm">
          {olderSegmentCount > 0 && (
            <p className="text-[11px] opacity-50">
              +{olderSegmentCount} earlier line{olderSegmentCount === 1 ? "" : "s"} — full transcript on the next screen.
            </p>
          )}
          {segments.length === 0 && !interimText && !audioRecordedNoSegments && (
            <p className="opacity-60">Listening for speech — text will appear here as the client talks.</p>
          )}
          {recentSegments.map((segment) => (
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

      {audioRecordedNoSegments && (
        <div className="mt-2 space-y-2">
          <WarningCard>No live transcript captured. Add a manual transcript or send to QC.</WarningCard>
          {manualEntryToggleOrField("Type what the client said, since live transcript wasn't captured.")}
        </div>
      )}

      <p className="mt-1.5 text-[11px] opacity-60">
        Draft only — review required.
        {unclearSegments.length > 0 && ` ${unclearSegments.length} unclear — needs QC.`}
      </p>
    </div>
  );
}

/**
 * Dev/QA-only diagnostics — always available when SHOW_TRANSCRIPT_DEBUG is
 * on, independent of whether a recording/mic session is active, so the
 * standalone "Test speech recognition only" button can be used before (or
 * without) ever starting a real recording.
 */
function TranscriptDiagnosticsPanel({
  segments,
  interimText,
  engineStatus,
  lastTranscriptError,
  lastSttEvent,
  sttResultEventCount,
  speechRecognitionSupported,
  sttConstructorName,
  secureContext,
  pageOrigin,
  userAgent,
  micPermissionStatus,
  currentStepId,
  recordingStatus,
  sttTestStatus,
  sttTestInterim,
  sttTestFinalText,
  sttTestError,
  sttTestLastEvent,
  sttTestResultCount,
  onStartSttOnlyTest,
  onStopSttOnlyTest,
  onClearSttOnlyTest
}: {
  segments: TranscriptSegment[];
  interimText: string;
  engineStatus: TranscriptEngineStatus;
  lastTranscriptError: string;
  /** Last raw SpeechRecognition lifecycle event fired for the real recording-flow engine (start/audiostart/soundstart/speechstart/result/speechend/soundend/audioend/nomatch/error/end). */
  lastSttEvent: string;
  sttResultEventCount: number;
  speechRecognitionSupported: boolean;
  sttConstructorName: "SpeechRecognition" | "webkitSpeechRecognition" | "none";
  secureContext: boolean;
  pageOrigin: string;
  userAgent: string;
  micPermissionStatus: PermissionState | "unsupported";
  currentStepId: string;
  recordingStatus: RecordingStatus;
  sttTestStatus: TranscriptEngineStatus;
  sttTestInterim: string;
  sttTestFinalText: string;
  sttTestError: string;
  sttTestLastEvent: string;
  sttTestResultCount: number;
  onStartSttOnlyTest: () => void;
  onStopSttOnlyTest: () => void;
  onClearSttOnlyTest: () => void;
}) {
  const finalTranscriptText = segments
    .filter((segment) => segment.isFinal && segment.text.trim())
    .map((segment) => segment.text)
    .join(" ");

  return (
    <div className="mt-3">
      <Disclosure label="Diagnostics">
        <div className="field-card mt-2 space-y-2 p-3">
          <p className="text-sm font-bold">Speech recognition diagnostics</p>
          <Disclosure label="Transcript diagnostics">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] opacity-80">
          <dt className="opacity-60">Secure context</dt>
          <dd>{secureContext ? "yes" : "no"}</dd>
          <dt className="opacity-60">Origin</dt>
          <dd className="break-words">{pageOrigin || "—"}</dd>
          <dt className="opacity-60">User agent</dt>
          <dd className="break-words">{userAgent || "—"}</dd>
          <dt className="opacity-60">SpeechRecognition constructor</dt>
          <dd>{sttConstructorName}</dd>
          <dt className="opacity-60">Browser STT supported</dt>
          <dd>{speechRecognitionSupported ? "yes" : "no"}</dd>
          <dt className="opacity-60">Engine status</dt>
          <dd>{engineStatus}</dd>
          <dt className="opacity-60">Last event fired</dt>
          <dd>{lastSttEvent || "none"}</dd>
          <dt className="opacity-60">Last error</dt>
          <dd>{lastTranscriptError || "none"}</dd>
          <dt className="opacity-60">Result event count</dt>
          <dd>{sttResultEventCount}</dd>
          <dt className="opacity-60">Segment count</dt>
          <dd>{segments.length}</dd>
          <dt className="opacity-60">Interim text</dt>
          <dd className="break-words">{interimText || "—"}</dd>
          <dt className="opacity-60">Final transcript text</dt>
          <dd className="break-words">{finalTranscriptText || "—"}</dd>
          <dt className="opacity-60">Current step id</dt>
          <dd>{currentStepId || "—"}</dd>
          <dt className="opacity-60">Recording status</dt>
          <dd>{recordingStatus}</dd>
          <dt className="opacity-60">Mic permission</dt>
          <dd>{micPermissionStatus}</dd>
        </dl>
      </Disclosure>

      <Disclosure label="Speech recognition test">
        <div className="space-y-2">
          <p className="text-[11px] opacity-70">
            QA only — runs SpeechRecognition on its own, without MediaRecorder or the main transcript. Say
            &ldquo;Testing speech recognition for OOXii Assist&rdquo; and confirm the text below updates live.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {sttTestStatus === "listening" || sttTestStatus === "restarting" ? (
              <SecondaryButton className="px-3 py-1.5 text-xs" onClick={onStopSttOnlyTest}>
                Stop test
              </SecondaryButton>
            ) : (
              <SecondaryButton className="px-3 py-1.5 text-xs" onClick={onStartSttOnlyTest} disabled={!speechRecognitionSupported}>
                Start STT test
              </SecondaryButton>
            )}
            <SecondaryButton className="px-3 py-1.5 text-xs" onClick={onClearSttOnlyTest}>
              Clear
            </SecondaryButton>
            <StatusBadge label={sttTestStatus} tone={sttTestStatus === "error" ? "danger" : "neutral"} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] opacity-80">
            <dt className="opacity-60">Last event fired</dt>
            <dd>{sttTestLastEvent || "none"}</dd>
            <dt className="opacity-60">Result event count</dt>
            <dd>{sttTestResultCount}</dd>
          </dl>
          <div className="ink-panel space-y-1 p-2 text-xs">
            <p className="opacity-90">{sttTestFinalText || "No final text yet."}</p>
            {sttTestInterim && <p className="italic opacity-60">…{sttTestInterim}</p>}
          </div>
          {sttTestError && <p className="text-[11px] text-red-300">Last test error: {sttTestError}</p>}
        </div>
          </Disclosure>
        </div>
      </Disclosure>
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
  languageCode,
  speechSpeed,
  englishGloss,
  manualFields,
  setManualFields,
  recording,
  paused,
  elapsedSeconds,
  micError,
  overrideReason,
  setOverrideReason,
  showOverrideInput,
  setShowOverrideInput,
  recordingStatus,
  isOnline,
  nudgeVisible,
  canFinish,
  transcriptSegments,
  interimText,
  transcriptUnavailable,
  transcriptUnavailableReason,
  transcriptEngineStatus,
  lastTranscriptError,
  lastSttEvent,
  sttResultEventCount,
  speechRecognitionSupported,
  sttConstructorName,
  secureContext,
  pageOrigin,
  userAgent,
  micPermissionStatus,
  sttTestStatus,
  sttTestInterim,
  sttTestFinalText,
  sttTestError,
  sttTestLastEvent,
  sttTestResultCount,
  onStartSttOnlyTest,
  onStopSttOnlyTest,
  onClearSttOnlyTest,
  unclearSegments,
  onMarkUnclear,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  onBack,
  onNextPrompt,
  onPreviousPrompt,
  onFinish
}: {
  clientId: string;
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  upcomingSteps: PromptStep[];
  languageName: string;
  languageCode: LanguageCode;
  speechSpeed: SpeechSpeed;
  englishGloss?: string;
  manualFields: ManualExtractedFields;
  setManualFields: (fields: ManualExtractedFields) => void;
  recording: boolean;
  paused: boolean;
  elapsedSeconds: number;
  micError: boolean;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  showOverrideInput: boolean;
  setShowOverrideInput: (value: boolean) => void;
  recordingStatus: RecordingStatus;
  isOnline: boolean;
  nudgeVisible: boolean;
  /** Gates only the "Finish & review transcript" action — prompt navigation (swipe/Prev/Next/arrow keys) is always allowed so the tester can browse cards freely while recording continues underneath. */
  canFinish: boolean;
  transcriptSegments: TranscriptSegment[];
  interimText: string;
  transcriptUnavailable: boolean;
  transcriptUnavailableReason: "browser" | "language" | null;
  transcriptEngineStatus: TranscriptEngineStatus;
  lastTranscriptError: string;
  lastSttEvent: string;
  sttResultEventCount: number;
  speechRecognitionSupported: boolean;
  sttConstructorName: "SpeechRecognition" | "webkitSpeechRecognition" | "none";
  secureContext: boolean;
  pageOrigin: string;
  userAgent: string;
  micPermissionStatus: PermissionState | "unsupported";
  sttTestStatus: TranscriptEngineStatus;
  sttTestInterim: string;
  sttTestFinalText: string;
  sttTestError: string;
  sttTestLastEvent: string;
  sttTestResultCount: number;
  onStartSttOnlyTest: () => void;
  onStopSttOnlyTest: () => void;
  onClearSttOnlyTest: () => void;
  unclearSegments: UnclearSegment[];
  onMarkUnclear: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  onBack?: () => void;
  /** Swipe left / fallback "Next" / ArrowRight — moves to the next prompt card. Saves a timestamped marker; never affects recording, transcript, or timer. */
  onNextPrompt: () => void;
  /** Swipe right / fallback "Previous" / ArrowLeft — moves to the previous prompt card. Never deletes transcript or markers. */
  onPreviousPrompt: () => void;
  onFinish: () => void;
}) {
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;
  const recordingEverStarted = recording || paused || recordingStatus === "recorded";
  const recordingLabel = recording && !paused ? "Recording" : recording && paused ? "Paused" : recordingStatus === "recorded" ? "Audio saved" : "Not started";
  const recordingTone = recording && !paused ? "danger" : recordingStatus === "recorded" ? "good" : "warn";
  const canMarkUnclear = recordingEverStarted && !micError;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceInfoMessage, setVoiceInfoMessage] = useState<string | null>(null);
  const speechAvailable = isSpeechSupported() || Boolean(step.audioUrl);
  const isAudioMode = Boolean(step.audioUrl);

  function playStepAloud() {
    speakPrompt({
      text: buildClientSpokenPrompt(step),
      languageCode,
      speed: speechSpeed,
      audioUrl: step.audioUrl,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onVoiceInfo: (message) => setVoiceInfoMessage(message)
    });
  }

  function handlePlayToggle() {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    playStepAloud();
  }

  function handleStopRecording() {
    stopSpeaking();
    setIsSpeaking(false);
    stopRecording();
  }

  function handleFinish() {
    stopSpeaking();
    setIsSpeaking(false);
    onFinish();
  }

  // A new prompt is showing (swipe, Prev/Next, or arrow keys) — any
  // in-flight speech for the previous prompt must not keep talking over it.
  useEffect(() => {
    stopSpeaking();
    setIsSpeaking(false);
    setVoiceInfoMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const [edgeMessage, setEdgeMessage] = useState<string | null>(null);
  const edgeMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Rapid successive swipes/taps/key presses share this lock so a burst of
  // input can't fire two navigations (and two markers) for what reads as one
  // gesture — released a beat after each successful navigation.
  const navigationLockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (edgeMessageTimeoutRef.current) clearTimeout(edgeMessageTimeoutRef.current);
    };
  }, []);

  function flashEdgeMessage(message: string) {
    setEdgeMessage(message);
    if (edgeMessageTimeoutRef.current) clearTimeout(edgeMessageTimeoutRef.current);
    edgeMessageTimeoutRef.current = setTimeout(() => setEdgeMessage(null), 1600);
  }

  function withNavigationLock(action: () => void) {
    if (navigationLockRef.current) return;
    navigationLockRef.current = true;
    action();
    setTimeout(() => {
      navigationLockRef.current = false;
    }, 250);
  }

  const attemptNext = useCallback(() => {
    if (isLastStep) {
      flashEdgeMessage("Final prompt reached");
      return;
    }
    withNavigationLock(onNextPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastStep, onNextPrompt]);

  const attemptPrevious = useCallback(() => {
    if (isFirstStep) {
      flashEdgeMessage("First prompt");
      return;
    }
    withNavigationLock(onPreviousPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstStep, onPreviousPrompt]);

  // Manual-fallback panel open → swipe is disabled outright (the tester's
  // thumb is busy typing right above the card). Keyboard arrows are guarded
  // separately below by focus, which already covers "typing in a field".
  const { dragX, dragging, handlers: swipeHandlers } = useSwipeCard({
    onSwipeLeft: attemptNext,
    onSwipeRight: attemptPrevious,
    disabled: showOverrideInput
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const isEditingField =
        active !== null &&
        (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.tagName === "SELECT" || active.isContentEditable);
      if (isEditingField) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        attemptNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        attemptPrevious();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attemptNext, attemptPrevious]);

  return (
    <section>
      <ScreenHeader title="Record conversation" subtitle={clientId} onBack={onBack} isOnline={isOnline} dense />

      <div
        {...swipeHandlers}
        style={{ touchAction: "pan-y", transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease" }}
      >
        <CompactPromptCard
          // Remounts on every prompt change, so CompactPromptCard's local
          // "Why this matters" open/closed state always starts fresh —
          // otherwise it stays open from a previous prompt (React reuses the
          // same mounted instance across prop changes) and inflates the next
          // card's height, breaking the compact recording layout.
          key={step.id}
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          languageName={languageName}
          englishGloss={englishGloss}
          isSpeaking={isSpeaking}
          isAudioMode={isAudioMode}
          voiceInfoMessage={voiceInfoMessage}
          speechAvailable={speechAvailable}
          onPlayToggle={handlePlayToggle}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button type="button" className="chip-button px-2.5" onClick={attemptPrevious} disabled={isFirstStep} aria-label="Previous prompt">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <ProgressDots total={totalSteps} current={stepIndex} />
          <p className="truncate text-[10px] opacity-50">{edgeMessage ?? "Swipe left / right"}</p>
        </div>
        <button type="button" className="chip-button px-2.5" onClick={attemptNext} disabled={isLastStep} aria-label="Next prompt">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {micError && (
        <div className="mt-2">
          <WarningCard>Microphone unavailable. Add a manual note to continue.</WarningCard>
        </div>
      )}

      <div className="field-card mt-2 p-3">
        <div className="flex items-center justify-between">
          <StatusBadge label={recordingLabel} tone={recordingTone} />
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
            <SecondaryButton className="px-3.5 py-2 text-sm" icon={<Square className="h-4 w-4" />} onClick={handleStopRecording}>
              Stop
            </SecondaryButton>
          )}
        </div>

        {/* One compact note max — never stack the nudge, offline, and playback hints together. */}
        {nudgeVisible ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--warn)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Start recording before asking the question.
          </p>
        ) : !isOnline ? (
          <p className="mt-2 text-[11px] opacity-60">Works fully offline — processes after sync.</p>
        ) : (
          recordingStatus === "recorded" &&
          !recording &&
          !micError && <p className="mt-2 text-[11px] opacity-60">Playback available after Finish &amp; review.</p>
        )}
      </div>

      {recordingEverStarted && !micError && (
        <LiveTranscriptPanel
          segments={transcriptSegments}
          interimText={interimText}
          transcriptUnavailable={transcriptUnavailable}
          transcriptUnavailableReason={transcriptUnavailableReason}
          recording={recording}
          paused={paused}
          recordingStatus={recordingStatus}
          engineStatus={transcriptEngineStatus}
          unclearSegments={unclearSegments}
          manualTranscriptNote={manualFields.additional_notes}
          onManualTranscriptNoteChange={(value) => setManualFields({ ...manualFields, additional_notes: value })}
        />
      )}

      {SHOW_TRANSCRIPT_DEBUG && (
        <TranscriptDiagnosticsPanel
          segments={transcriptSegments}
          interimText={interimText}
          engineStatus={transcriptEngineStatus}
          lastTranscriptError={lastTranscriptError}
          lastSttEvent={lastSttEvent}
          sttResultEventCount={sttResultEventCount}
          speechRecognitionSupported={speechRecognitionSupported}
          sttConstructorName={sttConstructorName}
          secureContext={secureContext}
          pageOrigin={pageOrigin}
          userAgent={userAgent}
          micPermissionStatus={micPermissionStatus}
          currentStepId={step.id}
          recordingStatus={recordingStatus}
          sttTestStatus={sttTestStatus}
          sttTestInterim={sttTestInterim}
          sttTestFinalText={sttTestFinalText}
          sttTestError={sttTestError}
          sttTestLastEvent={sttTestLastEvent}
          sttTestResultCount={sttTestResultCount}
          onStartSttOnlyTest={onStartSttOnlyTest}
          onStopSttOnlyTest={onStopSttOnlyTest}
          onClearSttOnlyTest={onClearSttOnlyTest}
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
          className="min-h-[2.75rem] px-3.5 py-2.5 text-sm"
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={onMarkUnclear}
          disabled={!canMarkUnclear}
        >
          Mark unclear
        </SecondaryButton>
        <PrimaryButton
          fullWidth
          className="min-h-[2.75rem] py-2.5 text-sm"
          disabled={!canFinish}
          icon={<Flag className="h-4 w-4" />}
          onClick={handleFinish}
        >
          Finish &amp; review transcript
        </PrimaryButton>
      </div>
    </section>
  );
}
