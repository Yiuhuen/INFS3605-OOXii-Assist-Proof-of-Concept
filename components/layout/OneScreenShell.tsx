"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { OfflineBadge } from "@/components/ui";

/**
 * The one-screen workflow shell: header / flexible content / footer, sized
 * to exactly fill its parent (the screen-aware `<main>` in app/page.tsx sets
 * that parent to `h-[100dvh]`). The content row is `min-h-0 overflow-hidden`
 * on purpose — every workflow screen using this shell is responsible for
 * fitting its default content inside that row without scrolling; anything
 * that can't (full transcripts, full record lists, full field detail) goes
 * behind a `DetailModal` (components/ui.tsx) instead of growing this row.
 */
export function OneScreenShell({
  header,
  footer,
  children,
  className = ""
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // The explicit minmax(0,1fr) column matters: with the default implicit
    // column, a long nowrap/truncated header title contributes its full
    // untruncated width to the track's min-content, silently widening every
    // row past the viewport on narrow phones (observed at 320px). A
    // zero-min column lets rows shrink so truncate/min-w-0 chains actually
    // engage instead of the whole screen overflowing.
    // overflow-clip, not overflow-hidden: hidden boxes can still be scrolled
    // programmatically, and focusing a button inside the footer's -mx-4
    // edge-bleed (BottomActionBar) made the browser scroll-into-view the
    // whole shell 16px sideways — permanently shifting every screen. clip
    // forbids scrolling entirely; inner columns keep their own overflow-y.
    <div className={`grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-clip ${className}`}>
      <div className="min-w-0">{header}</div>
      <div className="min-h-0 min-w-0 overflow-hidden">{children}</div>
      {footer && <div className="min-w-0">{footer}</div>}
    </div>
  );
}

/**
 * Slim workflow header (~48-56px): back button, title/subtitle stack,
 * offline badge. Distinct from ScreenHeader (used by the non-workflow
 * screens that still scroll normally, e.g. Settings/Admin/Insights) — this
 * one is deliberately shorter since every px here is taken out of the
 * content row's fixed budget.
 */
export function CompactHeader({
  title,
  subtitle,
  onBack,
  isOnline,
  right
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  isOnline: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack && (
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-card transition hover:bg-field-surface"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          {subtitle && <p className="truncate text-[10px] font-bold uppercase tracking-wide text-field-muted">{subtitle}</p>}
          <h1 className="truncate text-base font-black leading-tight">{title}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {right}
        <OfflineBadge isOnline={isOnline} />
      </div>
    </div>
  );
}

/**
 * Compact footer action row — safe-area aware, sized for the OneScreenShell
 * grid footer row (no `position: sticky` needed since the shell itself is
 * the fixed-height container, not a scrolling page). Bleeds out to the
 * edges of the screen-aware `<main>` (which uses `px-4`) and pads itself
 * back in, so the row gets the full device width to lay out its buttons —
 * without this, a fixed-width secondary button (e.g. "Mark unclear") sharing
 * the row with a `fullWidth` primary button can be squeezed narrower than
 * its own text and wrap.
 */
export function BottomActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`-mx-4 flex items-center gap-2 border-t border-field-line px-4 pt-2 ${className}`}
      style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}
