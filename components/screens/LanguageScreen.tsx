"use client";

import type { LanguageCode, LanguagePack } from "@/lib/types";
import { PrimaryButton } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

export function LanguageScreen({
  packs,
  selectedCode,
  isOnline,
  onSelect,
  onContinue,
  onBack
}: {
  packs: LanguagePack[];
  selectedCode: LanguageCode;
  isOnline: boolean;
  onSelect: (code: LanguageCode) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <ScreenHeader title="Select language pack" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Prompts and audio will show in this language. English is always available offline.</p>
      <div className="space-y-3">
        {packs.map((pack) => (
          <button
            key={pack.code}
            className={`w-full rounded-2xl border p-5 text-left transition ${
              selectedCode === pack.code ? "border-[var(--gold)] bg-field-card" : "border-field-line bg-field-surface hover:bg-field-card"
            }`}
            onClick={() => onSelect(pack.code)}
          >
            <p className="text-lg font-black">{pack.name}</p>
            <p className="mt-1 text-sm opacity-70">
              {pack.downloaded ? "Downloaded for offline use" : isOnline ? "Tap to download" : "Needs internet, English fallback available"}
            </p>
          </button>
        ))}
      </div>
      <PrimaryButton fullWidth className="mt-6" onClick={onContinue}>
        Continue
      </PrimaryButton>
    </section>
  );
}
