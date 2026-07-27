"use client";

import { Mic, RotateCcw, ShieldCheck } from "lucide-react";
import { generateClientId } from "@/lib/ids";
import type { ClientRecord } from "@/lib/types";
import { PrimaryButton, SelectField, TextAreaField } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

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
    <OneScreenShell
      header={<CompactHeader title="New client" onBack={onBack} isOnline={isOnline} />}
      footer={
        <BottomActionBar>
          <PrimaryButton fullWidth className="py-2.5 text-base" icon={<Mic className="h-5 w-5" />} onClick={onContinue}>
            Start recording
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="field-card-soft flex shrink-0 items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">Client ID — auto-generated</p>
            <p className="truncate text-xl font-black text-[var(--gold)]">{client.id}</p>
          </div>
          <button
            aria-label="Regenerate client ID"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-surface transition hover:bg-field-card"
            onClick={() => setClient({ ...client, id: generateClientId() })}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <p className="flex shrink-0 items-center gap-1.5 line-clamp-1 text-xs opacity-70">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-field-muted" />
          <strong className="font-bold">Privacy:</strong> anonymous ID only — no name, DOB, phone, or address.
        </p>

        {/* shrink-0, not flex-1 + overflow-hidden: on a very short viewport the
            content column's fallback scroll keeps the last field reachable
            instead of clipping it. */}
        <div className="grid shrink-0 grid-cols-2 content-start gap-3">
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
            label="Cataract surgery"
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
            label="Has glasses?"
            className="col-span-2"
            value={client.currently_has_glasses}
            onChange={(event) => setClient({ ...client, currently_has_glasses: event.target.value as ClientRecord["currently_has_glasses"] })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="unknown">Unknown</option>
          </SelectField>
          <TextAreaField
            label="Tester note (optional)"
            className="col-span-2"
            value={client.tester_note}
            onChange={(event) => setClient({ ...client, tester_note: event.target.value })}
            placeholder="e.g. client was seated, ambient light was low"
            rows={2}
          />
        </div>
      </div>
    </OneScreenShell>
  );
}
