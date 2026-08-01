"use client";

import { useState } from "react";
import { BarChart3, DatabaseZap, Globe, PenLine, Play, RotateCcw, Settings, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { CheckboxCard, DangerButton, InfoCard, ListRow, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

type ConfirmKind = "reset" | "loadDemo" | "clearDemo" | null;

/**
 * Secondary tools live here, off the main workflow, so Home can stay a
 * single next-action screen. Grouped exactly as required: field tools the
 * tester uses often, review/reporting tools used between clients, and
 * admin-only tools (prompt editor, demo reset) kept out of the normal
 * tester's way.
 */
export function MoreScreen({
  isOnline,
  recordsNeedingQc,
  hasDemoRecords,
  showSttDiagnostics,
  onToggleSttDiagnostics,
  onLanguage,
  onDisplaySettings,
  onReplayTraining,
  onQc,
  onInsights,
  onExport,
  onAdmin,
  onResetDemoData,
  onLoadDemoData,
  onClearDemoData,
  onBack
}: {
  isOnline: boolean;
  recordsNeedingQc: number;
  /** True once at least one sample record (lib/demoRecords.ts) is currently saved — gates "Clear sample records". */
  hasDemoRecords: boolean;
  /** More → Admin tools → "Show STT diagnostics" — off by default so a normal demo run never shows the technical recording-screen diagnostics panel. */
  showSttDiagnostics: boolean;
  onToggleSttDiagnostics: (value: boolean) => void;
  onLanguage: () => void;
  onDisplaySettings: () => void;
  onReplayTraining: () => void;
  onQc: () => void;
  onInsights: () => void;
  onExport: () => void;
  onAdmin: () => void;
  /** Clears all saved local records/audio plus any in-progress client/recording/transcript/QC state — for rehearsing or re-recording a demo consistently. Does not touch login, language packs, or display settings. */
  onResetDemoData: () => void;
  /** Appends the 6-record sample dataset (lib/demoRecords.ts) without touching any real, tester-created records — safe to run repeatedly, replaces any previously-loaded sample dataset. */
  onLoadDemoData: () => void;
  /** Removes only synthetic demo records, leaving every real record untouched. */
  onClearDemoData: () => void;
  onBack: () => void;
}) {
  const [activeConfirm, setActiveConfirm] = useState<ConfirmKind>(null);

  return (
    <section>
      <ScreenHeader title="More" subtitle="Tools & settings" onBack={onBack} isOnline={isOnline} />

      <p className="mb-3 text-xs font-bold opacity-50">Field tools</p>
      <div className="mb-6 space-y-2">
        <ListRow icon={<Globe className="h-5 w-5" />} label="Language packs" onClick={onLanguage} />
        <ListRow icon={<Settings className="h-5 w-5" />} label="Display settings" onClick={onDisplaySettings} />
        <ListRow icon={<Play className="h-5 w-5" />} label="Replay training" onClick={onReplayTraining} />
      </div>

      <p className="mb-3 text-xs font-bold opacity-50">Review & reporting</p>
      <div className="mb-6 space-y-2">
        <ListRow icon={<ShieldCheck className="h-5 w-5" />} label="QC Review" badge={recordsNeedingQc || undefined} onClick={onQc} />
        <ListRow icon={<BarChart3 className="h-5 w-5" />} label="Insights" onClick={onInsights} />
        <ListRow icon={<UploadCloud className="h-5 w-5" />} label="Export records" onClick={onExport} />
      </div>

      <p className="mb-3 text-xs font-bold opacity-50">Admin tools</p>
      <div className="mb-2 space-y-2">
        <ListRow icon={<PenLine className="h-5 w-5" />} label="Prompt editor" onClick={onAdmin} />
        <ListRow
          icon={<DatabaseZap className="h-5 w-5" />}
          label="Load sample records"
          detail="Adds 6 sample records (one per demo case) for Insights/QC/Export previews — no personal data"
          onClick={() => setActiveConfirm("loadDemo")}
        />
        <ListRow
          icon={<Trash2 className="h-5 w-5" />}
          label="Clear sample records"
          detail={hasDemoRecords ? "Removes only the sample records — real records are kept" : "No sample records are currently loaded"}
          onClick={() => hasDemoRecords && setActiveConfirm("clearDemo")}
        />
        <ListRow icon={<RotateCcw className="h-5 w-5" />} label="Reset demo data" detail="For demo recording — clears ALL local records and current test" onClick={() => setActiveConfirm("reset")} />
        <div className="rounded-2xl border border-field-line bg-field-card p-3">
          <CheckboxCard
            checked={showSttDiagnostics}
            onToggle={() => onToggleSttDiagnostics(!showSttDiagnostics)}
            label="Show STT diagnostics"
          />
          <p className="mt-2 pl-8 text-xs opacity-60">
            Admin diagnostic tool — reveals a technical speech-recognition panel on the recording screen. Keep off for a normal demo.
          </p>
        </div>
      </div>

      {activeConfirm === "loadDemo" && (
        <div className="mt-3 space-y-3 rounded-2xl border border-field-line p-4">
          <InfoCard>
            This will add 6 sample records (marked demo_record) for presentation purposes. No personal data is included. Your real saved
            records, if any, are kept untouched.
          </InfoCard>
          <div className="flex gap-3">
            <SecondaryButton fullWidth onClick={() => setActiveConfirm(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              fullWidth
              onClick={() => {
                setActiveConfirm(null);
                onLoadDemoData();
              }}
            >
              Load demo data
            </PrimaryButton>
          </div>
        </div>
      )}

      {activeConfirm === "clearDemo" && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--danger)] p-4">
          <WarningCard>This removes only the sample records on this device. Real, tester-created records are kept. This cannot be undone.</WarningCard>
          <div className="flex gap-3">
            <SecondaryButton fullWidth onClick={() => setActiveConfirm(null)}>
              Cancel
            </SecondaryButton>
            <DangerButton
              fullWidth
              onClick={() => {
                setActiveConfirm(null);
                onClearDemoData();
              }}
            >
              Yes, clear demo data
            </DangerButton>
          </div>
        </div>
      )}

      {activeConfirm === "reset" && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--danger)] p-4">
          <WarningCard>
            This permanently deletes all saved local records and audio on this device (including any synthetic demo data),
            and clears the current in-progress client, recording, transcript, and QC state. Login, language packs, and
            display settings are kept. This cannot be undone.
          </WarningCard>
          <div className="flex gap-3">
            <SecondaryButton fullWidth onClick={() => setActiveConfirm(null)}>
              Cancel
            </SecondaryButton>
            <DangerButton
              fullWidth
              onClick={() => {
                setActiveConfirm(null);
                onResetDemoData();
              }}
            >
              Yes, reset demo data
            </DangerButton>
          </div>
        </div>
      )}
    </section>
  );
}
