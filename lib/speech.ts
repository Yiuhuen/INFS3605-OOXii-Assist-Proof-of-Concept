export function isSpeechAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(synth: SpeechSynthesis) {
  const voices = synth.getVoices();
  if (!voices.length) return undefined;
  const byName = voices.find((voice) => /samantha|karen|serena|female|natural/i.test(voice.name));
  if (byName) return byName;
  const enVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
  return enVoice ?? voices[0];
}

/**
 * Speaks text one sentence at a time so the browser's queue naturally inserts
 * short pauses between clauses, which reads far less flat/robotic than a
 * single long utterance.
 */
export function speakClientPrompt(text: string) {
  if (!isSpeechAvailable()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(synth);
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const segments = sentences.length ? sentences : [text];
  segments.forEach((segment) => {
    const utterance = new SpeechSynthesisUtterance(segment.trim());
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1.03;
    utterance.volume = 1;
    synth.speak(utterance);
  });
  return true;
}

export function stopSpeaking() {
  if (isSpeechAvailable()) window.speechSynthesis.cancel();
}
