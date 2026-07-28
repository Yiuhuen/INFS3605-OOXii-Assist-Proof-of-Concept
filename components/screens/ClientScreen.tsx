"use client";

import { Mic, RotateCcw, ShieldCheck } from "lucide-react";
import { generateClientId } from "@/lib/ids";
import type { ClientRecord } from "@/lib/types";
import { Disclosure, PrimaryButton, SelectField, TextAreaField } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

/**
 * New test — deliberately light. Visible by default: the generated client
 * ID, site, language pack, tester label, and Start recording. Everything
 * optional (age band, gender, glasses, cataract history, tester note) lives
 * behind a collapsed disclosure so an experienced tester can start in one
 * tap.
 */
export function ClientScreen({
  client,
  setClient,
  languagePackName,
  testerLabel,
  isOnline,
  onBack,
  onContinue
}: {
  client: ClientRecord;
  setClient: (client: ClientRecord) => void;
  languagePackName: string;
  testerLabel: string;
  isOnline: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <OneScreenShell
      header={<CompactHeader title="New test" onBack={onBack} isOnline={isOnline} />}
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
            <p className="text-xs font-semibold opacity-60">Client ID</p>
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

        <div className="shrink-0">
          <SelectField
            label="Site / session"
            value={client.location_site}
            onChange={(event) => setClient({ ...client, location_site: event.target.value })}
          >
            {["Site A", "Site B", "Site C", "Other"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
          <dt className="opacity-60">Language pack</dt>
          <dd className="truncate text-right font-semibold">{languagePackName}</dd>
          <dt className="opacity-60">Tester</dt>
          <dd className="truncate text-right font-semibold">{testerLabel}</dd>
        </dl>

        <p className="flex shrink-0 items-center gap-1.5 line-clamp-1 text-xs opacity-70">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-field-muted" />
          Uses a generated client ID. No name, DOB, phone, address or GPS.
        </p>

        <div className="shrink-0">
          <Disclosure label="Optional details">
            <div className="grid grid-cols-2 content-start gap-3">
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
                label="Has glasses?"
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
          </Disclosure>
        </div>
      </div>
    </OneScreenShell>
  );
}
