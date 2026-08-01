/**
 * ---------------------------------------------------------------------------
 * Real browser speech recognition — thin wrapper around the native
 * SpeechRecognition / webkitSpeechRecognition engine. This module never
 * fabricates transcript text: everything it reports came from the browser's
 * own recognizer listening to the microphone.
 * ---------------------------------------------------------------------------
 */

const DEBUG_STT = process.env.NODE_ENV !== "production";

function debugLog(scope: string, ...args: unknown[]) {
  if (DEBUG_STT) console.debug(`[real-speech-recognition:${scope}]`, ...args);
}

/**
 * Minimal shape of the browser's SpeechRecognition instance/event this module
 * actually touches — there is no official lib.dom type for this API, and the
 * full spec surface is much larger than what's used here.
 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string; confidence?: number } | undefined;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundend: (() => void) | null;
  onaudioend: (() => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/** Which global the engine actually resolved — surfaced in the dev diagnostics panel instead of a bare yes/no, since Safari/older Chrome only expose the vendor-prefixed form. */
export function getSpeechRecognitionConstructorName(): "SpeechRecognition" | "webkitSpeechRecognition" | "none" {
  if (typeof window === "undefined") return "none";
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  if (w.SpeechRecognition) return "SpeechRecognition";
  if (w.webkitSpeechRecognition) return "webkitSpeechRecognition";
  return "none";
}

/** One recognized chunk from a single onresult event, already unpacked from the raw SpeechRecognitionEvent. */
export interface RecognitionResultChunk {
  transcript: string;
  /** 0-1 engine confidence score, when the browser reports one. */
  confidence?: number;
  isFinal: boolean;
}

/** The full SpeechRecognition event lifecycle — every one of these can be individually diagnosed via onLifecycleEvent below, so a dev debugging a missed word can see exactly which stage the engine reached (e.g. "onspeechstart fired but onresult never did" points at recognition quality, not app wiring). */
export type RecognitionLifecycleEvent =
  | "start"
  | "audiostart"
  | "soundstart"
  | "speechstart"
  | "result"
  | "speechend"
  | "soundend"
  | "audioend"
  | "nomatch"
  | "error"
  | "end";

export interface RealSpeechRecognitionCallbacks {
  onStart?: () => void;
  onAudioStart?: () => void;
  onSoundStart?: () => void;
  onSpeechStart?: () => void;
  /** Fires once per onresult event with only the newly changed chunks (event.resultIndex..event.results.length). */
  onResult?: (chunks: RecognitionResultChunk[]) => void;
  onSpeechEnd?: () => void;
  onSoundEnd?: () => void;
  onAudioEnd?: () => void;
  onNoMatch?: () => void;
  onError?: (errorCode: string) => void;
  onEnd?: () => void;
  /** Fires alongside every specific callback above — a single feed for diagnostics UIs that just want "what was the last thing the engine did". */
  onLifecycleEvent?: (event: RecognitionLifecycleEvent) => void;
}

export interface RealSpeechRecognitionController {
  isSupported: () => boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/** Recognition error codes that mean "don't bother retrying" — the caller needs to fix a permission/hardware problem, not wait out a transient blip like "no-speech" or "network". */
const FATAL_RECOGNITION_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

/**
 * SpeechRecognition stops itself after a period of silence even with
 * continuous=true, so it must be restarted on `onend`. Restarting
 * *immediately* (synchronously, inside the onend handler) is a well-known
 * source of a silent `InvalidStateError` — the engine hasn't finished
 * tearing down yet, start() throws, and the recognizer is left stuck with no
 * further events ever firing. A short delay lets it fully stop before
 * restarting.
 */
const RESTART_DELAY_MS = 250;

/**
 * A restart attempt can itself throw (the exact InvalidStateError the delay
 * above exists to avoid can still happen, e.g. under real device/OS
 * scheduling jitter). Previously a thrown restart was only logged — no
 * further restart was ever scheduled, so the engine went silently dead with
 * the UI stuck showing "Reconnecting…" forever. Retrying a bounded number of
 * times, then surfacing an honest error instead of retrying forever, means
 * the tester eventually sees "recognition unavailable" rather than a live
 * transcript that has quietly stopped updating.
 */
const MAX_RESTART_ATTEMPTS = 5;

/**
 * Creates a real SpeechRecognition-backed controller. Returns null when the
 * browser has no SpeechRecognition engine at all — callers should check
 * `isSpeechRecognitionSupported()` up front, but `isSupported()` on the
 * returned controller (when non-null) always reports true.
 */
export function createRealSpeechRecognition(callbacks: RealSpeechRecognitionCallbacks): RealSpeechRecognitionController | null {
  const RecognitionCtor = getSpeechRecognitionConstructor();
  if (!RecognitionCtor) return null;

  const recognition = new RecognitionCtor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let active = false;
  let fatalError = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let restartAttempts = 0;

  function clearRestartTimer() {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
  }

  function scheduleRestart() {
    restartTimer = setTimeout(() => {
      if (!active || fatalError) return;
      try {
        recognition.start();
        // Success is confirmed by onstart (below), which resets the counter
        // — a start() call not throwing only means the browser accepted the
        // request, not that recognition is actually running yet.
      } catch (err) {
        debugLog("restart failed", err);
        restartAttempts += 1;
        if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
          debugLog("restart attempts exhausted — giving up", restartAttempts);
          fatalError = true;
          active = false;
          callbacks.onError?.("restart-failed");
          callbacks.onLifecycleEvent?.("error");
          return;
        }
        scheduleRestart();
      }
    }, RESTART_DELAY_MS);
  }

  recognition.onstart = () => {
    debugLog("onstart");
    restartAttempts = 0;
    callbacks.onStart?.();
    callbacks.onLifecycleEvent?.("start");
  };

  // These four fire in order as the engine actually detects audio/voice —
  // none of them touch transcript text, but seeing which ones fired (or
  // didn't) is exactly how you tell "the mic never picked up sound" apart
  // from "sound arrived but the engine couldn't recognise words" apart from
  // "words were recognised but the app dropped them".
  recognition.onaudiostart = () => {
    debugLog("onaudiostart");
    callbacks.onAudioStart?.();
    callbacks.onLifecycleEvent?.("audiostart");
  };
  recognition.onsoundstart = () => {
    debugLog("onsoundstart");
    callbacks.onSoundStart?.();
    callbacks.onLifecycleEvent?.("soundstart");
  };
  recognition.onspeechstart = () => {
    debugLog("onspeechstart");
    callbacks.onSpeechStart?.();
    callbacks.onLifecycleEvent?.("speechstart");
  };
  recognition.onspeechend = () => {
    debugLog("onspeechend");
    callbacks.onSpeechEnd?.();
    callbacks.onLifecycleEvent?.("speechend");
  };
  recognition.onsoundend = () => {
    debugLog("onsoundend");
    callbacks.onSoundEnd?.();
    callbacks.onLifecycleEvent?.("soundend");
  };
  recognition.onaudioend = () => {
    debugLog("onaudioend");
    callbacks.onAudioEnd?.();
    callbacks.onLifecycleEvent?.("audioend");
  };
  recognition.onnomatch = () => {
    debugLog("onnomatch");
    callbacks.onNoMatch?.();
    callbacks.onLifecycleEvent?.("nomatch");
  };

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    const chunks: RecognitionResultChunk[] = [];
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript: string = result[0]?.transcript ?? "";
      const confidence: number | undefined = typeof result[0]?.confidence === "number" ? result[0].confidence : undefined;
      chunks.push({ transcript, confidence, isFinal: Boolean(result.isFinal) });
    }
    debugLog("onresult", chunks);
    callbacks.onResult?.(chunks);
    callbacks.onLifecycleEvent?.("result");
  };

  recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
    const code: string = event?.error ?? "unknown";
    debugLog("onerror", code);
    callbacks.onError?.(code);
    callbacks.onLifecycleEvent?.("error");
    if (FATAL_RECOGNITION_ERRORS.has(code)) {
      fatalError = true;
      active = false;
      clearRestartTimer();
    }
  };

  recognition.onend = () => {
    debugLog("onend", { active, fatalError });
    clearRestartTimer();
    callbacks.onEnd?.();
    callbacks.onLifecycleEvent?.("end");
    if (!active || fatalError) return;
    scheduleRestart();
  };

  return {
    isSupported: () => true,
    start() {
      active = true;
      fatalError = false;
      restartAttempts = 0;
      try {
        recognition.start();
      } catch (err) {
        debugLog("start failed", err);
      }
    },
    stop() {
      active = false;
      clearRestartTimer();
      try {
        recognition.stop();
      } catch {
        // Not running — ignore.
      }
    },
    abort() {
      active = false;
      clearRestartTimer();
      try {
        recognition.abort();
      } catch {
        // Not running — ignore.
      }
    }
  };
}
