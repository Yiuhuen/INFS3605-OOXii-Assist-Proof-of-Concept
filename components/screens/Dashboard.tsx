"use client";

import { ArrowRight, GraduationCap, LogOut, MoreHorizontal, ShieldCheck, Settings, UploadCloud } from "lucide-react";
import type { LanguagePack } from "@/lib/types";
import type { NextAction } from "@/lib/workflow";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { OneScreenShell, BottomActionBar } from "@/components/layout/OneScreenShell";
import { BrandLogo } from "@/components/ui/BrandLogo";

/**
 * Home — a field tool's front door, not a dashboard. App name, one compact
 * status row (saved / needs QC / pending sync), the primary next action, and
 * the four secondary tools a tester reaches for between clients. An
 * experienced tester reaches recording in two taps: Start new test → Start
 * recording.
 */
export function Dashboard({
  activePack,
  isOnline,
  nextAction,
  savedRecords,
  recordsNeedingQc,
  recordsPendingSync,
  onNextAction,
  onMore,
  onLogout,
  onQc,
  onExport,
  onTrainingRefresh,
  onSettings
}: {
  activePack: LanguagePack;
  isOnline: boolean;
  nextAction: NextAction;
  savedRecords: number;
  recordsNeedingQc: number;
  recordsPendingSync: number;
  onNextAction: () => void;
  onMore: () => void;
  onLogout: () => void;
  onQc: () => void;
  onExport: () => void;
  onTrainingRefresh: () => void;
  onSettings: () => void;
}) {
  const statusParts = [
    `${savedRecords} saved record${savedRecords === 1 ? "" : "s"}`,
    `${recordsNeedingQc} need${recordsNeedingQc === 1 ? "s" : ""} QC`,
    `${recordsPendingSync} pending sync`
  ];

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
          <PrimaryButton fullWidth className="py-3 text-base" icon={<ArrowRight className="h-5 w-5" />} onClick={onNextAction}>
            {nextAction.label}
          </PrimaryButton>
          <SecondaryButton fullWidth className="py-2.5 text-sm" icon={<MoreHorizontal className="h-4 w-4" />} onClick={onMore}>
            More
          </SecondaryButton>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-center gap-4 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">OOXii Assist</h1>
          <p className="mt-1 text-sm opacity-70">
            {activePack.name} · {isOnline ? "Online" : "Offline — saves locally"}
          </p>
        </div>

        {/* One compact status row — counts only, no chips. */}
        <div className="rounded-xl border border-field-line bg-field-card px-3 py-2.5 text-sm">
          <span className={recordsNeedingQc > 0 ? "font-semibold" : ""}>{statusParts.join(" · ")}</span>
        </div>

        {/* Secondary actions — the four things a tester reaches for between
            clients, one tap from Home. Everything else (language packs,
            display settings, prompt editor, demo data) stays behind More. */}
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" className="chip-button flex-col gap-1 px-1.5 py-2 text-center" onClick={onQc}>
            <span className="relative">
              <ShieldCheck className="h-4 w-4" />
              {recordsNeedingQc > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                  style={{ background: "var(--record)" }}
                >
                  {recordsNeedingQc}
                </span>
              )}
            </span>
            <span className="text-[10px] font-bold leading-none">QC</span>
          </button>
          <button type="button" className="chip-button flex-col gap-1 px-1.5 py-2 text-center" onClick={onExport}>
            <UploadCloud className="h-4 w-4" />
            <span className="text-[10px] font-bold leading-none">Export</span>
          </button>
          <button type="button" className="chip-button flex-col gap-1 px-1.5 py-2 text-center" onClick={onTrainingRefresh}>
            <GraduationCap className="h-4 w-4" />
            <span className="text-[10px] font-bold leading-none">Training</span>
          </button>
          <button type="button" className="chip-button flex-col gap-1 px-1.5 py-2 text-center" onClick={onSettings}>
            <Settings className="h-4 w-4" />
            <span className="text-[10px] font-bold leading-none">Settings</span>
          </button>
        </div>
      </div>
    </OneScreenShell>
  );
}
