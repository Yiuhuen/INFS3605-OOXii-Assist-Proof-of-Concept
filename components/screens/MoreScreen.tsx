"use client";

import { useState } from "react";
import { BarChart3, Globe, PenLine, Play, RotateCcw, Settings, ShieldCheck, UploadCloud } from "lucide-react";
import { CheckboxCard, DangerButton, ListRow, SecondaryButton, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

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
  onBack
}: {
  isOnline: boolean;
  recordsNeedingQc: number;
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
  onBack: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <section>
      <ScreenHeader title="More" subtitle="Tools & settings" onBack={onBack} isOnline={isOnline} />

      <p className="mb-3 text-xs font-bold uppercase tracking-wide opacity-50">Field tools</p>
      <div className="mb-6 space-y-2">
        <ListRow icon={<Globe className="h-5 w-5" />} label="Language packs" onClick={onLanguage} />
        <ListRow icon={<Settings className="h-5 w-5" />} label="Display settings" onClick={onDisplaySettings} />
        <ListRow icon={<Play className="h-5 w-5" />} label="Replay training" onClick={onReplayTraining} />
      </div>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide opacity-50">Review & reporting</p>
      <div className="mb-6 space-y-2">
        <ListRow icon={<ShieldCheck className="h-5 w-5" />} label="QC Review" badge={recordsNeedingQc || undefined} onClick={onQc} />
        <ListRow icon={<BarChart3 className="h-5 w-5" />} label="Insights" onClick={onInsights} />
        <ListRow icon={<UploadCloud className="h-5 w-5" />} label="Export records" onClick={onExport} />
      </div>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide opacity-50">Admin tools</p>
      <div className="mb-2 space-y-2">
        <ListRow icon={<PenLine className="h-5 w-5" />} label="Prompt editor" onClick={onAdmin} />
        <ListRow icon={<RotateCcw className="h-5 w-5" />} label="Reset demo data" detail="For demo recording — clears local records and current test" onClick={() => setConfirmingReset(true)} />
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

      {confirmingReset && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--danger)] p-4">
          <WarningCard>
            This permanently deletes all saved local records and audio on this device, and clears the current in-progress
            client, recording, transcript, and QC state. Login, language packs, and display settings are kept. This cannot
            be undone.
          </WarningCard>
          <div className="flex gap-3">
            <SecondaryButton fullWidth onClick={() => setConfirmingReset(false)}>
              Cancel
            </SecondaryButton>
            <DangerButton
              fullWidth
              onClick={() => {
                setConfirmingReset(false);
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
