"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import { brightnessLabels, contrastLabels, speechSpeedLabels, type Brightness, type ContrastTheme, type DisplaySettings } from "@/lib/settings";
import type { ConnectionMode, LanguagePack, Tester } from "@/lib/types";
import { DangerButton, FormField, InfoCard, PrimaryButton, PromptCard, SelectField, StatusBadge } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechSupported, type SpeechSpeed } from "@/lib/speech";

const brightnessOptions: Array<{ value: Brightness; label: string }> = [
  { value: "low", label: brightnessLabels.low },
  { value: "medium", label: brightnessLabels.medium },
  { value: "high", label: brightnessLabels.high }
];

const contrastOptions: Array<{ value: ContrastTheme; label: string; detail: string }> = [
  { value: "standard", label: contrastLabels.standard, detail: "Default dark purple field theme" },
  { value: "high-contrast", label: contrastLabels["high-contrast"], detail: "Brighter borders and text for strong sunlight" },
  { value: "warm", label: contrastLabels.warm, detail: "Warm dark tones, softer on the eyes at dusk" }
];

const speechSpeedOptions: Array<{ value: SpeechSpeed; label: string }> = [
  { value: "slow", label: speechSpeedLabels.slow },
  { value: "normal", label: speechSpeedLabels.normal },
  { value: "faster", label: speechSpeedLabels.faster }
];

export function SettingsScreen({
  settings,
  onChange,
  tester,
  onTesterChange,
  languagePacks,
  connectionMode,
  onConnectionModeChange,
  isOnline,
  onLanguage,
  onLogout,
  onBack
}: {
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
  tester: Tester;
  onTesterChange: (tester: Tester) => void;
  languagePacks: LanguagePack[];
  connectionMode: ConnectionMode;
  onConnectionModeChange: (mode: ConnectionMode) => void;
  isOnline: boolean;
  onLanguage: () => void;
  onLogout: () => void;
  onBack: () => void;
}) {
  const preferredLanguageName = languagePacks.find((pack) => pack.code === tester.preferred_language)?.name ?? tester.preferred_language;
  return (
    <section>
      <ScreenHeader title="Display settings" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Adjust for field lighting conditions. The app always stays dark and low-glare.</p>

      <div className="mb-6">
        <p className="field-label">Brightness</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {brightnessOptions.map((option) => (
            <button
              key={option.value}
              className={`${option.value === settings.brightness ? "primary-button" : "secondary-button"} px-2 text-sm sm:px-5 sm:text-base`}
              onClick={() => onChange({ ...settings, brightness: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className="field-label">Theme contrast</p>
        <div className="space-y-3">
          {contrastOptions.map((option) => (
            <button
              key={option.value}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                option.value === settings.contrast ? "border-[var(--gold)] bg-field-card" : "border-field-line bg-field-surface hover:bg-field-card"
              }`}
              onClick={() => onChange({ ...settings, contrast: option.value })}
            >
              <p className="font-bold">{option.label}</p>
              <p className="mt-1 text-sm opacity-70">{option.detail}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className="field-label">Speech speed</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {speechSpeedOptions.map((option) => (
            <button
              key={option.value}
              className={`${option.value === settings.speechSpeed ? "primary-button" : "secondary-button"} px-2 text-sm sm:px-5 sm:text-base`}
              onClick={() => onChange({ ...settings, speechSpeed: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-60">Controls how slowly &ldquo;Play aloud&rdquo; speaks client prompts. Normal is still slower than the browser default.</p>
      </div>

      <div className="mb-6">
        <p className="field-label">Preview</p>
        <PromptCard eyebrow="Ask the client — say this aloud" prompt="Cover your left eye and read the smallest line you can see." onPlay={() => {}} speechAvailable={isSpeechSupported()} />
      </div>

      <p className="text-xs opacity-50">Changes apply immediately and are saved on this device.</p>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-bold">Tester profile</p>
          <StatusBadge label={tester.id} tone="neutral" />
        </div>
        <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
          Tester profile saved on this device — offline field use works without signing in again.
          {tester.last_active_at && ` Last active ${new Date(tester.last_active_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`}
        </InfoCard>

        <FormField label="Name" value={tester.name} onChange={(event) => onTesterChange({ ...tester, name: event.target.value })} />
        <FormField label="Role" value={tester.role} onChange={(event) => onTesterChange({ ...tester, role: event.target.value })} />
        <SelectField
          label="Experience level"
          value={tester.experience_level}
          onChange={(event) => onTesterChange({ ...tester, experience_level: event.target.value as Tester["experience_level"] })}
        >
          <option value="beginner">Beginner</option>
          <option value="experienced">Experienced</option>
          <option value="trainer">Trainer</option>
        </SelectField>
        <FormField
          label="Home base / deployment site"
          value={tester.home_base}
          onChange={(event) => onTesterChange({ ...tester, home_base: event.target.value })}
        />
        <SelectField
          label="Instruction mode"
          value={tester.instruction_mode}
          onChange={(event) => onTesterChange({ ...tester, instruction_mode: event.target.value as Tester["instruction_mode"] })}
        >
          <option value="beginner">Beginner — more guidance</option>
          <option value="concise">Concise — less hand-holding</option>
        </SelectField>
        <div>
          <p className="field-label">Preferred language</p>
          <button
            className="flex w-full items-center justify-between rounded-2xl border border-field-line bg-field-surface px-4 py-3 text-left transition hover:bg-field-card"
            onClick={onLanguage}
          >
            <span className="text-sm font-semibold">{preferredLanguageName}</span>
            <span className="text-xs font-bold text-[var(--gold)]">Change language</span>
          </button>
        </div>
      </div>

      <div className="mt-8">
        <SelectField
          label="Demo connection mode"
          value={connectionMode}
          onChange={(event) => onConnectionModeChange(event.target.value as ConnectionMode)}
        >
          <option value="browser">Follow browser status</option>
          <option value="force-online">Force online</option>
          <option value="force-offline">Force offline</option>
        </SelectField>
        <p className="mt-1 text-xs opacity-50">Used to demonstrate offline-first behaviour without disconnecting your device.</p>
      </div>

      <PrimaryButton fullWidth className="mt-8" onClick={onBack}>
        Done
      </PrimaryButton>

      <DangerButton fullWidth className="mt-4" icon={<LogOut className="h-5 w-5" />} onClick={onLogout}>
        Log out
      </DangerButton>
      <p className="mt-2 text-center text-xs opacity-50">
        Logging out only signs you out on this device — your tester profile stays saved and is reused next time you continue as demo tester.
      </p>
    </section>
  );
}
