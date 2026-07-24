/**
 * ---------------------------------------------------------------------------
 * Demo-recording helpers — never real STT, never production behaviour.
 * ---------------------------------------------------------------------------
 * Gated so these controls cannot appear in a real deployment by accident:
 * visible only in a local dev build, or when an operator has explicitly
 * opted in via NEXT_PUBLIC_DEMO_HELPERS=true for a rehearsed demo build.
 * Nothing here talks to audio/STT/translation — it only ever writes into the
 * corrected-transcript field a tester could type into by hand anyway, and it
 * always marks the record so QC and export can see it was used.
 * ---------------------------------------------------------------------------
 */
export const DEMO_HELPERS_ENABLED = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_HELPERS === "true";

/** Fixed sample text for the "Insert sample transcript for demo" helper — the same transcript every time, so a rehearsed demo behaves identically on every run. Never presented as, or mistaken for, real speech-recognition output. */
export const DEMO_SAMPLE_TRANSCRIPT =
  "The client already has glasses. The right eye can read line five. The left eye can read line four. The client feels comfortable. The final readable line is line four.";
