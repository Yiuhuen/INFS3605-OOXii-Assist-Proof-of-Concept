"use client";

import { ArrowRight, Globe, LogOut, MoreHorizontal, Settings } from "lucide-react";
import type { LanguagePack, Tester } from "@/lib/types";
import type { NextAction } from "@/lib/workflow";
import { contrastLabels, type DisplaySettings } from "@/lib/settings";
import { OfflineBadge, PrimaryButton, SecondaryButton, StatusBadge, WorkflowProgressRow } from "@/components/ui";
import { BrandLogo } from "@/components/ui/BrandLogo";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Home screen — a single "what's next" view, not a dashboard. Everything
 * here renders from one NextAction (see lib/workflow.ts) so the tester
 * always sees exactly one primary step, plus a small "More" link for
 * everything else.
 */
export function Dashboard({
  tester,
  activePack,
  isOnline,
  displaySettings,
  nextAction,
  recordsNeedingQc,
  recordsPendingSync,
  onNextAction,
  onMore,
  onLogout
}: {
  tester: Tester;
  activePack: LanguagePack;
  isOnline: boolean;
  displaySettings: DisplaySettings;
  nextAction: NextAction;
  recordsNeedingQc: number;
  recordsPendingSync: number;
  onNextAction: () => void;
  onMore: () => void;
  onLogout: () => void;
}) {
  const greeting = greetingForHour(new Date().getHours());
  const flaggedParts = [
    recordsNeedingQc > 0 ? `${recordsNeedingQc} need${recordsNeedingQc === 1 ? "s" : ""} QC` : "",
    recordsPendingSync > 0 ? `${recordsPendingSync} pending sync` : ""
  ].filter(Boolean);

  return (
    <section className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="mb-8 flex items-start justify-between gap-3">
        <BrandLogo size="small" />
        <button
          aria-label="Log out"
          onClick={onLogout}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-card transition hover:bg-field-surface"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6">
        <p className="text-sm opacity-70">{greeting}</p>
        <h1 className="text-3xl font-black leading-tight">{tester.name}</h1>
        <p className="mt-1 text-sm opacity-70">
          {sentenceCase(tester.role)} · {tester.home_base}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge label={activePack.name} tone="language" icon={<Globe className="h-3.5 w-3.5" />} />
        <OfflineBadge isOnline={isOnline} />
        {flaggedParts.length > 0 && (
          <StatusBadge label={flaggedParts.join(" · ")} tone={recordsNeedingQc > 0 ? "danger" : "warn"} />
        )}
      </div>

      <div className="mb-8">
        <WorkflowProgressRow currentStep={nextAction.stepId} />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <p className="mb-2 text-center text-sm opacity-70">{nextAction.subtitle}</p>
        <PrimaryButton fullWidth icon={<ArrowRight className="h-5 w-5" />} onClick={onNextAction}>
          {nextAction.label}
        </PrimaryButton>
      </div>

      <div className="mt-8 space-y-3">
        <SecondaryButton fullWidth icon={<MoreHorizontal className="h-4 w-4" />} onClick={onMore}>
          More
        </SecondaryButton>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs opacity-50">
          <Settings className="h-3 w-3" />
          Display: {contrastLabels[displaySettings.contrast]}
        </p>
      </div>
    </section>
  );
}
