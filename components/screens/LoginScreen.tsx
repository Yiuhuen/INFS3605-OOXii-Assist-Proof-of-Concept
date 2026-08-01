"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Disclosure, FormField, InfoCard, PrimaryButton } from "@/components/ui";
import { BrandLogo } from "@/components/ui/BrandLogo";

const APP_VERSION = "v0.7";

/**
 * ---------------------------------------------------------------------------
 * Tester setup / Quick start — not a client-facing login.
 * ---------------------------------------------------------------------------
 * For Week 7, "Continue as demo tester" is the primary path: no password, no
 * network required, and the tester profile it creates is saved to this device
 * (see lib/storage.ts) so the field workflow keeps working fully offline.
 * Email/password is an optional secondary path that only appears when
 * Supabase env vars are configured (see lib/supabase.ts) — in production this
 * is where real tester accountability (who ran which test) would connect to
 * Supabase auth, without ever requiring live connectivity to complete a test.
 * Clients are never authenticated here or anywhere else — see ClientScreen,
 * which only ever collects an anonymous generated ID.
 * ---------------------------------------------------------------------------
 */
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
      <div className="mb-8 pt-2">
        <BrandLogo size="large" className="mb-5" />
        <h1 className="text-2xl font-black leading-tight">OOXii Assist</h1>
        <p className="mt-1 text-sm opacity-70">Guided field testing companion</p>
      </div>

      <div className="space-y-4">
        <PrimaryButton fullWidth disabled={authBusy} onClick={onDemoLogin}>
          Continue as demo tester
        </PrimaryButton>

        <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
          Your tester profile is saved on this device, so testing keeps working fully offline. Language packs download
          once and stay on your phone.
        </InfoCard>

        {supabaseConfigured && (
          <Disclosure label="Use email login instead">
            <div className="space-y-4 pt-1">
              <FormField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tester@ooxii.org"
              />
              <FormField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />

              {authError && <p className="badge-danger">{authError}</p>}

              <PrimaryButton fullWidth disabled={authBusy || !email || !password} onClick={() => onEmailLogin(email, password)}>
                Log in
              </PrimaryButton>

              <button
                className="w-full text-center text-sm underline opacity-70 hover:opacity-100 disabled:opacity-40"
                disabled={authBusy || !email || !password}
                onClick={() => onEmailSignUp(email, password)}
              >
                New here? Create an account
              </button>
            </div>
          </Disclosure>
        )}
      </div>

      <p className="mt-8 text-center text-xs opacity-50">OOXii Assist {APP_VERSION} · Week 7 Proof of Concept</p>
    </section>
  );
}
