"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Mic,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX
} from "lucide-react";
import type { LanguageCode, ManualExtractedFields, PromptStep, RecordingStatus, TranscriptSegment, UnclearSegment } from "@/lib/types";
import { LIVE_CAPTURED_FIELD_KEYS, LIVE_CAPTURED_FIELD_LABELS, type LiveCapturedFieldMap } from "@/lib/liveCapturedFields";
import {
  Disclosure,
  FormField,
  PrimaryButton,
  RecordButton,
  SecondaryButton,
  StatusBadge,
  StatusDot,
  TextAreaField,
  TranscriptTab,
  WarningCard,
  type StatusDotTone
} from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";
import { buildClientSpokenPrompt, isSpeechSupported, speakPrompt, stopSpeaking, type SpeechSpeed } from "@/lib/speech";
import { type TranscriptEngineStatus } from "@/lib/liveTranscript";

/**
 * Admin diagnostic tool, off by default — never shown on a normal demo run.
 * Visible only when NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG=true is set at build
 * time (e.g. a dedicated QA build), or when the tester has switched on
 * "Show STT diagnostics" under More → Admin tools (adminDiagnosticsEnabled).
 * Rendered inside its own scrollable disclosure — the one deliberate
 * exception to this screen's "no scrolling" contract, since it's opt-in only
 * and never part of the default fitted layout.
 */
const SHOW_TRANSCRIPT_DEBUG_ENV = process.env.NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG === "true";

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

const DRAG_START_PX = 8;
const HORIZONTAL_DOMINANCE_RATIO = 1.25;
const SWIPE_TRIGGER_PX = 55;
const SWIPE_DRAG_CLAMP_PX = 80;
/**
 * Only real input/media/editable controls block a gesture from starting —
 * NOT buttons. "Play aloud" and "Why this matters" live inside the swipe
 * card, and a fat-finger drag that happens to start on one of those chips
 * must still swipe the prompt; see suppressNextClickRef below for how the
 * resulting stray click on the button is neutralised instead.
 */
const NON_SWIPE_CONTROL_SELECTOR = "input, textarea, select, audio, video, [contenteditable='true']";

/**
 * Pointer-based swipe gesture for the prompt card — touch, mouse, and pen all
 * go through the same Pointer Events path, so this works on mobile Chrome,
 * iOS Safari, and desktop drag without separate touch/mouse handlers.
 *
 * A gesture starting on a real form/media control never begins tracking, so
 * it can't hijack a text-field drag or a range slider. The recording screen
 * no longer scrolls vertically at all (OneScreenShell), so there's no
 * competing vertical gesture to guard against here anymore — this hook only
 * ever reacts to horizontal movement, and leaves anything that stays
 * vertical/diagonal alone so native `touch-action: pan-y` scrolling (where
 * applicable) is never fought.
 */
function useSwipeCard({
  onSwipeLeft,
  onSwipeRight,
  disabled,
  suppressNextClickRef
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled: boolean;
  /** Set to true right when a real swipe fires, so the button under the finger can ignore the click event the browser still dispatches after pointerup. */
  suppressNextClickRef: MutableRefObject<boolean>;
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
    if (target.closest(NON_SWIPE_CONTROL_SELECTOR)) return;
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_START_PX) return;
    // Only follow the drag visually once the gesture is clearly horizontal —
    // a vertical scroll never nudges the card sideways, and never gets stuck
    // half-dragged since dragX only updates on genuinely horizontal moves.
    if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO) {
      setDragging(true);
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
    if (Math.abs(dx) < SWIPE_TRIGGER_PX || Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO) return;
    // A real swipe fired from inside the card — the browser still dispatches
    // a click on whatever button sat under the finger; tell it to no-op.
    suppressNextClickRef.current = true;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    releaseCapture(event);
    reset();
  }

  function onLostPointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
    // Fires right after our own releasePointerCapture in onPointerUp/onPointerCancel too — only
    // act if a gesture is still open (e.g. the OS/browser revoked capture without an up/cancel).
    if (gestureRef.current?.pointerId === event.pointerId) reset();
  }

  return {
    dragX,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture
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

/** Sentence-case step context line — "Step 2 of 4 · Right eye". Eye side stays because it is clinically load-bearing; the language pack is a setup-time choice and is not repeated on every card. */
function stepContextLine(stepId: string, stepIndex: number, totalSteps: number) {
  const eye = stepId === "right-distance" ? " · Right eye" : stepId === "left-distance" ? " · Left eye" : "";
  return `Step ${stepIndex + 1} of ${totalSteps}${eye}`;
}

/**
 * Compact prompt panel — step context, the client-facing question, the
 * one-line tester instruction, and "Play aloud". Nothing decorative: no
 * emoji step icons, no repeated language badge, no training content ("Why
 * this matters" lives in the collapsed prompt-guidance area below the main
 * flow). Prompt/instruction text is line-clamped and clamp()-sized so a
 * long clinical sentence still fits the fixed height budget.
 */
function CompactPromptCard({
  step,
  stepIndex,
  totalSteps,
  englishGloss,
  isSpeaking,
  isAudioMode,
  voiceInfoMessage,
  speechAvailable,
  onPlayToggle,
  suppressNextClickRef
}: {
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  englishGloss?: string;
  isSpeaking: boolean;
  /** True when this step plays a pre-recorded audio file rather than browser TTS. */
  isAudioMode: boolean;
  voiceInfoMessage: string | null;
  speechAvailable: boolean;
  onPlayToggle: () => void;
  /** Set by the swipe gesture the instant a real swipe fires — a drag that started on "Play aloud" must move the prompt, not also trigger the button underneath. */
  suppressNextClickRef: MutableRefObject<boolean>;
}) {
  /** Wraps a button's real tap handler so a click that immediately follows a successful swipe is a no-op instead of also firing the button. */
  function guardedClick(action: () => void) {
    return () => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      action();
    };
  }

  return (
    <div className="prompt-card-compact">
      <p className="text-xs font-semibold text-field-muted">{stepContextLine(step.id, stepIndex, totalSteps)}</p>

      <p className="text-prompt mt-1.5 line-clamp-4 font-black">&ldquo;{step.client_prompt}&rdquo;</p>
      {englishGloss && <p className="mt-0.5 line-clamp-1 text-xs opacity-60">English: &ldquo;{englishGloss}&rdquo;</p>}

      <p className="mt-1 line-clamp-2 text-xs opacity-80">
        <span className="font-bold opacity-100">Tester instruction:</span> {step.tester_instruction}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip-button"
          onClick={guardedClick(onPlayToggle)}
          disabled={!speechAvailable}
          title={speechAvailable ? undefined : "Speech playback unavailable on this device"}
        >
          {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {isSpeaking ? "Stop speaking" : "Play aloud"}
        </button>
        {isSpeaking && <span className="text-[11px] font-semibold opacity-70">{isAudioMode ? "Playing recorded audio" : "Speaking…"}</span>}
      </div>
      {voiceInfoMessage && <p className="mt-1 line-clamp-1 text-[11px] opacity-50">{voiceInfoMessage}.</p>}
    </div>
  );
}

/**
 * One-line status for the collapsed transcript tab's subtitle. Mirrors the
 * actual data (segments/interimText) plus the underlying engine's lifecycle
 * (transcriptEngineStatus) so "nothing here yet" always reads as either
 * "still listening" or an honest failure — never a dead placeholder.
 */
function deriveTranscriptSubtitle({
  transcriptUnavailable,
  recording,
  paused,
  recordingStatus,
  finalLineCount,
  interimText,
  engineStatus
}: {
  transcriptUnavailable: boolean;
  recording: boolean;
  paused: boolean;
  recordingStatus: RecordingStatus;
  finalLineCount: number;
  interimText: string;
  engineStatus: TranscriptEngineStatus;
}): string {
  if (transcriptUnavailable) return "Transcript unavailable — manual entry available";
  if (finalLineCount > 0) return `${finalLineCount} line${finalLineCount === 1 ? "" : "s"} captured`;
  const stopped = !recording && !paused;
  if (stopped && recordingStatus === "recorded") return "No transcript captured — manual entry available";
  if (interimText) return "Listening…";
  if (engineStatus === "restarting") return "Reconnecting…";
  if (paused) return "Paused";
  return "Listening…";
}

/**
 * Live transcript as a collapsed-by-default tab — supporting evidence, never
 * the main workflow. Collapsed: subtitle ("3 lines captured") plus the latest
 * line only. Expanded: recent lines in an internally-scrolling panel capped
 * in height, so the recording screen never becomes a transcript scroll.
 * Expansion state lives in the parent and touches nothing else — recording,
 * timer, STT, prompt markers, and captured fields are all upstream state.
 */
function LiveTranscriptTab({
  expanded,
  onToggle,
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
  expanded: boolean;
  onToggle: () => void;
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
  const finalSegments = segments.filter((segment) => segment.isFinal && segment.text.trim());
  const audioRecordedNoSegments = !recording && !paused && recordingStatus === "recorded" && finalSegments.length === 0 && !transcriptUnavailable;
  const manualEntryNeeded = transcriptUnavailable || audioRecordedNoSegments;
  const unavailableMessage =
    transcriptUnavailableReason === "language"
      ? "Not available for this language in the PoC. Audio is still saved."
      : "Unavailable in this browser. Audio is still saved.";
  const [manualOpen, setManualOpen] = useState(false);

  const subtitle = deriveTranscriptSubtitle({
    transcriptUnavailable,
    recording,
    paused,
    recordingStatus,
    finalLineCount: finalSegments.length,
    interimText,
    engineStatus
  });
  const latestSegment = finalSegments[finalSegments.length - 1];

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
    <div>
      <TranscriptTab
        subtitle={subtitle}
        expanded={expanded}
        onToggle={onToggle}
        maxHeightClass="max-h-44"
        collapsedPreview={
          interimText || latestSegment ? (
            <p className={`line-clamp-2 text-sm leading-snug ${interimText && !latestSegment ? "italic opacity-60" : "opacity-90"}`}>
              {interimText && !latestSegment ? interimText : latestSegment?.text}
            </p>
          ) : undefined
        }
      >
        {finalSegments.length === 0 && !interimText && !manualEntryNeeded && (
          <p className="text-sm opacity-60">Listening for speech — text will appear here as the client talks.</p>
        )}
        <div className="space-y-1 text-sm">
          {finalSegments.map((segment) => (
            <p key={segment.id} className="leading-snug">
              <span className="mr-1.5 text-[11px] font-bold tabular-nums opacity-50">{formatClock(segment.timestamp)}</span>
              <span className="mr-1.5 text-[11px] font-semibold opacity-40">{stepTitle(segment.stepId)}</span>
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
        <p className="mt-2 text-[11px] opacity-60">
          Draft only — review required.
          {unclearSegments.length > 0 && ` ${unclearSegments.length} unclear — needs QC.`}
        </p>
      </TranscriptTab>

      {/* Manual fallback stays reachable without expanding the tab — losing
          the transcript is exactly when the tester needs this most. */}
      {manualEntryNeeded && (
        <div className="mt-1.5 space-y-1.5">
          <WarningCard>
            {transcriptUnavailable ? unavailableMessage : "No live transcript captured. Add a manual transcript or send to QC."}
          </WarningCard>
          {manualEntryToggleOrField("Type what the client said, since live transcript isn't available.")}
        </div>
      )}
    </div>
  );
}

/**
 * Progressive auto-fill glance — all 7 key fields are always listed, each
 * with its live status (Captured / Missing / Check), so the tester can see
 * at a glance what the app still hasn't heard yet instead of only being
 * told about fields that already landed. Updates while recording is still
 * running, from whatever the live transcript (interim + final) has picked
 * up so far — see lib/liveCapturedFields.ts for the extraction pipeline this
 * renders. Rendered as a compact two-column dot grid rather than a
 * scrolling pill strip — no badge wall, values shown only when captured,
 * readable down to 320px. Deliberately draft-only: no evidence blocks, no
 * editing, nothing marked final — that happens on Review captured fields.
 */
function CapturedSoFarPanel({ liveFields }: { liveFields: LiveCapturedFieldMap | null }) {
  const capturedCount = liveFields ? LIVE_CAPTURED_FIELD_KEYS.filter((key) => liveFields[key].status !== "Missing").length : 0;

  return (
    <div className="shrink-0 rounded-xl border border-field-line bg-field-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold leading-snug">Captured so far</p>
        <span className="text-[11px] font-semibold opacity-60">
          {capturedCount} of {LIVE_CAPTURED_FIELD_KEYS.length}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {LIVE_CAPTURED_FIELD_KEYS.map((key, index) => {
          const field = liveFields?.[key];
          const status = field?.status ?? "Missing";
          const label = LIVE_CAPTURED_FIELD_LABELS[key];
          const tone: StatusDotTone = status === "Captured" ? "good" : status === "Check" ? "warn" : "muted";
          // The odd 7th row ("Glasses selected", also the longest label) takes
          // the full width so it never truncates at 320/375px.
          const isLastOdd = index === LIVE_CAPTURED_FIELD_KEYS.length - 1 && LIVE_CAPTURED_FIELD_KEYS.length % 2 === 1;
          return (
            <span
              key={key}
              className={`status-dot min-w-0 text-[11px] ${isLastOdd ? "col-span-2" : ""} ${tone === "good" ? "is-good" : tone === "warn" ? "is-warn" : "is-muted"}`}
            >
              <span className="truncate">
                {label}
                {status === "Missing" ? " · Missing" : `: ${field?.value}${status === "Check" ? " · Check" : ""}`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Admin/QA-only diagnostics — rendered only when the caller's gate
 * (SHOW_TRANSCRIPT_DEBUG_ENV or the More → Admin tools toggle) is on,
 * independent of whether a recording/mic session is active, so the
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
    <div>
      <Disclosure label="Admin diagnostic tool">
        <div className="field-card mt-2 space-y-2 p-3">
          <p className="text-sm font-bold">Speech recognition diagnostics</p>
          <p className="text-[11px] opacity-60">Admin/QA only — not part of the normal tester flow. Enabled via More → Admin tools.</p>
          <Disclosure label="Transcript diagnostics">
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1 font-mono text-[11px] opacity-80 sm:grid-cols-2">
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
          <dl className="grid grid-cols-1 gap-x-3 gap-y-1 font-mono text-[11px] opacity-80 sm:grid-cols-2">
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
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Final readable line" value={line} onChange={(event) => updateDistance(event.target.value, letters, field)} />
        <FormField label="Letters on next line" value={letters} onChange={(event) => updateDistance(line, event.target.value, field)} />
      </div>
    );
  }
  if (step.id === "glasses-check") {
    return (
      <div className="space-y-3">
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
  liveFields,
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
  adminDiagnosticsEnabled,
  unclearSegments,
  onMarkUnclear,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  onRerecordRequest,
  onBack,
  onNextPrompt,
  onPreviousPrompt,
  onFinish
}: {
  clientId: string;
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
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
  /** Progressive draft extraction from the live transcript so far (spec §7) — draft only, null until something has been captured. */
  liveFields: LiveCapturedFieldMap | null;
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
  /** More → Admin tools → "Show STT diagnostics" toggle — the only in-app way to reveal the diagnostics panel below; off by default so a normal demo never shows it. */
  adminDiagnosticsEnabled: boolean;
  unclearSegments: UnclearSegment[];
  onMarkUnclear: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  /** Opens the "Discard this recording and rerecord?" confirmation — only ever wired up to show once recording has stopped (see the button below). */
  onRerecordRequest: () => void;
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
  }, [step.id]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  /** Transcript tab expand/collapse — pure presentation state; recording, timer, STT, prompt markers, and captured fields all live upstream in app/page.tsx and are untouched by toggling. */
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

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
  }, [isLastStep, onNextPrompt]);

  const attemptPrevious = useCallback(() => {
    if (isFirstStep) {
      flashEdgeMessage("First prompt");
      return;
    }
    withNavigationLock(onPreviousPrompt);
  }, [isFirstStep, onPreviousPrompt]);

  // Manual-fallback panel open → swipe is disabled outright (the tester's
  // thumb is busy typing right above the card). Keyboard arrows are guarded
  // separately below by focus, which already covers "typing in a field".
  const suppressNextClickRef = useRef(false);
  const { dragX, dragging, handlers: swipeHandlers } = useSwipeCard({
    onSwipeLeft: attemptNext,
    onSwipeRight: attemptPrevious,
    disabled: showOverrideInput,
    suppressNextClickRef
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

  // One-line note shown under the recording button row — nudge takes
  // priority (safety-relevant: don't ask the question before recording
  // starts), then offline/playback status. Rendered only when there's
  // something to say, so the persistent dock stays as short as possible by
  // default instead of always reserving a blank line for it.
  const recordingNote = nudgeVisible
    ? "nudge"
    : !isOnline
      ? "offline"
      : recordingStatus === "recorded" && !recording && !micError
        ? "playback"
        : null;

  return (
    <OneScreenShell
      header={<CompactHeader title="Record" subtitle={clientId} onBack={onBack} isOnline={isOnline} />}
      footer={
        // Persistent control dock (spec: recording controls must never be
        // scrollable-away) — everything here lives in OneScreenShell's
        // `footer` grid row, which sits outside the content column's own
        // `overflow-y-auto` entirely. That's a plain CSS grid row, not
        // `position: sticky`, so it can't be defeated by an `overflow-hidden`
        // ancestor or a transformed sibling (the swipe card uses an inline
        // `transform`, which only affects its own descendants). Recording
        // status/timer/Start-Stop and Mark unclear/Finish & review are now
        // one always-visible unit instead of two.
        <BottomActionBar className="flex-col items-stretch gap-2">
          <div className="flex items-center justify-between">
            <StatusDot label={recordingLabel} tone={recordingTone} />
            <span className="text-xl font-black tabular-nums">{formatElapsed(elapsedSeconds)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {!recordingEverStarted && (
              <RecordButton fullWidth className="min-h-[2.75rem] px-4 py-2 text-sm" icon={<Mic className="h-4 w-4" />} onClick={startRecording}>
                Start recording
              </RecordButton>
            )}
            {recording && !paused && (
              <SecondaryButton className="min-h-[2.75rem] px-3.5 py-1.5 text-sm" icon={<Pause className="h-4 w-4" />} onClick={pauseRecording}>
                Pause
              </SecondaryButton>
            )}
            {recording && paused && (
              <SecondaryButton className="min-h-[2.75rem] px-3.5 py-1.5 text-sm" icon={<Play className="h-4 w-4" />} onClick={resumeRecording}>
                Resume
              </SecondaryButton>
            )}
            {recording && (
              <SecondaryButton className="min-h-[2.75rem] px-3.5 py-1.5 text-sm" icon={<Square className="h-4 w-4" />} onClick={handleStopRecording}>
                Stop
              </SecondaryButton>
            )}
            {!recording && recordingStatus === "recorded" && (
              <SecondaryButton className="min-h-[2.75rem] px-3.5 py-1.5 text-sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onRerecordRequest}>
                Rerecord
              </SecondaryButton>
            )}
          </div>

          {recordingNote && (
            <p className="line-clamp-1 text-[11px] opacity-60">
              {recordingNote === "nudge" ? (
                <span className="flex items-center gap-1.5 font-semibold text-[var(--warn)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Start recording before asking the question.
                </span>
              ) : recordingNote === "offline" ? (
                "Works fully offline — processes after sync."
              ) : (
                "Playback available after Finish & review."
              )}
            </p>
          )}

          <div className="flex items-center gap-2 border-t border-field-line pt-2">
            <SecondaryButton
              className="min-h-[2.75rem] shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm"
              icon={<AlertTriangle className="h-4 w-4" />}
              onClick={onMarkUnclear}
              disabled={!canMarkUnclear}
            >
              Mark unclear
            </SecondaryButton>
            <PrimaryButton
              fullWidth
              className="min-h-[2.75rem] flex-1 py-2.5 text-sm"
              disabled={!canFinish}
              icon={<Flag className="h-4 w-4" />}
              onClick={handleFinish}
            >
              Finish &amp; review
            </PrimaryButton>
          </div>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto">
        {/* 1. Prompt panel — swipe left/right navigates prompts; recording/timer/transcript state is untouched by navigation. Covers the whole card (prompt text, tester instruction, eye/language badges, why-this-matters, background) — not just a thin inner strip. */}
        <div
          {...swipeHandlers}
          className="shrink-0 cursor-grab select-none active:cursor-grabbing"
          style={{ touchAction: "pan-y", transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease" }}
        >
          <CompactPromptCard
            // Remounts on every prompt change so any transient per-card state always starts fresh.
            key={step.id}
            step={step}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            englishGloss={englishGloss}
            isSpeaking={isSpeaking}
            isAudioMode={isAudioMode}
            voiceInfoMessage={voiceInfoMessage}
            speechAvailable={speechAvailable}
            onPlayToggle={handlePlayToggle}
            suppressNextClickRef={suppressNextClickRef}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <button type="button" className="chip-button px-2.5" onClick={attemptPrevious} disabled={isFirstStep} aria-label="Previous prompt">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <ProgressDots total={totalSteps} current={stepIndex} />
            <p className="truncate text-[10px] opacity-50">{edgeMessage ?? "Swipe left / right"}</p>
          </div>
          <button type="button" className="chip-button px-2.5" onClick={attemptNext} disabled={isLastStep} aria-label="Next prompt">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {micError && (
          <div className="shrink-0">
            <WarningCard>Microphone unavailable. Add a manual note to continue.</WarningCard>
          </div>
        )}

        {/* Recording status, timer, and Start/Stop now live in the persistent footer dock below, so they cannot be scrolled out of view. */}

        {/* 3. Captured so far — the main workflow. Always lists all 7 fields
            (all "Missing" until the live transcript fills them), sits above
            and more prominent than the transcript. Shown even when the mic
            has failed: that's exactly when the tester falls back to the
            "Cannot record?" manual note below, and this panel is the only
            feedback that manual text is actually being picked up live. */}
        <CapturedSoFarPanel liveFields={liveFields} />

        {/* 4. Transcript — supporting evidence, collapsed by default. Expanding
            only reveals already-held data; recording/timer/STT are untouched. */}
        {recordingEverStarted && !micError && (
          <div className="shrink-0">
            <LiveTranscriptTab
              expanded={transcriptExpanded}
              onToggle={() => setTranscriptExpanded((value) => !value)}
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
          </div>
        )}

        {/* Admin-only diagnostics — opt-in, scrolls internally, never part of the default fitted layout. */}
        {(SHOW_TRANSCRIPT_DEBUG_ENV || adminDiagnosticsEnabled) && (
          <div className="max-h-40 shrink-0 overflow-y-auto">
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
          </div>
        )}

        {/* "Cannot record?" manual fallback — the one explicit expanded detail
            area on this screen besides diagnostics: collapsed header takes no
            extra space, and once opened its fields scroll internally within
            whatever room is left rather than growing the outer page. */}
        {/* Collapsed help — the training-refresh content that used to sit on
            the prompt card. Outside the main recording flow on purpose; the
            full version lives in Training. */}
        <div className="shrink-0">
          <Disclosure label="Why this prompt matters">
            <p className="text-xs leading-relaxed opacity-70">{step.why_this_matters}</p>
          </Disclosure>
        </div>

        <div className="shrink-0">
          <button
            className="flex w-full items-center justify-between rounded-xl border border-field-line bg-field-card px-3 py-2 text-left text-sm font-semibold"
            onClick={() => setShowOverrideInput(!showOverrideInput)}
          >
            Cannot record?
            <ChevronDown className={`h-4 w-4 transition ${showOverrideInput ? "rotate-180" : ""}`} />
          </button>
        </div>
        {showOverrideInput && (
          <div className="shrink-0 space-y-3">
            <TextAreaField
              label="Reason recording or transcript is unavailable"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="e.g. Client declined recording; noisy environment; device microphone broken; live transcript did not capture the answer."
              rows={2}
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
      </div>
    </OneScreenShell>
  );
}
