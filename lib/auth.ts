export type AuthMode = "demo" | "supabase" | null;

const AUTH_MODE_KEY = "ooxii_assist_auth_mode";

export function loadAuthMode(): AuthMode {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(AUTH_MODE_KEY);
  return value === "demo" || value === "supabase" ? value : null;
}

export function saveAuthMode(mode: AuthMode) {
  if (typeof window === "undefined") return;
  if (mode) localStorage.setItem(AUTH_MODE_KEY, mode);
  else localStorage.removeItem(AUTH_MODE_KEY);
}
