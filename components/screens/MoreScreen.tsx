"use client";

import { BarChart3, Globe, PenLine, Play, Settings, ShieldCheck, UploadCloud } from "lucide-react";
import { ListRow } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

/**
 * Secondary tools live here, off the main workflow, so Home can stay a
 * single next-action screen. Grouped exactly as required: field tools the
 * tester uses often, review/reporting tools used between clients, and
 * admin-only tools (prompt editor) kept out of the normal tester's way.
 */
export function MoreScreen({
  isOnline,
  recordsNeedingQc,
  onLanguage,
  onDisplaySettings,
  onReplayTraining,
  onQc,
  onInsights,
  onExport,
  onAdmin,
  onBack
}: {
  isOnline: boolean;
  recordsNeedingQc: number;
  onLanguage: () => void;
  onDisplaySettings: () => void;
  onReplayTraining: () => void;
  onQc: () => void;
  onInsights: () => void;
  onExport: () => void;
  onAdmin: () => void;
  onBack: () => void;
}) {
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
      </div>
    </section>
  );
}
