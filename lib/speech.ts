import type { LanguageCode, PromptStep } from "./types";

export type SpeechSpeed = "slow" | "normal" | "faster";

export interface SpeechChunk {
  text: string;
  pauseAfterMs: number;
}

export interface VoiceSelection {
  voice: SpeechSynthesisVoice | null;
  /** Honest, user-facing note about voice quality — null when a good natural-sounding match was found. */
  fallbackMessage: string | null;
}

export interface SpeakPromptOptions {
  text: string;
  languageCode: LanguageCode;
  speed?: SpeechSpeed;
  /** Pre-recorded audio (future human-voiced packs). When set, plays instead of browser TTS. */
  audioUrl?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onVoiceInfo?: (message: string | null) => void;
}

const SPEED_SETTINGS: Record<SpeechSpeed, { rate: number; pitch: number }> = {
  slow: { rate: 0.78, pitch: 1.0 },
  normal: { rate: 0.88, pitch: 1.02 },
  faster: { rate: 1.05, pitch: 1.0 }
};

const ENGLISH_NAME_PRIORITY = [/google/i, /microsoft/i, /samantha/i, /daniel/i, /natural/i];
const ENGLISH_LOCALE_PRIORITY = ["en-au", "en-gb", "en-us"];

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
const QUOTE_REGEX = /["'‘’“”`]/g;
const UI_LABEL_REGEX = /\b(step\s+\d+\s+of\s+\d+|tester instruction|why this matters|left eye|right eye)\s*:?/gi;

const SENTENCE_PAUSE_MS = 450;
const CLAUSE_PAUSE_MS = 250;
const LONG_SENTENCE_CHARS = 45;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesListenerAttached = false;

/** getVoices() is frequently empty on first call — this caches the latest result and refreshes via the voiceschanged event. */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) cachedVoices = voices;
  if (!voicesListenerAttached) {
    voicesListenerAttached = true;
    synth.addEventListener("voiceschanged", () => {
      cachedVoices = synth.getVoices();
    });
  }
  return cachedVoices.length ? cachedVoices : voices;
}

export function selectBestVoice(languageCode: LanguageCode): VoiceSelection {
  const voices = getAvailableVoices();
  if (!voices.length) {
    return {
      voice: null,
      fallbackMessage: languageCode === "en" ? "Using device voice" : "Using device voice — pronunciation may vary"
    };
  }

  if (languageCode === "en") {
    for (const pattern of ENGLISH_NAME_PRIORITY) {
      const match = voices.find((voice) => pattern.test(voice.name) && voice.lang.toLowerCase().startsWith("en"));
      if (match) return { voice: match, fallbackMessage: null };
    }
    for (const locale of ENGLISH_LOCALE_PRIORITY) {
      const match = voices.find((voice) => voice.lang.toLowerCase() === locale);
      if (match) return { voice: match, fallbackMessage: "Using device voice" };
    }
    const anyEnglish = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
    return { voice: anyEnglish ?? voices[0], fallbackMessage: "Using device voice" };
  }

  // Bislama/Tok Pisin: real device voices for these languages essentially
  // never exist. Speak using the best English voice as a carrier, but never
  // pretend the pronunciation is clinically validated — always be honest.
  const englishFallback = selectBestVoice("en");
  return { voice: englishFallback.voice, fallbackMessage: "Using device voice — pronunciation may vary" };
}

/** Strips emoji, quote marks, and tester/UI-only labels so text reads as calm spoken language rather than on-screen copy. */
export function normalisePromptForSpeech(text: string): string {
  if (!text) return "";
  return text
    .replace(EMOJI_REGEX, "")
    .replace(UI_LABEL_REGEX, "")
    .replace(QUOTE_REGEX, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/** The text "Play aloud" should speak: the step's own spokenPrompt when present, else a cleaned version of the on-screen client_prompt. */
export function buildClientSpokenPrompt(step: Pick<PromptStep, "spokenPrompt" | "client_prompt">): string {
  const spoken = step.spokenPrompt?.trim();
  return normalisePromptForSpeech(spoken || step.client_prompt);
}

/**
 * Browser SpeechSynthesis has no reliable SSML pause support, so natural
 * pausing is done manually: split on sentence boundaries (longer pause), and
 * only split long sentences further on commas (shorter pause) — short
 * sentences stay whole so the result doesn't sound chopped up.
 */
export function splitPromptIntoSpeechChunks(text: string): SpeechChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: SpeechChunk[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    const isLastSentence = sentenceIndex === sentences.length - 1;
    const clauses = sentence.length > LONG_SENTENCE_CHARS ? sentence.split(/,\s+/).filter(Boolean) : [sentence];

    clauses.forEach((clause, clauseIndex) => {
      const isLastClause = clauseIndex === clauses.length - 1;
      const clauseText = isLastClause ? clause : `${clause},`;
      chunks.push({
        text: clauseText.trim(),
        pauseAfterMs: isLastClause ? (isLastSentence ? 0 : SENTENCE_PAUSE_MS) : CLAUSE_PAUSE_MS
      });
    });
  });

  return chunks;
}

interface ActiveSpeechSession {
  cancelled: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
  audio: HTMLAudioElement | null;
}

let activeSession: ActiveSpeechSession | null = null;

export function stopSpeaking() {
  if (activeSession) {
    activeSession.cancelled = true;
    if (activeSession.timeoutId) clearTimeout(activeSession.timeoutId);
    if (activeSession.audio) {
      activeSession.audio.pause();
      activeSession.audio.currentTime = 0;
    }
    activeSession = null;
  }
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

/**
 * Speaks options.text as calm, natural, chunked speech (or plays
 * options.audioUrl when a pre-recorded asset is available). Always cancels
 * any in-flight speech/audio first, so overlapping voices are impossible.
 */
export function speakPrompt(options: SpeakPromptOptions): boolean {
  const { text, languageCode, speed = "normal", audioUrl, onStart, onEnd, onError, onVoiceInfo } = options;
  stopSpeaking();

  if (audioUrl) {
    const audio = new Audio(audioUrl);
    const session: ActiveSpeechSession = { cancelled: false, timeoutId: null, audio };
    activeSession = session;
    audio.addEventListener("play", () => onStart?.());
    audio.addEventListener("ended", () => {
      if (activeSession === session) activeSession = null;
      onEnd?.();
    });
    audio.addEventListener("error", () => {
      if (activeSession === session) activeSession = null;
      onError?.("Recorded audio failed to play");
    });
    onVoiceInfo?.(null);
    audio.play().catch(() => onError?.("Recorded audio failed to play"));
    return true;
  }

  if (!isSpeechSupported()) {
    onError?.("Speech playback unavailable on this device");
    return false;
  }

  const cleaned = normalisePromptForSpeech(text);
  const chunks = splitPromptIntoSpeechChunks(cleaned);
  if (!chunks.length) return false;

  const { voice, fallbackMessage } = selectBestVoice(languageCode);
  onVoiceInfo?.(fallbackMessage);

  const synth = window.speechSynthesis;
  const { rate, pitch } = SPEED_SETTINGS[speed];
  const session: ActiveSpeechSession = { cancelled: false, timeoutId: null, audio: null };
  activeSession = session;

  function speakChunk(index: number) {
    if (session.cancelled) return;
    if (index >= chunks.length) {
      if (activeSession === session) activeSession = null;
      onEnd?.();
      return;
    }
    const chunk = chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1.0;
    utterance.onstart = () => {
      if (index === 0) onStart?.();
    };
    utterance.onend = () => {
      if (session.cancelled) return;
      if (chunk.pauseAfterMs > 0) {
        session.timeoutId = setTimeout(() => speakChunk(index + 1), chunk.pauseAfterMs);
      } else {
        speakChunk(index + 1);
      }
    };
    utterance.onerror = () => {
      if (session.cancelled) return;
      if (activeSession === session) activeSession = null;
      onError?.("Speech playback failed");
    };
    synth.speak(utterance);
  }

  speakChunk(0);
  return true;
}
