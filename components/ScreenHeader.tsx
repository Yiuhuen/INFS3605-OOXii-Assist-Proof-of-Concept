"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { OfflineBadge } from "@/components/ui";

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  isOnline,
  right,
  dense
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  isOnline: boolean;
  right?: ReactNode;
  /** Tighter header for screens that need every pixel (e.g. Recording) — mb-3 instead of mb-6. */
  dense?: boolean;
}) {
  return (
    <div className={`${dense ? "mb-3" : "mb-6"} flex items-center justify-between gap-3`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onBack && (
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-card transition hover:bg-field-surface"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          {subtitle && <p className="truncate text-xs font-bold text-field-muted">{subtitle}</p>}
          <h1 className="text-lg font-black leading-tight">{title}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <OfflineBadge isOnline={isOnline} />
      </div>
    </div>
  );
}
