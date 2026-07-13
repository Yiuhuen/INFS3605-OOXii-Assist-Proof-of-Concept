# OOXii Assist — Week 7 PoC

OOXii Assist is a working Proof of Concept for an offline-first multilingual guided testing companion. It demonstrates a vertical slice of the proposed INFS3605 OOXii solution:

1. tester login (demo or Supabase email/password)
2. language pack selection
3. new tester training gate
4. anonymous client creation
5. guided testing prompts with client-facing language support and manual field entry
6. compulsory local audio recording (or an explicit manual override) through the browser MediaRecorder API
7. mock transcript generation, with edits preserved separately from the original
8. mock AI extraction into structured, editable fields
9. local offline save
10. optional Supabase sync
11. QC review, filtering and correction
12. CSV longlist export
13. admin language prompt editing
14. field-ready display settings (brightness / contrast)

The app intentionally does **not** produce a medical prescription, change the clinical testing sequence, collect personal client identifiers, handle payment, handle inventory, use GPS, or support Bluetooth group testing.

## Design system

The UI follows a mobile-first, dark-purple field-tool look: warm gold primary actions, soft lavender text, rounded low-glare cards, and a fixed blue/light colour code for right/left eye badges. Shared building blocks live in `components/ui.tsx` (`PrimaryButton`, `SecondaryButton`, `StatusBadge`, `MetricCard`, `ActionCard`, `PromptCard`, form fields, etc.) and `components/ScreenHeader.tsx` (back button + title + offline badge). Each screen composes these primitives instead of one-off markup, so a palette or spacing change only has to happen in one place.

The guided-prompt flow is split into two screens per clinical step: a "testing" screen (client prompt preview, tester instruction, manual entry fields) and a "recording" screen (gold hero prompt, record controls). One continuous recording spans the whole test — visiting the recording screen again on a later step shows whatever state that shared recording is already in.

## Tech stack

- Next.js + TypeScript
- Tailwind CSS
- Browser localStorage for structured offline records
- IndexedDB for local audio blobs
- Browser MediaRecorder API for audio recording
- Browser SpeechSynthesis API for client-facing prompt audio
- Mock speech-to-text and mock AI extraction
- Optional Supabase auth + database sync
- Vercel-ready deployment

## Quick start

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Login and demo mode

The login screen supports two paths:

- **Use demo tester** — always works, with or without Supabase configured. This is the safe fallback for the Week 7 demo and for markers who do not have Supabase credentials.
- **Email / password** — only active when Supabase environment variables are present. If they are missing, the app shows a **"Demo mode active"** note and disables the email fields instead of crashing.

Logging out clears the session (and calls `supabase.auth.signOut()` when a Supabase session is active) and returns to the login screen. All screens other than login require an active session (demo or Supabase) — the app redirects back to login if neither is present.

## Supabase setup

The app works fully without Supabase using local demo storage and demo login. To enable real accounts and cloud sync:

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql` (safe to re-run; it uses `create table if not exists` and `add column if not exists`).
4. Run `supabase/seed.sql`.
5. In Supabase Authentication settings, enable Email/Password sign-in.
6. Copy `.env.example` to `.env.local` and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

7. Restart the dev server.

With these set, the login screen's email/password fields become active and `test_records` sync to Supabase whenever the app is online.

## Offline-first behaviour

- Structured test records are saved to `localStorage` immediately on save, regardless of connection.
- Audio blobs are saved to IndexedDB keyed by record ID, so audio survives a page reload even offline.
- The "Demo connection mode" selector on the Display settings screen lets you demo offline behaviour without disconnecting your machine.
- When offline, records are saved with `sync_status: "Pending sync"`. When the app returns online, pending records are retried if Supabase is configured. In demo-only mode, the record stays local and the app shows a clear message that cloud sync is disabled.

## Recording is compulsory

Testers cannot leave a recording step without either:

- a captured audio recording, or
- an explicit manual override reason entered via "Cannot record — add manual note".

If the microphone is unavailable or permission is denied, the app saves an unresolved placeholder segment with a timestamp, shows a clear error, and still requires a manual note before continuing. If no recording has started after about 15 seconds on the recording screen, a friendly reminder appears. Any record that used an override, failed recording, missing fields, low confidence, or edited fields is flagged `needs_qc`.

## Transcript and extraction editing rules

The data model keeps the original transcript and any edits clearly separated so nothing looks like silent data tampering:

- `raw_transcript_text` — immutable, produced from the recording (or a manual-override placeholder). Never edited in place.
- `corrected_transcript_text` — optional tester/QC edit. Saved separately; the transcript screen always shows a **"Preserved"** badge next to the original alongside an **"Editable"** badge on the corrected copy.
- `extracted_json` — structured fields produced by mock AI extraction from the raw or corrected transcript.
- `edited_extracted_json` — set only once a tester/QC edits a field; never mutates `extracted_json`.
- `extraction_source` — `raw_transcript`, `corrected_transcript`, or `manual_override`, recorded so QC knows what extraction ran against.
- `edited_by_user` / `requires_qc_verification` — set together whenever a field is hand-edited; the captured-fields screen shows an **"Edited — verify in QC"** badge.

Clicking **Next** (the AI extraction step, deliberately not labelled "AI" in the tester-facing flow) re-runs extraction against the corrected transcript if one was entered, otherwise the raw transcript.

## QC review rules

A record needs QC review if any of the following is true: low confidence score, missing required fields, a tester/QC edit was made, the recording failed/was overridden/was never captured, the record is still `Unreviewed`, or it is `Pending sync` / `Failed` sync. Marking QC complete is terminal for data-quality issues, but sync problems remain visible until resolved. The homepage QC Review tile shows a live count and the QC screen has filters for: Needs QC, Edited, Missing fields, Low confidence, Recording issues, Pending sync, All records.

## Display settings

Brightness (Low / Medium / High) and theme contrast (Standard purple / High contrast / Warm low-glare) are available from the homepage "Display settings" button and persist in `localStorage`. The app always stays dark and low-glare — there is no white-background mode.

## How to run locally

```bash
npm install
npm run dev
```

## How to deploy to Vercel

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel.
3. Add the two Supabase environment variables in Vercel project settings if using cloud sync/auth.
4. Deploy.

The app still runs as a local-first demo (with demo login) if the Supabase variables are not provided.

## Design choices

### Offline-first

Structured records are saved to `localStorage`. Audio blobs are saved to IndexedDB using the record ID. This lets the demo keep working even when the connection is forced offline.

### Language packs

Language packs are JSON structures with:

- `code`
- `name`
- `downloaded`
- `audio_available`
- `prompts_json` (each step includes `client_prompt` for on-screen text and an optional `audio_prompt_text` for what is spoken aloud, so a future real voiceover can differ from the label)

The prompt editor proves that prompts can be changed without engineering work.

### Mock speech-to-text and AI extraction

The mock functions live in `lib/mockAi.ts`. Replace these later with API routes for real transcription and extraction.

A production-ready approach would use:

- `/app/api/transcribe/route.ts` for speech-to-text
- `/app/api/extract/route.ts` for structured extraction
- server-side API keys only
- validation and human review before any operational use

## Privacy and safety boundaries

This PoC does not collect:

- client name
- date of birth
- phone number
- address
- precise GPS location

Clients receive anonymous generated IDs. The PoC focuses on guidance, data capture, QC, and export rather than clinical automation, and never outputs a final prescription.

## File structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  ScreenHeader.tsx
  ui.tsx
  ServiceWorkerRegistration.tsx
  screens/
    LoginScreen.tsx
    Dashboard.tsx
    LanguageScreen.tsx
    TrainingScreen.tsx
    ClientScreen.tsx
    TestingScreen.tsx
    RecordingScreen.tsx
    TranscriptScreen.tsx
    CapturedFieldsScreen.tsx
    SavedScreen.tsx
    QcScreen.tsx
    ExportScreen.tsx
    AdminScreen.tsx
    SettingsScreen.tsx
lib/
  auth.ts
  csv.ts
  ids.ts
  languagePacks.ts
  mockAi.ts
  offlineDb.ts
  qc.ts
  settings.ts
  speech.ts
  storage.ts
  supabase.ts
  types.ts
public/
  manifest.webmanifest
  service-worker.js
supabase/
  schema.sql
  seed.sql
```
