# OOXii Assist — Week 7 PoC

OOXii Assist is a working Proof of Concept for an offline-first multilingual guided testing companion. It demonstrates a vertical slice of the proposed INFS3605 OOXii solution:

1. tester login (demo or Supabase email/password)
2. language pack selection
3. new tester training gate
4. anonymous client creation
5. guided testing prompts with client-facing language support and manual field entry
6. compulsory local audio recording (or an explicit manual override) through the browser MediaRecorder API
7. real live English transcription via the browser's SpeechRecognition API (Tok Pisin/Bislama have no live transcript in this PoC — manual entry instead), with edits preserved separately from the original
8. mock AI extraction into structured, editable fields
9. local offline save
10. optional Supabase sync
11. QC review, filtering and correction
12. CSV longlist export
13. admin language prompt editing
14. field-ready display settings (brightness / contrast)

The app intentionally does **not** produce a medical prescription, change the clinical testing sequence, collect personal client identifiers, handle payment, handle inventory, use GPS, or support Bluetooth group testing.

## Live demo script

A single vertical slice, start to finish, in Chrome on `localhost` or the Vercel URL:

1. **Continue as demo tester** on the setup screen — no password, works offline.
2. From Home, tap **Start new anonymous client**. Point out the auto-generated ID (`C-XXXX`) and the on-screen privacy notice — no name, DOB, phone, or address is ever asked for.
3. Fill the short non-personal client form (age band, gender, site, etc.) and tap **Start recording**.
4. Tap **Start recording** on the record screen — grant the microphone prompt. Swipe the prompt card left/right (or use Previous/Next) through the four fixed clinical steps; the recording keeps running continuously underneath.
5. Tap **Finish & review transcript**. Show the **raw transcript** (labelled "Preserved," read-only) next to the **corrected transcript** (labelled "Editable") — point out they are never the same field.
6. Tap **Review captured fields** — the mock extraction has turned the transcript into structured, editable fields, each tagged with its confidence and source.
7. Tap **Save record** — the record is saved to this device immediately, works offline, and shows its sync/QC status honestly (never claims "Synced" unless a real cloud sync happened).
8. Open **More → QC Review**, open the saved record, show the categorised reasons it needs review, and tap **Mark complete**.
9. Open **More → Export records**, download both the **OOXii Data Longlist** and the **Full Non-Personal Audit Longlist** CSVs.
10. To reset for the next run: **More → Export records → Clear local demo records**, confirm the warning — the device is now a blank slate again.

## Design system

The UI follows a mobile-first, dark-purple field-tool look: warm gold primary actions, soft lavender text, rounded low-glare cards, and a fixed blue/light colour code for right/left eye badges. Shared building blocks live in `components/ui.tsx` (`PrimaryButton`, `SecondaryButton`, `StatusBadge`, `MetricCard`, `ActionCard`, `PromptCard`, form fields, etc.) and `components/ScreenHeader.tsx` (back button + title + offline badge). Each screen composes these primitives instead of one-off markup, so a palette or spacing change only has to happen in one place.

Home is a single next-action screen (`components/screens/Dashboard.tsx`), not a dashboard: logo, a compact tester/language/online status row, workflow progress dots, and exactly one primary button, driven entirely by `lib/workflow.ts` `getNextAction()`. Everything else (language packs, display settings, replay training, QC review, insights, export, the prompt editor) lives one tap away behind **More** (`components/screens/MoreScreen.tsx`), grouped into Field tools / Review & reporting / Admin tools, so the normal tester flow never sees them unless they go looking.

Recording is one screen with a swipeable prompt card (`components/screens/RecordingScreen.tsx`): swiping left/right (or the Previous/Next fallback buttons, or arrow keys) changes which prompt is shown and logs a timestamped marker, without ever pausing the continuous recording, clearing the transcript, or reordering the fixed clinical sequence. Audio playback is deliberately **not** shown on this screen — it only appears afterwards, on Transcript Review, once the recording is finished.

## Tech stack

- Next.js + TypeScript
- Tailwind CSS
- Browser localStorage for structured offline records
- IndexedDB for local audio blobs
- Browser MediaRecorder API for audio recording
- Browser SpeechSynthesis API for client-facing prompt audio
- Real browser SpeechRecognition API for live English transcription (`lib/realSpeechRecognition.ts`, `lib/liveTranscript.ts`), plus mock (non-paid) AI field extraction
- Optional Supabase auth + database sync
- Vercel-ready deployment

## Quick start

```bash
npm install
npm run dev
```

Real live transcription uses browser speech recognition and requires a supported browser, microphone permission, and HTTPS or localhost.

Open the local URL shown in the terminal.

## Browser & device notes

- **Chrome is the preferred browser for the live demo.** It has the most reliable `webkitSpeechRecognition` support. Recent Edge also works. Safari and Firefox either lack live English transcription entirely or support it inconsistently — the app still works in every browser, but falls back to the manual/QC path (below) instead of a live transcript.
- **The page must be served over `localhost` or HTTPS.** Browsers refuse both microphone access and SpeechRecognition on a plain-HTTP origin (`window.isSecureContext` must be `true`). `npm run dev` on `localhost` and a Vercel deployment both satisfy this automatically.
- **Audio recording works even when live transcription doesn't.** MediaRecorder (the actual audio capture) and SpeechRecognition (the live draft transcript) are two independent browser APIs. If SpeechRecognition isn't supported or the language pack has no live-transcript support (Tok Pisin/Bislama), recording still proceeds normally — the tester just types the transcript manually on the next screen instead of reviewing an auto-drafted one.
- **The live transcript is always a draft, never a final answer.** It is shown as an editable "Corrected transcript" next to a read-only, never-overwritten "Raw transcript," and any record built from a manual entry or an uncertain transcript is automatically flagged `needs_qc` — see [Transcript and extraction editing rules](#transcript-and-extraction-editing-rules) and [QC review rules](#qc-review-rules) below.
- **If the microphone is blocked or denied,** the app never fabricates a transcript. It saves an honest placeholder ("Recording not available (failed/manual override)"), requires a one-line manual reason before the tester can continue, and routes the record straight to QC. This was verified in a sandboxed/headless browser with no microphone device, which is a good stand-in for a live demo where mic permission gets denied by accident.

## Demo reset (for markers/testers, not a normal field tool)

**More → Review & reporting → Export records → "Clear local demo records"** permanently deletes every locally saved test record (and its audio) from the current device/browser. It is deliberately **not** on the Home screen — it lives one tap deeper, under the same screen as CSV export, and asks for an explicit "Yes, delete all records" confirmation before it does anything irreversible. Use it right before the live demo to start from a clean slate, or between rehearsals. It never touches the language packs, tester profile, or display settings — only test records and their audio.

## Tester setup / Quick start (not a client login)

The first screen is **tester setup**, not a client-facing login — OOXii clients never authenticate anywhere in this app; they only ever get an anonymous generated ID (see Privacy below). Two paths:

- **Continue as demo tester** (primary) — always works, offline, with no password, with or without Supabase configured. This is the default path for the Week 7 demo and for markers who do not have Supabase credentials. It creates/loads a tester profile (id, role, experience level, home base, preferred language, instruction mode, `setup_completed`, `last_active_at`) and saves it to this device via `localStorage` (see `lib/storage.ts`), so the tester stays "signed in" locally and never sees the setup screen again on this device unless they log out.
- **Use email login instead** (secondary, collapsed) — only shown when Supabase environment variables are present. If they are missing, this option doesn't render at all rather than showing disabled fields.

Once set up, the tester profile is editable any time from **Settings → Tester profile** (role, experience level, home base, instruction mode, preferred language). Logging out clears the local session only — the tester profile itself stays saved on the device and is reused the next time "Continue as demo tester" is tapped, so testers are never forced through setup twice on the same phone.

**Production-ready note:** the offline field workflow (record → review → QC → export) never depends on live authentication — it works identically whether the tester is in demo mode or signed in via Supabase, online or offline. In production, this demo-tester path would be replaced with real Supabase-backed tester accounts (see `lib/supabase.ts`), without changing anything about how a test is captured or exported.

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

With these set, the "Use email login instead" option appears on the Tester setup screen and `test_records` sync to Supabase whenever the app is online.

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

Clicking **Next** (the extraction step, deliberately not labelled "AI" in the tester-facing flow) re-runs extraction against the corrected transcript if one was entered, otherwise the raw transcript.

### Transcript quality and translation safety

The transcript is never treated as automatically correct (`lib/transcriptQuality.ts`, `lib/translationSafety.ts`, `lib/domainLexicon.ts`). Every transcript is scanned for:

- known speech-to-text misrecognitions in a vision-testing vocabulary (e.g. "blood" → "blind", "classes" → "glasses", "write eye" → "right eye"),
- negation ambiguity ("can see" vs "cannot see", "comfortable" vs "uncomfortable"),
- eye-side ambiguity (a segment recorded during the right-eye step mentioning the left eye, or vice versa),
- low recognition confidence and missing expected terms for the current prompt,
- translation uncertainty for any non-English record, since the English processing copy is a local mock, not a real translation.

Suggested corrections are **suggest-only**: applying one edits `corrected_transcript_text` only, never `raw_transcript_text`, and is recorded in `corrections_applied` with a flag for whether it touches clinically significant meaning. Any of the above raises the record's `transcript_quality_risk` and forces QC review — see `lib/qc.ts`.

## QC review rules

A record needs QC review if any of the following is true: low confidence score, missing required fields, a tester/QC edit was made, the recording failed/was overridden/was never captured, the record is still `Unreviewed`, it is `Pending sync` / `Failed` sync, transcript quality risk is medium/high, a translation requires review, or extraction ran against an unsafe/uncertain transcript. Marking QC complete is terminal for data-quality issues, but sync problems remain visible until resolved. Home shows a live "needs QC" badge; the full QC Review screen (via **More**) has filters for: Needs QC, Edited, Missing fields, Low confidence, Recording issues, Pending sync, All records, plus a per-record transcript-quality panel with human-readable reasons.

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
  ui/BrandLogo.tsx
  screens/
    LoginScreen.tsx
    Dashboard.tsx
    MoreScreen.tsx
    LanguageScreen.tsx
    TrainingScreen.tsx
    ClientScreen.tsx
    RecordingScreen.tsx
    TranscriptScreen.tsx
    CapturedFieldsScreen.tsx
    SavedScreen.tsx
    QcScreen.tsx
    ExportScreen.tsx
    InsightsScreen.tsx
    AdminScreen.tsx
    SettingsScreen.tsx
lib/
  auth.ts
  csv.ts
  domainLexicon.ts
  ids.ts
  insights.ts
  languagePacks.ts
  liveTranscript.ts
  mockAi.ts
  offlineDb.ts
  qc.ts
  realSpeechRecognition.ts
  settings.ts
  speech.ts
  storage.ts
  supabase.ts
  transcriptQuality.ts
  translationSafety.ts
  types.ts
  workflow.ts
public/
  manifest.webmanifest
  service-worker.js
  brand/ooxii-icon.svg
supabase/
  schema.sql
  seed.sql
```
