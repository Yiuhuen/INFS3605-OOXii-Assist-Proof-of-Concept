"use client";

import { BarChart3, Globe, LogOut, Mic, PenLine, Play, Settings, ShieldCheck, UploadCloud, UserPlus } from "lucide-react";
import type { LanguagePack, Tester, TestRecord } from "@/lib/types";
import type { InsightTargetPage } from "@/lib/insights";
import { recordNeedsQc } from "@/lib/qc";
import { contrastLabels, type DisplaySettings } from "@/lib/settings";
import { ActionCard, MetricCard, OfflineBadge, PrimaryButton, StatusBadge } from "@/components/ui";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ActionableInsightsPreview } from "@/components/screens/InsightsScreen";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Dashboard({
  tester,
  records,
  activePack,
  isOnline,
  displaySettings,
  hasDraftClient,
  onStartRecording,
  onNewClient,
  onQc,
  onExport,
  onInsights,
  onInsightNavigate,
  onLanguage,
  onSettings,
  onAdmin,
  onTraining,
  onLogout
}: {
  tester: Tester;
  records: TestRecord[];
  activePack: LanguagePack;
  isOnline: boolean;
  displaySettings: DisplaySettings;
  hasDraftClient: boolean;
  onStartRecording: () => void;
  onNewClient: () => void;
  onQc: () => void;
  onExport: () => void;
  onInsights: () => void;
  onInsightNavigate: (target: InsightTargetPage) => void;
  onLanguage: () => void;
  onSettings: () => void;
  onAdmin: () => void;
  onTraining: () => void;
  onLogout: () => void;
}) {
  const pending = records.filter((record) => record.sync_status === "Pending sync").length;
  const needsQc = records.filter(recordNeedsQc).length;
  const greeting = greetingForHour(new Date().getHours());

  return (
    <section>
      <BrandLogo size="small" className="mb-4" />

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm opacity-70">{greeting}</p>
          <h1 className="text-3xl font-black leading-tight">{tester.name}</h1>
          <p className="mt-1 text-sm opacity-70">
            {sentenceCase(tester.role)} · {tester.home_base}
          </p>
        </div>
        <button
          aria-label="Log out"
          onClick={onLogout}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-card transition hover:bg-field-surface"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge label={activePack.name} tone="language" icon={<Globe className="h-3.5 w-3.5" />} />
        <OfflineBadge isOnline={isOnline} />
        <StatusBadge label={contrastLabels[displaySettings.contrast]} tone="neutral" icon={<Settings className="h-3.5 w-3.5" />} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <MetricCard value={pending} label="Pending sync" tone="gold" />
        <MetricCard value={needsQc} label="Needs QC" tone="danger" />
        <MetricCard value={records.length} label="Total records" />
      </div>

      <PrimaryButton fullWidth icon={<Mic className="h-5 w-5" />} onClick={onStartRecording}>
        {hasDraftClient ? "Continue test recording" : "Start test recording"}
      </PrimaryButton>

      <div className="mt-6">
        <ActionableInsightsPreview records={records} onNavigate={onInsightNavigate} onSeeAll={onInsights} />
      </div>

      <p className="mb-6 mt-6 text-xs font-bold uppercase tracking-wide opacity-50">More options</p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <ActionCard icon={<UserPlus className="h-5 w-5" />} label="New anonymous client" onClick={onNewClient} />
        <ActionCard icon={<ShieldCheck className="h-5 w-5" />} label="QC Review" badge={needsQc || undefined} onClick={onQc} />
        <ActionCard icon={<UploadCloud className="h-5 w-5" />} label="Export records" onClick={onExport} />
        <ActionCard icon={<BarChart3 className="h-5 w-5" />} label="Insights" onClick={onInsights} />
        <ActionCard icon={<Globe className="h-5 w-5" />} label="Language packs" onClick={onLanguage} />
        <ActionCard icon={<Settings className="h-5 w-5" />} label="Display settings" onClick={onSettings} />
        <ActionCard icon={<PenLine className="h-5 w-5" />} label="Prompt editor" onClick={onAdmin} />
      </div>

      <div className="field-card">
        <p className="font-bold">QC Review</p>
        <p className="mt-1 text-sm opacity-70">
          Check records with missing, edited, low-confidence, recording issue, or pending sync flags before export.
        </p>
      </div>

      <button className="mt-6 w-full text-center text-sm underline opacity-60 hover:opacity-100" onClick={onTraining}>
        <Play className="mr-1 inline h-3.5 w-3.5" />
        Replay training
      </button>
    </section>
  );
}
