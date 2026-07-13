"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ManualExtractedFields, PromptStep } from "@/lib/types";
import { Disclosure, FormField, PrimaryButton, PromptCard, SectionDivider, StepBadges, TextAreaField } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechAvailable } from "@/lib/speech";

function stepTitle(stepId: string) {
  if (stepId === "right-distance" || stepId === "left-distance") return "Distance vision";
  if (stepId === "glasses-check") return "Glasses fitting";
  return "Introduction";
}

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

export function TestingScreen({
  clientId,
  step,
  stepIndex,
  totalSteps,
  languageName,
  manualFields,
  setManualFields,
  isOnline,
  speakPrompt,
  onBack,
  onContinue
}: {
  clientId: string;
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  languageName: string;
  manualFields: ManualExtractedFields;
  setManualFields: (fields: ManualExtractedFields) => void;
  isOnline: boolean;
  speakPrompt: (text: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const entryFields = <ManualEntryFields step={step} manualFields={manualFields} setManualFields={setManualFields} />;

  return (
    <section>
      <ScreenHeader title={stepTitle(step.id)} subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="status-pill">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <StepBadges stepId={step.id} languageName={languageName} />
      </div>

      <PromptCard
        variant="preview"
        eyebrow="Ask the client"
        prompt={step.client_prompt}
        onPlay={() => speakPrompt(step.audio_prompt_text ?? step.client_prompt)}
        speechAvailable={isSpeechAvailable()}
      />

      <p className="mt-3 text-sm opacity-80">
        <span className="font-bold opacity-100">Tester:</span> {step.tester_instruction}
      </p>

      <Disclosure label="Why this matters">{step.why_this_matters}</Disclosure>

      <div className="mt-5">
        <SectionDivider label="Manual entry" />
        <div className="mt-4 space-y-4">
          {entryFields}
          <TextAreaField
            label="Notes"
            value={manualFields.additional_notes}
            onChange={(event) => setManualFields({ ...manualFields, additional_notes: event.target.value })}
            placeholder="Optional"
            rows={2}
          />
        </div>
      </div>

      <PrimaryButton fullWidth className="mt-6" icon={<ChevronRight className="h-5 w-5" />} onClick={onContinue}>
        Continue to recording
      </PrimaryButton>
    </section>
  );
}
