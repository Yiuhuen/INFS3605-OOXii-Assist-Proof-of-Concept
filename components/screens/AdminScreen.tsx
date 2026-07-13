"use client";

import { useEffect, useState } from "react";
import type { LanguageCode, LanguagePack, PromptStep } from "@/lib/types";
import { PrimaryButton, PromptCard, SelectField, StatusBadge, TextAreaField } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechAvailable } from "@/lib/speech";

export function AdminScreen({
  packs,
  setPacks,
  isOnline,
  onBack
}: {
  packs: LanguagePack[];
  setPacks: (packs: LanguagePack[]) => void;
  isOnline: boolean;
  onBack: () => void;
}) {
  const [selectedCode, setSelectedCode] = useState<LanguageCode>(packs[0]?.code ?? "en");
  const pack = packs.find((item) => item.code === selectedCode) ?? packs[0];
  const [selectedStepId, setSelectedStepId] = useState(pack?.prompts_json[0]?.id ?? "");
  const step = pack?.prompts_json.find((item) => item.id === selectedStepId) ?? pack?.prompts_json[0];

  const [draft, setDraft] = useState<PromptStep | null>(step ?? null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(step ?? null);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCode, selectedStepId]);

  function saveDraft() {
    if (!draft || !pack) return;
    setPacks(
      packs.map((item) =>
        item.code !== pack.code ? item : { ...item, prompts_json: item.prompts_json.map((s) => (s.id === draft.id ? draft : s)) }
      )
    );
    setSaved(true);
  }

  return (
    <section>
      <ScreenHeader title="Prompt editor" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Prompt text can be edited without changing the clinical flow or rebuilding the app.</p>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Language"
          value={selectedCode}
          onChange={(event) => {
            setSelectedCode(event.target.value as LanguageCode);
            const nextPack = packs.find((item) => item.code === event.target.value);
            setSelectedStepId(nextPack?.prompts_json[0]?.id ?? "");
          }}
        >
          {packs.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Step" value={selectedStepId} onChange={(event) => setSelectedStepId(event.target.value)}>
          {pack?.prompts_json.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </SelectField>
      </div>

      {draft && (
        <div className="space-y-4">
          <TextAreaField
            label="Tester instruction"
            value={draft.tester_instruction}
            onChange={(event) => setDraft({ ...draft, tester_instruction: event.target.value })}
            rows={3}
          />
          <TextAreaField
            label="Client-facing prompt (on-screen)"
            value={draft.client_prompt}
            onChange={(event) => setDraft({ ...draft, client_prompt: event.target.value })}
            rows={3}
          />
          <TextAreaField
            label="Audio prompt text (spoken aloud — can differ from on-screen text)"
            value={draft.audio_prompt_text ?? draft.client_prompt}
            onChange={(event) => setDraft({ ...draft, audio_prompt_text: event.target.value })}
            rows={3}
          />
          <TextAreaField
            label="Why this matters"
            value={draft.why_this_matters}
            onChange={(event) => setDraft({ ...draft, why_this_matters: event.target.value })}
            rows={2}
          />

          <div>
            <p className="field-label">Preview</p>
            <PromptCard
              eyebrow="Ask the client — say this aloud"
              prompt={draft.client_prompt}
              onPlay={() => {}}
              speechAvailable={isSpeechAvailable()}
            />
          </div>

          <div className="flex items-center gap-3">
            <PrimaryButton onClick={saveDraft}>Save prompt</PrimaryButton>
            {saved && <StatusBadge label="Saved locally" tone="good" />}
          </div>
        </div>
      )}
    </section>
  );
}
