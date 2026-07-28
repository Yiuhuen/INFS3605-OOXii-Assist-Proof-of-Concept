"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDown, ChevronRight, Globe, Wifi, WifiOff, X } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  fullWidth?: boolean;
};

export function PrimaryButton({ icon, fullWidth, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`${fullWidth ? "primary-button-lg" : "primary-button"} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function SecondaryButton({ icon, fullWidth, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`secondary-button ${fullWidth ? "w-full" : ""} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function RecordButton({ icon, fullWidth, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`record-button ${fullWidth ? "w-full" : ""} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function DangerButton({ icon, fullWidth, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`danger-button ${fullWidth ? "w-full" : ""} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

export type BadgeTone = "neutral" | "warn" | "good" | "danger" | "eyeRight" | "eyeLeft" | "language";

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: "status-pill",
  warn: "badge-warn",
  good: "badge-good",
  danger: "badge-danger",
  eyeRight: "badge-eye-right",
  eyeLeft: "badge-eye-left",
  language: "badge-language"
};

export function StatusBadge({ label, tone = "neutral", icon }: { label: string; tone?: BadgeTone; icon?: ReactNode }) {
  return (
    <span className={badgeToneClass[tone]}>
      {icon}
      {label}
    </span>
  );
}

export type StatusDotTone = "neutral" | "good" | "warn" | "danger" | "muted";

const statusDotToneClass: Record<StatusDotTone, string> = {
  neutral: "",
  good: "is-good",
  warn: "is-warn",
  danger: "is-danger",
  muted: "is-muted"
};

/**
 * Calm status indicator for workflow rows: a small coloured dot plus
 * sentence-case text — the default replacement for StatusBadge in
 * field/issue/status rows so screens read as a tool, not a badge wall.
 * One per row, closed vocabulary (Captured / Missing / Check / Edited /
 * Reviewed / Needs QC / Saved locally / Ready for export / Pending sync).
 */
export function StatusDot({ label, tone = "neutral", className = "" }: { label: string; tone?: StatusDotTone; className?: string }) {
  return <span className={`status-dot ${statusDotToneClass[tone]} ${className}`}>{label}</span>;
}

/** Fixed brand colours regardless of contrast theme: right eye = blue, left eye = light/white. Renders bare badges — wrap in a flex container. */
export function StepBadges({ stepId, languageName }: { stepId: string; languageName: string }) {
  return (
    <>
      {stepId === "right-distance" && (
        <StatusBadge label="Right eye" tone="eyeRight" icon={<span className="h-2 w-2 rounded-full bg-[var(--eye-right-dot)]" />} />
      )}
      {stepId === "left-distance" && (
        <StatusBadge label="Left eye" tone="eyeLeft" icon={<span className="h-2 w-2 rounded-full bg-[var(--eye-left-text)]" />} />
      )}
      <StatusBadge label={languageName} tone="language" icon={<Globe className="h-3.5 w-3.5" />} />
    </>
  );
}

export function OfflineBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <StatusBadge
      label={isOnline ? "Online" : "Offline"}
      tone={isOnline ? "good" : "warn"}
      icon={isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
    />
  );
}

export function ActionCard({ icon, label, badge, onClick }: { icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="action-card">
      {Boolean(badge) && <span className="action-card-badge">{badge}</span>}
      <span className="text-field-muted">{icon}</span>
      <span className="text-sm font-bold leading-snug">{label}</span>
    </button>
  );
}

export function PromptCard({
  eyebrow,
  prompt,
  englishGloss,
  icon,
  onPlay,
  speechAvailable,
  variant = "active"
}: {
  eyebrow: string;
  prompt: string;
  englishGloss?: string;
  /** Simple emoji shown next to the eyebrow, e.g. a step icon from the prompt data. */
  icon?: string;
  onPlay: () => void;
  speechAvailable: boolean;
  /** "active" = gold hero card for the recording screen; "preview" = subdued card for the guided-prompt screen. */
  variant?: "active" | "preview";
}) {
  const isActive = variant === "active";
  return (
    <div className={isActive ? "prompt-card" : "prompt-card-preview"}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-xl leading-none">{icon}</span>}
        <p className={`text-xs font-bold ${isActive ? "text-[var(--gold)]" : "text-field-muted"}`}>{eyebrow}</p>
      </div>
      <p className="mt-2 text-2xl font-black leading-snug">&ldquo;{prompt}&rdquo;</p>
      {englishGloss && (
        <>
          <div className="my-4 h-px bg-field-line" />
          <p className="text-sm opacity-70">English: &ldquo;{englishGloss}&rdquo;</p>
        </>
      )}
      {isActive ? (
        <PrimaryButton fullWidth className="mt-4" onClick={onPlay}>
          Play prompt aloud
        </PrimaryButton>
      ) : (
        <SecondaryButton fullWidth className="mt-4" onClick={onPlay}>
          Play prompt aloud
        </SecondaryButton>
      )}
      {speechAvailable ? (
        <p className="mt-2 text-sm opacity-60">Use this if you prefer the app to speak the instruction for the client.</p>
      ) : (
        <p className="mt-2 text-sm opacity-70">Audio playback is not available on this device. Please read the prompt aloud.</p>
      )}
    </div>
  );
}

/**
 * Collapsible transcript tab — the one shared pattern for "transcript is
 * supporting evidence, not the main workflow". Collapsed by default: title,
 * a one-line status subtitle ("3 lines captured" / "Listening…"), the latest
 * line as a 2-line preview, and a chevron. Expanded: the caller's content in
 * an internally-scrolling panel capped by maxHeightClass, plus an explicit
 * "Collapse transcript" button — the page around it never becomes a long
 * transcript scroll. Purely presentational: expansion state lives in the
 * caller and touches nothing else (recording, timer, STT, fields).
 */
export function TranscriptTab({
  title = "Transcript",
  subtitle,
  collapsedPreview,
  expanded,
  onToggle,
  maxHeightClass = "max-h-48",
  children
}: {
  title?: string;
  subtitle: string;
  /** Latest-line teaser shown while collapsed — keep to 1–2 clamped lines. */
  collapsedPreview?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Height cap for the expanded inner scroll area so the transcript never takes over the screen. */
  maxHeightClass?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-field-line bg-field-card">
      <button
        type="button"
        className="flex min-h-[2.75rem] w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse transcript" : "Expand transcript"}
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-snug">{title}</span>
          <span className="block truncate text-[11px] opacity-60">{subtitle}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
      </button>
      {!expanded && collapsedPreview && <div className="px-3 pb-2">{collapsedPreview}</div>}
      {expanded && (
        <div className="border-t border-field-line px-3 py-2">
          <div className={`${maxHeightClass} overflow-y-auto`}>{children}</div>
          <button
            type="button"
            className="mt-2 flex min-h-[2.25rem] w-full items-center justify-center gap-1 rounded-lg border border-field-line bg-field-surface text-xs font-bold transition hover:bg-field-card"
            onClick={onToggle}
          >
            Collapse transcript
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-field-line py-1">
      <button type="button" className="flex w-full items-center justify-between py-2 text-left text-sm font-semibold" onClick={() => setOpen((value) => !value)}>
        {label}
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3 text-sm opacity-80">{children}</div>}
    </div>
  );
}

export function FormField({
  label,
  className = "",
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      <input className="field-input" {...props} />
    </label>
  );
}

export function SelectField({
  label,
  className = "",
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      <select className="field-input" {...props}>
        {children}
      </select>
    </label>
  );
}

export function TextAreaField({
  label,
  className = "",
  hideLabel = false,
  ...props
}: { label: string; hideLabel?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block ${className}`}>
      {!hideLabel && <span className="field-label">{label}</span>}
      <textarea className="field-input" aria-label={hideLabel ? label : undefined} {...props} />
    </label>
  );
}

export function ProgressBar({ steps, current }: { steps: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: steps }).map((_, index) => (
        <div key={index} className="progress-track">
          <div className="progress-fill" style={{ width: index <= current ? "100%" : "0%" }} />
        </div>
      ))}
    </div>
  );
}

export function CheckboxCard({
  checked,
  onToggle,
  label
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button type="button" className="checkbox-card w-full" onClick={onToggle}>
      <span className={`checkbox-box ${checked ? "is-checked" : ""}`}>{checked && "✓"}</span>
      <span className="text-sm font-semibold leading-snug">{label}</span>
    </button>
  );
}

/** Generic fixed-overlay confirmation dialog — stacked full-width buttons so the confirm label never has to shrink/wrap on a narrow phone screen. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-field-line bg-field-card p-4 shadow-xl">
        <p className="text-base font-black">{title}</p>
        <p className="mt-2 text-sm opacity-80">{body}</p>
        <div className="mt-4 space-y-2">
          <SecondaryButton fullWidth onClick={onCancel}>
            {cancelLabel}
          </SecondaryButton>
          <DangerButton fullWidth onClick={onConfirm}>
            {confirmLabel}
          </DangerButton>
        </div>
      </div>
    </div>
  );
}

/**
 * The one legitimate place a one-screen workflow screen is allowed to
 * scroll: a full-detail expand (full transcript, full record list, full
 * field evidence) that the default collapsed view only shows a preview or
 * count of. Closed by default; opening it never affects the page behind it,
 * since it's a fixed overlay with its own internal `overflow-y-auto`.
 */
export function DetailModal({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-field-line bg-field-card shadow-xl sm:max-w-lg">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-field-line px-4 py-3">
          <p className="text-base font-black">{title}</p>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-field-line bg-field-surface transition hover:bg-field-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function WarningCard({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="warning-card">
      {icon}
      <p>{children}</p>
    </div>
  );
}

export function InfoCard({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="info-card">
      {icon}
      <p>{children}</p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-field-line p-6 text-center">
      <p className="font-bold">{title}</p>
      {detail && <p className="mt-1 text-sm opacity-70">{detail}</p>}
    </div>
  );
}

/** Full-width compact list row for secondary screens (e.g. the More screen) — icon, label, optional badge/detail, chevron. Deliberately not a grid of cards. */
export function ListRow({
  icon,
  label,
  detail,
  badge,
  onClick
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-field-line bg-field-card px-4 py-3.5 text-left transition hover:bg-field-surface"
    >
      <span className="text-field-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug">{label}</span>
        {detail && <span className="block text-xs opacity-60">{detail}</span>}
      </span>
      {Boolean(badge) && (
        <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: "var(--record)" }}>
          {badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-field-muted" />
    </button>
  );
}
