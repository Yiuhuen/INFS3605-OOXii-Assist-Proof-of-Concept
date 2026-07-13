import type { LanguageCode } from "./types";

/**
 * ---------------------------------------------------------------------------
 * Live transcript assist — offline-first, optional helper only.
 * ---------------------------------------------------------------------------
 * This module never calls a paid speech-to-text or translation API. English
 * uses the browser's own on-device/OS-level SpeechRecognition when present;
 * Tok Pisin and Bislama use a scripted mock generator (Week 7 PoC simulation,
 * not real recognition — see createMockLiveTranscriptController below). If
 * neither is available, the caller falls back to manual notes and the audio
 * recording remains the source evidence either way. Nothing here blocks test
 * completion offline.
 * ---------------------------------------------------------------------------
 */

type DemoStepId = "intro" | "right-distance" | "left-distance" | "glasses-check";

interface DemoLine {
  text: string;
  english: string;
}

/**
 * Realistic client-side utterances for the mock live-transcript demo languages.
 * Each line is self-contained (no line break needed) so the English translation
 * keeps the "line N ... right/left eye" phrasing mockExtractFields looks for.
 */
const TPI_DEMO_LINES: Record<DemoStepId, DemoLine[]> = {
  intro: [
    { text: "Orait, mi redi long dispela test.", english: "Okay, I am ready for this test." },
    { text: "Mi save gut long Tok Pisin, yu ken askim mi.", english: "I am comfortable in Tok Pisin, you can ask me." }
  ],
  "right-distance": [
    { text: "Mi lukim lain namba 6 klia long right ai.", english: "I can read line 6 clearly with the right eye." },
    { text: "Mi no bin gat operesen long katarak.", english: "I have not had cataract surgery." }
  ],
  "left-distance": [
    { text: "Mi lukim lain namba 7 klia long left ai.", english: "I can read line 7 clearly with the left eye." },
    { text: "Em i liklik hatwok tasol mi inap ridim.", english: "It is a little hard but I can read it." }
  ],
  "glasses-check": [
    { text: "Nogat. Mi no gat glas nau.", english: "No. I do not have glasses now." },
    { text: "Trial glasses i mekim lukluk i kamap klia na orait.", english: "The trial glasses make my vision clearer and comfortable." }
  ]
};

const BIS_DEMO_LINES: Record<DemoStepId, DemoLine[]> = {
  intro: [
    { text: "Oraet, mi rere blong test ia.", english: "Okay, I am ready for this test." },
    { text: "Mi save gud long Bislama, yu save askem mi.", english: "I am comfortable in Bislama, you can ask me." }
  ],
  "right-distance": [
    { text: "Mi save luk laen namba 6 klia long raet ae.", english: "I can read line 6 clearly with the right eye." },
    { text: "Mi neva gat operesen blong katarak.", english: "I have not had cataract surgery." }
  ],
  "left-distance": [
    { text: "Mi save luk laen namba 7 klia long lef ae.", english: "I can read line 7 clearly with the left eye." },
    { text: "Hem i lelebet had be mi save ridim.", english: "It is a little hard but I can read it." }
  ],
  "glasses-check": [
    { text: "Nogat. Mi no gat glas naoia.", english: "No. I do not have glasses now." },
    { text: "Trial glasses i mekem lukluk blong mi i kam klia mo gud.", english: "The trial glasses make my vision clearer and comfortable." }
  ]
};

const DEMO_LINE_BANKS: Partial<Record<LanguageCode, Record<DemoStepId, DemoLine[]>>> = {
  tpi: TPI_DEMO_LINES,
  bis: BIS_DEMO_LINES
};

const TRANSLATION_LOOKUP: Partial<Record<LanguageCode, Record<string, string>>> = {
  tpi: Object.fromEntries(Object.values(TPI_DEMO_LINES).flat().map((line) => [line.text, line.english])),
  bis: Object.fromEntries(Object.values(BIS_DEMO_LINES).flat().map((line) => [line.text, line.english]))
};

/** Mock translation: English passes through unchanged; demo languages use a phrase dictionary built from the same lines the mock generator speaks. */
export function mockTranslateToEnglish(rawText: string, language: LanguageCode): string {
  if (language === "en" || !rawText.trim()) return rawText;
  const dictionary = TRANSLATION_LOOKUP[language] ?? {};
  return rawText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      return dictionary[trimmed] ?? `[mock translation] ${trimmed}`;
    })
    .join("\n");
}

export interface LiveTranscriptHandlers {
  onInterim: (text: string) => void;
  /** confidence is the recognition engine's own score (0-1) when it reports one — never a paid-API value. */
  onFinal: (text: string, confidence?: number) => void;
}

export interface LiveTranscriptController {
  start: () => void;
  stop: () => void;
}

export function isBrowserRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** English live transcript via the browser's SpeechRecognition API — continuous + interim results, auto-restarting when the engine times out. */
export function createBrowserRecognitionController(handlers: LiveTranscriptHandlers): LiveTranscriptController | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
  const RecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!RecognitionCtor) return null;

  const recognition = new RecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let shouldRun = false;

  recognition.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text: string = result[0]?.transcript ?? "";
      if (result.isFinal) {
        if (text.trim()) {
          const confidence: number | undefined = typeof result[0]?.confidence === "number" ? result[0].confidence : undefined;
          handlers.onFinal(text.trim(), confidence);
        }
      } else {
        interim += text;
      }
    }
    if (interim.trim()) handlers.onInterim(interim.trim());
  };

  recognition.onerror = () => {
    // Transient errors (no-speech, network) are swallowed; onend drives the restart loop below.
  };

  recognition.onend = () => {
    if (!shouldRun) return;
    try {
      recognition.start();
    } catch {
      // Already running — ignore.
    }
  };

  return {
    start() {
      shouldRun = true;
      try {
        recognition.start();
      } catch {
        // Already started — ignore.
      }
    },
    stop() {
      shouldRun = false;
      try {
        recognition.stop();
      } catch {
        // Not running — ignore.
      }
    }
  };
}

/**
 * PoC SIMULATION — Week 7 demo only. This is NOT real speech recognition and
 * does not listen to the microphone at all; it plays back scripted demo lines
 * on a timer so the "Live transcript assist" panel visibly grows while
 * recording, standing in for a future on-device Tok Pisin/Bislama recognizer.
 * Appends a realistic demo line every few seconds, briefly shown as interim
 * text before finalizing, so the panel reads like a real conversation.
 */
export function createMockLiveTranscriptController(
  language: LanguageCode,
  getStepId: () => string,
  handlers: LiveTranscriptHandlers
): LiveTranscriptController {
  const bank = DEMO_LINE_BANKS[language] ?? TPI_DEMO_LINES;
  const cursors: Partial<Record<DemoStepId, number>> = {};
  let interimTimer: ReturnType<typeof setTimeout> | null = null;
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  function clearTimers() {
    if (interimTimer) clearTimeout(interimTimer);
    if (loopTimer) clearTimeout(loopTimer);
    interimTimer = null;
    loopTimer = null;
  }

  function scheduleNext(delay: number) {
    loopTimer = setTimeout(tick, delay);
  }

  function tick() {
    if (stopped) return;
    const stepId = (getStepId() as DemoStepId) || "intro";
    const lines = bank[stepId] ?? bank.intro;
    const cursor = cursors[stepId] ?? 0;
    const line = lines[cursor % lines.length];
    cursors[stepId] = cursor + 1;

    handlers.onInterim(line.text);
    interimTimer = setTimeout(() => {
      if (stopped) return;
      handlers.onFinal(line.text);
      scheduleNext(3000 + Math.random() * 2500);
    }, 900);
  }

  return {
    start() {
      stopped = false;
      scheduleNext(1200);
    },
    stop() {
      stopped = true;
      clearTimers();
    }
  };
}
