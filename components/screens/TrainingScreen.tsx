"use client";

import { useState } from "react";
import { Globe, RefreshCw, ShieldCheck, Video } from "lucide-react";
import type { LanguagePack, Tester } from "@/lib/types";
import { CheckboxCard, PrimaryButton } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const reasons = [
  { icon: RefreshCw, text: "Complete records help replenish stock on time." },
  { icon: ShieldCheck, text: "Saved test data supports quality control." },
  { icon: Globe, text: "Local prompts help clients understand each step." }
];

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
      <ScreenHeader title="Training before first test" onBack={onBack} isOnline={isOnline} />

      <div className="ink-panel flex aspect-video items-center justify-center text-center">
        <div>
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-field-line text-field-muted">
            <Video className="h-7 w-7" />
          </div>
          <p className="font-bold">Tester guide · video not included in this PoC</p>
          <p className="mt-1 max-w-xs text-sm opacity-60">
            Read the summary below. A partner voice-over guide can be recorded in {activePack.name} for the live version.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {reasons.map(({ icon: Icon, text }) => (
          <div key={text} className="field-card flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--gold)]">
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <CheckboxCard
          checked={confirmed}
          onToggle={() => setConfirmed((value) => !value)}
          label="I have read the training summary and I am ready to test."
        />
      </div>

      <PrimaryButton fullWidth className="mt-6" disabled={!confirmed} onClick={onComplete}>
        Continue to Home
      </PrimaryButton>

      {!tester.is_new_tester && (
        <p className="mt-4 text-center text-sm opacity-60">This refresher is optional — you can return to Home from Settings any time.</p>
      )}
    </section>
  );
}
