import type { SpeechSpeed } from "./speech";

export type Brightness = "low" | "medium" | "high";
export type ContrastTheme = "standard" | "high-contrast" | "warm";

export interface DisplaySettings {
  brightness: Brightness;
  contrast: ContrastTheme;
  speechSpeed: SpeechSpeed;
}

const SETTINGS_KEY = "ooxii_assist_display_settings";

export const defaultDisplaySettings: DisplaySettings = {
  brightness: "medium",
  contrast: "standard",
  speechSpeed: "normal"
};

export const speechSpeedLabels: Record<SpeechSpeed, string> = {
  slow: "Slow",
  normal: "Normal",
  faster: "Faster"
};

export const brightnessLabels: Record<Brightness, string> = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

export const contrastLabels: Record<ContrastTheme, string> = {
  standard: "Standard purple",
  "high-contrast": "High contrast",
  warm: "Warm low-glare"
};

export function loadDisplaySettings(): DisplaySettings {
  if (typeof window === "undefined") return defaultDisplaySettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultDisplaySettings;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      brightness: parsed.brightness ?? defaultDisplaySettings.brightness,
      contrast: parsed.contrast ?? defaultDisplaySettings.contrast,
      speechSpeed: parsed.speechSpeed ?? defaultDisplaySettings.speechSpeed
    };
  } catch {
    return defaultDisplaySettings;
  }
}

export function saveDisplaySettings(settings: DisplaySettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function applyDisplaySettings(settings: DisplaySettings) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.brightness = settings.brightness;
  document.documentElement.dataset.contrast = settings.contrast;
}

const SHOW_STT_DIAGNOSTICS_KEY = "ooxii_assist_show_stt_diagnostics";

/**
 * Admin-only toggle (More → Admin tools) for the recording screen's speech
 * recognition diagnostics panel — off by default so a normal demo run never
 * shows the technical STT panel. Persisted locally so an admin doesn't have
 * to re-enable it every session. See NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG in
 * .env.example for the build-time alternative (e.g. for a dedicated QA build).
 */
export function loadShowSttDiagnostics(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SHOW_STT_DIAGNOSTICS_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveShowSttDiagnostics(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOW_STT_DIAGNOSTICS_KEY, value ? "true" : "false");
  } catch {
    // Private-mode browsers may block localStorage — the toggle just won't persist across reloads.
  }
}
