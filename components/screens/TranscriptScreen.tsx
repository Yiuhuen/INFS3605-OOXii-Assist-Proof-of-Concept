"use client";

import { PencilLine, ShieldCheck } from "lucide-react";
import { InfoCard, PrimaryButton, StatusBadge } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

export function TranscriptScreen({
  clientId,
  rawTranscript,
  correctedTranscript,
  setCorrectedTranscript,
  isOnline,
  onNext,
  onBack
}: {
  clientId: string;
  rawTranscript: string;
  correctedTranscript: string;
  setCorrectedTranscript: (value: string) => void;
  isOnline: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <ScreenHeader title="Review transcript" subtitle={clientId} onBack={onBack} isOnline={isOnline} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Original transcript</p>
        <StatusBadge label="Preserved" tone="good" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
      </div>
      <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
        {rawTranscript || "No transcript captured yet."}
      </pre>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-field-muted">Corrected transcript</p>
        <StatusBadge label="Editable" tone="warn" icon={<PencilLine className="h-3.5 w-3.5" />} />
      </div>
      <textarea
        className="field-input mt-2 min-h-32"
        value={correctedTranscript}
        onChange={(event) => setCorrectedTranscript(event.target.value)}
      />

      <div className="mt-4">
        <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
          The original transcript is always preserved. The app will organise the corrected text into review fields.
        </InfoCard>
      </div>

      <PrimaryButton fullWidth className="mt-6" onClick={onNext}>
        Next
      </PrimaryButton>
    </section>
  );
}
