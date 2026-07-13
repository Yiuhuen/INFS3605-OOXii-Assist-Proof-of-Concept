"use client";

import { Mic, RotateCcw, ShieldCheck } from "lucide-react";
import { generateClientId } from "@/lib/ids";
import type { ClientRecord } from "@/lib/types";
import { InfoCard, PrimaryButton, SelectField, TextAreaField } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

export function ClientScreen({
  client,
  setClient,
  isOnline,
  onBack,
  onContinue
}: {
  client: ClientRecord;
  setClient: (client: ClientRecord) => void;
  isOnline: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <section>
      <ScreenHeader title="New anonymous client" onBack={onBack} isOnline={isOnline} />

      <div className="field-card relative text-center">
        <button
          aria-label="Regenerate client ID"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-field-line bg-field-surface transition hover:bg-field-card"
          onClick={() => setClient({ ...client, id: generateClientId() })}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <p className="text-xs font-bold uppercase tracking-wide opacity-60">Client ID — auto-generated</p>
        <p className="mt-2 text-4xl font-black text-[var(--gold)]">{client.id}</p>
      </div>

      <div className="mt-4">
        <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
          <strong className="font-bold">Privacy:</strong> Do not enter name, date of birth, phone number, or address. Use
          anonymous ID only.
        </InfoCard>
      </div>

      <div className="mt-5 space-y-4">
        <SelectField label="Age band" value={client.age_band} onChange={(event) => setClient({ ...client, age_band: event.target.value })}>
          {["Under 18", "18–34", "35–44", "45–54", "55–64", "65+"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
        <SelectField label="Gender" value={client.gender} onChange={(event) => setClient({ ...client, gender: event.target.value })}>
          {["female", "male", "another / not specified"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
        <SelectField
          label="Cataract surgery history"
          value={client.cataract_history}
          onChange={(event) => setClient({ ...client, cataract_history: event.target.value as ClientRecord["cataract_history"] })}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
          <option value="unknown">Unknown</option>
        </SelectField>
        <SelectField
          label="Deployment site"
          value={client.location_site}
          onChange={(event) => setClient({ ...client, location_site: event.target.value })}
        >
          {["Site A", "Site B", "Site C", "Other"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
        <SelectField
          label="Currently has glasses?"
          value={client.currently_has_glasses}
          onChange={(event) => setClient({ ...client, currently_has_glasses: event.target.value as ClientRecord["currently_has_glasses"] })}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
          <option value="unknown">Unknown</option>
        </SelectField>
        <TextAreaField
          label="Tester note (optional)"
          value={client.tester_note}
          onChange={(event) => setClient({ ...client, tester_note: event.target.value })}
          placeholder="e.g. client was seated, ambient light was low"
          rows={3}
        />
      </div>

      <PrimaryButton fullWidth className="mt-6" icon={<Mic className="h-5 w-5" />} onClick={onContinue}>
        Start recording
      </PrimaryButton>
    </section>
  );
}
