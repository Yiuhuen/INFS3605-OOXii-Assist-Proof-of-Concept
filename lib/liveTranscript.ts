import type { LanguageCode } from "./types";
import { createRealSpeechRecognition, getSpeechRecognitionConstructor, isSpeechRecognitionSupported } from "./realSpeechRecognition";

/**
 * ---------------------------------------------------------------------------
 * Live transcript assist — offline-first, optional helper only.
 * ---------------------------------------------------------------------------
 * This module never calls a paid speech-to-text or translation API, and it
 * never fabricates transcript text. English uses the browser's own
 * on-device/OS-level SpeechRecognition (see lib/realSpeechRecognition.ts) when
 * present. Tok Pisin and Bislama have no real recognizer available in this
 * PoC, so live transcript is simply unavailable for those languages — the
 * caller falls back to manual notes, and the audio recording remains the
 * source evidence either way. Nothing here blocks test completion offline.
 * ---------------------------------------------------------------------------
 */

/** Languages this PoC can actually run browser speech recognition for. */
const LIVE_TRANSCRIPT_SUPPORTED_LANGUAGES = new Set<LanguageCode>(["en"]);

/** True only for languages with a real recognizer wired up — used to decide, before starting anything, whether live transcript can run at all for the active language. */
export function isLiveTranscriptSupportedLanguage(language: LanguageCode): boolean {
  return LIVE_TRANSCRIPT_SUPPORTED_LANGUAGES.has(language);
}

/**
 * Local-only text pass used to feed the (also local, keyword-based) field
 * extractor in lib/mockAi.ts. English passes through unchanged. Other
 * languages get a plainly-labeled `[mock translation]` prefix rather than any
 * invented translation — the UI shows this transcript as "Local mock only".
 */
export function mockTranslateToEnglish(rawText: string, language: LanguageCode): string {
  if (language === "en" || !rawText.trim()) return rawText;
  return rawText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      return `[mock translation] ${trimmed}`;
    })
    .join("\n");
}

export { getSpeechRecognitionConstructor };

export function isBrowserRecognitionAvailable(): boolean {
  return isSpeechRecognitionSupported();
}

/** Lifecycle of the underlying transcript engine — drives the "Listening…" / "Transcript updating…" / error UI states and the dev diagnostics panel. */
export type TranscriptEngineStatus = "idle" | "listening" | "restarting" | "error" | "stopped";

export interface LiveTranscriptHandlers {
  onInterim: (text: string) => void;
  /** confidence is the recognition engine's own score (0-1) when it reports one — never a paid-API value. */
  onFinal: (text: string, confidence?: number) => void;
  onStatusChange?: (status: TranscriptEngineStatus) => void;
  /** Raw SpeechRecognition error code (e.g. "not-allowed", "network", "no-speech") — surfaced for the dev diagnostics panel and to drive the unavailable fallback, instead of being silently swallowed. */
  onError?: (errorCode: string) => void;
}

export interface LiveTranscriptController {
  start: () => void;
  stop: () => void;
}

/**
 * English live transcript via the browser's SpeechRecognition API (see
 * lib/realSpeechRecognition.ts for the raw engine) — this is a thin adapter
 * that turns its resultIndex..results.length chunk stream into the
 * onInterim/onFinal calls the app's transcript-segment state expects, and
 * maps its start/end/error lifecycle onto TranscriptEngineStatus.
 * `shouldContinue` is consulted so an intentional stop elsewhere in the app
 * (e.g. "Finish & review") can signal not to bother restarting even if a
 * restart was already in flight when stop() was called.
 */
export function createBrowserRecognitionController(
  handlers: LiveTranscriptHandlers,
  shouldContinue: () => boolean = () => true
): LiveTranscriptController | null {
  // Tracks whether the most recent onerror was fatal (permission/hardware),
  // so onEnd reports "error"/"stopped" instead of "restarting" — the real
  // engine (lib/realSpeechRecognition.ts) already refuses to actually
  // restart after a fatal error; this only fixes the status the UI sees.
  let fatalError = false;

  const engine = createRealSpeechRecognition({
    onStart: () => {
      fatalError = false;
      handlers.onStatusChange?.("listening");
    },
    onResult: (chunks) => {
      let interim = "";
      for (const chunk of chunks) {
        if (chunk.isFinal) {
          if (chunk.transcript.trim()) handlers.onFinal(chunk.transcript.trim(), chunk.confidence);
        } else {
          interim += chunk.transcript;
        }
      }
      if (interim.trim()) handlers.onInterim(interim.trim());
    },
    onError: (errorCode) => {
      handlers.onError?.(errorCode);
      fatalError = errorCode === "not-allowed" || errorCode === "service-not-allowed" || errorCode === "audio-capture";
      if (fatalError) handlers.onStatusChange?.("error");
    },
    onEnd: () => {
      if (fatalError || !shouldContinue()) {
        handlers.onStatusChange?.(fatalError ? "error" : "stopped");
        return;
      }
      handlers.onStatusChange?.("restarting");
    }
  });

  if (!engine) return null;

  return {
    start() {
      fatalError = false;
      engine.start();
    },
    stop() {
      engine.stop();
      handlers.onStatusChange?.("stopped");
    }
  };
}
