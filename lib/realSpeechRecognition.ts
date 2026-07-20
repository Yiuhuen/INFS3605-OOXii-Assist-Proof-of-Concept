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

type SpeechRecognitionConstructor = new () => any;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/** One recognized chunk from a single onresult event, already unpacked from the raw SpeechRecognitionEvent. */
export interface RecognitionResultChunk {
  transcript: string;
  /** 0-1 engine confidence score, when the browser reports one. */
  confidence?: number;
  isFinal: boolean;
}

export interface RealSpeechRecognitionCallbacks {
  onStart?: () => void;
  /** Fires once per onresult event with only the newly changed chunks (event.resultIndex..event.results.length). */
  onResult?: (chunks: RecognitionResultChunk[]) => void;
  onError?: (errorCode: string) => void;
  onEnd?: () => void;
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

  function clearRestartTimer() {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
  }

  recognition.onstart = () => {
    debugLog("onstart");
    callbacks.onStart?.();
  };

  recognition.onresult = (event: any) => {
    const chunks: RecognitionResultChunk[] = [];
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript: string = result[0]?.transcript ?? "";
      const confidence: number | undefined = typeof result[0]?.confidence === "number" ? result[0].confidence : undefined;
      chunks.push({ transcript, confidence, isFinal: Boolean(result.isFinal) });
    }
    debugLog("onresult", chunks);
    callbacks.onResult?.(chunks);
  };

  recognition.onerror = (event: any) => {
    const code: string = event?.error ?? "unknown";
    debugLog("onerror", code);
    callbacks.onError?.(code);
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
    if (!active || fatalError) return;
    restartTimer = setTimeout(() => {
      if (!active || fatalError) return;
      try {
        recognition.start();
      } catch (err) {
        debugLog("restart failed", err);
      }
    }, RESTART_DELAY_MS);
  };

  return {
    isSupported: () => true,
    start() {
      active = true;
      fatalError = false;
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
