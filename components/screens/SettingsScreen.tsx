"use client";

import { LogOut } from "lucide-react";
import { brightnessLabels, contrastLabels, type Brightness, type ContrastTheme, type DisplaySettings } from "@/lib/settings";
import type { ConnectionMode, Tester } from "@/lib/types";
import { DangerButton, FormField, PrimaryButton, PromptCard, SecondaryButton, SelectField } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isSpeechAvailable } from "@/lib/speech";

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

export function SettingsScreen({
  settings,
  onChange,
  tester,
  onTesterChange,
  connectionMode,
  onConnectionModeChange,
  isOnline,
  onLogout,
  onBack
}: {
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
  tester: Tester;
  onTesterChange: (tester: Tester) => void;
  connectionMode: ConnectionMode;
  onConnectionModeChange: (mode: ConnectionMode) => void;
  isOnline: boolean;
  onLogout: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <ScreenHeader title="Display settings" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Adjust for field lighting conditions. The app always stays dark and low-glare.</p>

      <div className="mb-6">
        <p className="field-label">Brightness</p>
        <div className="grid grid-cols-3 gap-3">
          {brightnessOptions.map((option) => (
            <button
              key={option.value}
              className={option.value === settings.brightness ? "primary-button" : "secondary-button"}
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
        <p className="field-label">Preview</p>
        <PromptCard eyebrow="Ask the client — say this aloud" prompt="Cover your left eye and read the smallest line you can see." onPlay={() => {}} speechAvailable={isSpeechAvailable()} />
      </div>

      <PrimaryButton fullWidth onClick={onBack}>
        Save settings
      </PrimaryButton>

      <div className="mt-8 space-y-4">
        <p className="font-bold">Tester profile</p>
        <FormField label="Name" value={tester.name} onChange={(event) => onTesterChange({ ...tester, name: event.target.value })} />
        <FormField label="Role" value={tester.role} onChange={(event) => onTesterChange({ ...tester, role: event.target.value })} />
        <FormField label="Home base" value={tester.home_base} onChange={(event) => onTesterChange({ ...tester, home_base: event.target.value })} />
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

      <DangerButton fullWidth className="mt-8" icon={<LogOut className="h-5 w-5" />} onClick={onLogout}>
        Log out
      </DangerButton>
    </section>
  );
}
