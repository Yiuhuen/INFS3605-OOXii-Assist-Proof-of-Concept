# OOXii Assist — Week 7 PoC

OOXii Assist is a working Proof of Concept for an offline-first multilingual guided testing companion. It demonstrates a vertical slice of the proposed INFS3605 OOXii solution:

1. demo tester login
2. language pack selection
3. new tester training gate
4. anonymous client creation
5. guided testing prompts with client-facing language support
6. local audio recording through the browser MediaRecorder API
7. mock transcript generation
8. mock AI extraction into structured fields
9. local offline save
10. optional Supabase sync
11. QC review and correction
12. CSV longlist export
13. admin language prompt editing

The app intentionally does **not** produce a medical prescription, change the clinical testing sequence, collect personal client identifiers, handle payment, handle inventory, use GPS, or support Bluetooth group testing.

## Tech stack

- Next.js + TypeScript
- Tailwind CSS
- Browser localStorage for structured offline records
- IndexedDB for local audio blobs
- Browser MediaRecorder API for audio recording
- Mock speech-to-text and mock AI extraction
- Optional Supabase database sync
- Vercel-ready deployment

## Quick start

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Week 7 demo flow

Recommended live demonstration:

1. Use demo tester.
2. Select Bislama or Tok Pisin demo language pack.
3. Complete the required training screen for a new tester.
4. Start a new anonymous client.
5. Show translated prompts and play prompt audio.
6. Record audio or use the mock recording/transcript path.
7. Run mock AI extraction.
8. Force offline mode and save the record as pending sync.
9. Open QC review, correct extracted fields, and show the audio placeholder/playback.
10. Export CSV longlist.
11. Open admin language editor and show that prompt text can be changed without altering the clinical flow.

## Supabase setup

The app works without Supabase using local demo storage. To enable real Supabase sync:

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Run `supabase/seed.sql`.
5. Copy `.env.example` to `.env.local`.
6. Add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

7. Restart the dev server.

## Vercel deployment

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel.
3. Add the two Supabase environment variables in Vercel project settings if using cloud sync.
4. Deploy.

The app still runs as a local-first demo if the Supabase variables are not provided.

## Design choices

### Offline-first

Structured records are saved to `localStorage`. Audio blobs are saved to IndexedDB using the record ID. This lets the demo keep working even when the connection is forced offline.

### Language packs

Language packs are JSON structures with:

- `code`
- `name`
- `downloaded`
- `audio_available`
- `prompts_json`

The admin editor proves that prompts can be changed without engineering work.

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

Clients receive anonymous generated IDs. The PoC focuses on guidance, data capture, QC, and export rather than clinical automation.

## File structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  ServiceWorkerRegistration.tsx
lib/
  csv.ts
  ids.ts
  languagePacks.ts
  mockAi.ts
  offlineDb.ts
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
