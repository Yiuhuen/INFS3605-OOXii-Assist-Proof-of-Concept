"use client";

import { useState } from "react";
import { Eye, WifiOff } from "lucide-react";
import { FormField, InfoCard, PrimaryButton, SecondaryButton } from "@/components/ui";

const APP_VERSION = "v0.7";

export function LoginScreen({
  onDemoLogin,
  supabaseConfigured,
  onEmailLogin,
  onEmailSignUp,
  authError,
  authBusy
}: {
  onDemoLogin: () => void;
  supabaseConfigured: boolean;
  onEmailLogin: (email: string, password: string) => void;
  onEmailSignUp: (email: string, password: string) => void;
  authError: string;
  authBusy: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <section className="mx-auto w-full max-w-md">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--gold)] text-[var(--gold-ink)]">
          <Eye className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">OOXii Assist</h1>
          <p className="text-sm opacity-70">Guided field testing companion</p>
        </div>
      </div>

      <div className="space-y-4">
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tester@ooxii.org"
          disabled={!supabaseConfigured}
        />
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={!supabaseConfigured}
        />

        {authError && <p className="badge-danger">{authError}</p>}
        {!supabaseConfigured && (
          <p className="text-xs opacity-60">Demo mode — Supabase isn&rsquo;t configured, use the demo tester button below.</p>
        )}

        <PrimaryButton
          fullWidth
          disabled={!supabaseConfigured || authBusy || !email || !password}
          onClick={() => onEmailLogin(email, password)}
        >
          Log in
        </PrimaryButton>

        <SecondaryButton fullWidth onClick={onDemoLogin}>
          Use demo tester
        </SecondaryButton>

        {supabaseConfigured && (
          <button
            className="w-full text-center text-sm underline opacity-70 hover:opacity-100 disabled:opacity-40"
            disabled={authBusy || !email || !password}
            onClick={() => onEmailSignUp(email, password)}
          >
            New here? Create an account
          </button>
        )}

        <InfoCard icon={<WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}>
          Core testing works offline after first setup. Language packs download once and stay on your phone.
        </InfoCard>
      </div>

      <p className="mt-8 text-center text-xs opacity-50">OOXii Assist {APP_VERSION} · Week 7 Proof of Concept</p>
    </section>
  );
}
