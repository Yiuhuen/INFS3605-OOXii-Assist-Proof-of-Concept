"use client";

import { ArrowRight, Globe, LogOut, MoreHorizontal } from "lucide-react";
import type { LanguagePack, Tester } from "@/lib/types";
import type { NextAction } from "@/lib/workflow";
import { OfflineBadge, PrimaryButton, SecondaryButton, StatusBadge, WorkflowProgressRow } from "@/components/ui";
import { OneScreenShell, BottomActionBar } from "@/components/layout/OneScreenShell";
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
 * everything else. Fits one viewport by design (OneScreenShell) — the
 * primary CTA and More link live in the footer so they're always visible
 * without scrolling, no matter how tall the status row above them gets.
 */
export function Dashboard({
  tester,
  activePack,
  isOnline,
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
    <OneScreenShell
      header={
        <div className="flex items-center justify-between gap-3 pb-2">
          <BrandLogo size="small" />
          <button
            aria-label="Log out"
            onClick={onLogout}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-card transition hover:bg-field-surface"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          <p className="text-center text-xs opacity-70">{nextAction.subtitle}</p>
          <PrimaryButton fullWidth className="py-3 text-base" icon={<ArrowRight className="h-5 w-5" />} onClick={onNextAction}>
            {nextAction.label}
          </PrimaryButton>
          <SecondaryButton fullWidth className="py-2.5 text-sm" icon={<MoreHorizontal className="h-4 w-4" />} onClick={onMore}>
            More
          </SecondaryButton>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-center gap-5 overflow-y-auto">
        <div>
          <p className="text-sm opacity-70">{greeting}</p>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">{tester.name}</h1>
          <p className="mt-1 line-clamp-1 text-sm opacity-70">
            {sentenceCase(tester.role)} · {tester.home_base}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={activePack.name} tone="language" icon={<Globe className="h-3.5 w-3.5" />} />
          <OfflineBadge isOnline={isOnline} />
          {flaggedParts.length > 0 && (
            <StatusBadge label={flaggedParts.join(" · ")} tone={recordsNeedingQc > 0 ? "danger" : "warn"} />
          )}
        </div>

        <WorkflowProgressRow currentStep={nextAction.stepId} />
      </div>
    </OneScreenShell>
  );
}
