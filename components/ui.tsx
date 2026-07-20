"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDown, Globe, Wifi, WifiOff } from "lucide-react";

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

export function MetricCard({ value, label, tone = "neutral" }: { value: string | number; label: string; tone?: "neutral" | "gold" | "danger" | "good" }) {
  const valueClass =
    tone === "gold" ? "text-[var(--gold)]" : tone === "danger" ? "text-[var(--danger)]" : tone === "good" ? "text-[var(--good)]" : "text-white";
  return (
    <div className="rounded-2xl border border-field-line bg-field-card px-3 py-4 text-center">
      <p className={`text-2xl font-black ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-field-muted">{label}</p>
    </div>
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
        <p className={`text-xs font-bold uppercase tracking-wide ${isActive ? "text-[var(--gold)]" : "text-field-muted"}`}>{eyebrow}</p>
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

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-field-line" />
      <span className="text-xs font-bold uppercase tracking-wide text-field-muted">{label}</span>
      <div className="h-px flex-1 bg-field-line" />
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
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      <textarea className="field-input" {...props} />
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
