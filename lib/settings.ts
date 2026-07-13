export type Brightness = "low" | "medium" | "high";
export type ContrastTheme = "standard" | "high-contrast" | "warm";

export interface DisplaySettings {
  brightness: Brightness;
  contrast: ContrastTheme;
}

const SETTINGS_KEY = "ooxii_assist_display_settings";

export const defaultDisplaySettings: DisplaySettings = {
  brightness: "medium",
  contrast: "standard"
};

export function loadDisplaySettings(): DisplaySettings {
  if (typeof window === "undefined") return defaultDisplaySettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultDisplaySettings;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      brightness: parsed.brightness ?? defaultDisplaySettings.brightness,
      contrast: parsed.contrast ?? defaultDisplaySettings.contrast
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
