"use client";

import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import type { LanguagePack, ManualExtractedFields, Tester } from "@/lib/types";
import { DEMO_SAMPLE_TRANSCRIPT } from "@/lib/demoHelpers";
import { extractFieldsFromTranscript, FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { CheckboxCard, Disclosure, PrimaryButton } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HighlightedTranscript } from "@/components/TranscriptHighlight";

/** Sells the app on speed/value to a tester who already knows the physical test — never re-explains the clinical steps themselves. Plain rows, no icon circles: this is an operational refresher, not a feature-card marketing page. */
const WHY_USE_THE_APP = [
  { title: "Capture while testing", text: "Nothing to remember and re-enter later." },
  { title: "Reduce later admin", text: "Fields fill in from what's said, not retyped from memory." },
  { title: "Catch missing fields", text: "Flagged while you can still ask, not after." },
  { title: "Review evidence quickly", text: "Jump straight to the transcript line behind a value." },
  { title: "Export cleaner data", text: "Ready for export the moment QC is clear." }
];

const HABIT_BRIDGE_STEPS = [
  "Start new test",
  "Record while testing — talk through it as normal",
  "Confirm the fields that filled in",
  "Resolve QC only if something's flagged",
  "Export"
];

/** Preview of the same 7 key fields RecordingScreen's "Captured so far" strip leads with. */
const PRACTICE_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
];

function PracticePreview() {
  const [focusField, setFocusField] = useState<keyof ManualExtractedFields | null>(null);
  const draft = useMemo(
    () =>
      extractFieldsFromTranscript({
        rawTranscriptText: DEMO_SAMPLE_TRANSCRIPT,
        transcriptSegments: [],
        promptMarkers: [],
        language: "en"
      }),
    []
  );
  const focusEvidence = focusField ? draft[focusField]?.evidence : undefined;

  return (
    <div className="space-y-3">
      <p className="text-xs opacity-70">
        Sample line: <span className="italic">&ldquo;{DEMO_SAMPLE_TRANSCRIPT}&rdquo;</span>
      </p>
      <div>
        <p className="mb-1.5 text-[10px] font-bold text-field-muted">Captured so far</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRACTICE_FIELD_ORDER.map((key) => {
            const meta = draft[key];
            const hasValue = Boolean(meta?.value);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFocusField(key)}
                className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                  focusField === key ? "border-[var(--gold)] bg-[var(--gold-tint)]" : "border-field-line bg-field-card"
                }`}
              >
                <span className="block truncate opacity-70">{FIELD_DISPLAY_LABELS[key]}</span>
                <span className="block truncate font-bold">{hasValue ? meta!.value : "Not captured"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] opacity-60">Tap a field to see where it came from in the transcript below.</p>
      </div>
      <div className="ink-panel text-sm">
        <HighlightedTranscript text={DEMO_SAMPLE_TRANSCRIPT} focusPhrase={focusEvidence} />
      </div>
      <div className="rounded-xl border border-field-line bg-field-surface p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold">
          <ListChecks className="h-3.5 w-3.5 text-[var(--gold)]" />
          QC example
        </p>
        <p className="mt-1 text-xs opacity-70">
          This sample never states a final readable line explicitly, so <strong>Final readable line</strong> stays{" "}
          <strong className="text-[var(--warn)]">Check</strong> until confirmed — QC catches exactly this kind of gap
          before export.
        </p>
      </div>
    </div>
  );
}

export function TrainingScreen({
  tester,
  activePack,
  isOnline,
  onComplete,
  onBack
}: {
  tester: Tester;
  activePack: LanguagePack;
  isOnline: boolean;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section>
      <ScreenHeader title="Why use the app" onBack={onBack} isOnline={isOnline} />
      <p className="mb-4 text-sm opacity-70">
        You already know how to run the test. This is the quick version of what the app adds — not a walkthrough of
        the clinical steps.
      </p>

      <p className="mb-2 text-xs font-bold opacity-50">Why use the app?</p>
      <div className="field-card mb-5 divide-y divide-field-line">
        {WHY_USE_THE_APP.map(({ title, text }) => (
          <p key={title} className="py-2 text-sm leading-snug first:pt-0 last:pb-0">
            <span className="font-bold">{title}.</span> <span className="opacity-80">{text}</span>
          </p>
        ))}
      </div>

      <p className="mb-2 text-xs font-bold opacity-50">Fast habit</p>
      <div className="field-card mb-5">
        <ol className="space-y-2">
          {HABIT_BRIDGE_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-[11px] font-bold text-[var(--gold-ink)]">
                {index + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mb-2 text-xs font-bold opacity-50">Remember</p>
      <div className="field-card mb-5 space-y-1.5 text-sm opacity-85">
        <p>Speech-to-text is a draft, not a transcript guarantee.</p>
        <p>The app does not confirm clinical results — it supports capture and review.</p>
        <p>You still confirm the final data before it saves.</p>
      </div>

      <div className="mb-6">
        <Disclosure label="60-second practice">
          <PracticePreview />
        </Disclosure>
      </div>

      <CheckboxCard checked={confirmed} onToggle={() => setConfirmed((value) => !value)} label="Reviewed — ready to test." />

      <PrimaryButton fullWidth className="mt-4" disabled={!confirmed} onClick={onComplete}>
        Continue to Home
      </PrimaryButton>

      {!tester.is_new_tester && (
        <p className="mt-4 text-center text-sm opacity-60">Optional refresher — return to Home from Settings any time.</p>
      )}
      {!activePack.downloaded && !isOnline && <p className="mt-2 text-center text-xs opacity-50">Language pack downloads when back online.</p>}
    </section>
  );
}
