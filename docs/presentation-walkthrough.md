# OOXii Assist — Exemplar Walkthrough Methodology
### Slide deck walkthrough + demonstration video, grounded in the actual PoC (INFS3605, A3)

This document is built directly from two sources of truth:

1. **What the app actually does** — verified screen-by-screen against the real code (`app/page.tsx`, `components/screens/*`, `lib/*`), not the pitch deck or the original wish-list.
2. **What the marker is actually grading** — the Assessment Outline's PoC Expectations: *"A pretty application that does not solve the problem is a failed PoC. A plain application that genuinely solves the problem, supported by evidence, is a strong PoC."* Judges at Week 7 and Week 10 look for exactly three things: **(a)** does it work end-to-end with realistic data, **(b)** can the team articulate why each part exists, **(c)** is there evidence that informed the design.

No feature below is invented. Where the app is honestly limited (English-only live STT, mocked translation, localStorage-only prompt editing, no live payment/GPS/inventory), that limitation is stated plainly — because the app itself states it plainly in its own UI copy. That honesty is a strength to present, not a gap to hide.

---

## PART 1 — Presentation Walkthrough Methodology

### 1. User context

Open with the tester, not the technology.

> *"Picture a community health worker in Papua New Guinea or Vanuatu. She's not an optometrist — she's had a few days of training. She's carrying OOXii's testing wheel and a paddle set. Her phone is low-spec, her connectivity is patchy at best, and the client in front of her speaks a local language she may only partly share. She's already run this test a hundred times this week. Her real interaction with the client is verbal — spoken, back and forth, often in the local language — while the app was, until now, a rigid English-only form she has to fill in after the fact."*

This framing is not invented — it is drawn directly from the group's own week 1–2 discovery notes (5-Whys root cause: *"the process is linear and assumes the tester cannot accurately diagnose clients without the app's guidance"* and *"testers are unfamiliar with English and modern technology"*) and from the official Sandbox brief's own framing of the operating conditions (*"low-end phones with half-dead batteries, outdoor light on cracked screens, languages with no translation tool, clients who walked three days to the clinic"*).

### 2. The pain point in the current workflow

State the gap explicitly, in one breath:

> *"OOXii's clinical test is a proven, linear decision tree — distance vision, near vision, wheel test, paddle test, dispense. That doesn't need to change, and we are not changing it. The gap is that the real interaction happens verbally, in a local language, while the recording step is a separate, English-only, manual data-entry task that competes with the tester's attention during the test itself."*

### 3. The design principle (state this verbatim, on its own slide)

> **"We are not changing OOXii's clinical process. We are improving how the process is guided, recorded, reviewed, and exported."**

This is the load-bearing sentence of the entire presentation. It pre-empts the single most likely marker pushback ("did you touch the clinical logic?") before anyone can ask it, and it matches Assumption 5 from the team's own discovery work verbatim in spirit: *"The clinical process should remain linear and easy to complete… Our project will focus on app-based features such as translated prompts, audio instructions, visual cues, adaptive instruction depth, and offline language packs. We will not focus on changing the physical OOXii wheel, the clinical testing method, payment systems, or Bluetooth group testing."*

### 4. The vertical slice to demonstrate

Show **one flow, start to finish, with no jump cuts and no "imagine this worked"**:

**Home (Dashboard) → New anonymous client → Record conversation (swipe prompts) → Review transcript → Auto-filled fields (with evidence) → Saved offline → QC → Export.**

Do not show every screen the app has (Training, Settings, Insights, Admin Prompt Editor) in the main walkthrough — those are secondary-flow evidence, held in reserve for marker questions (Part 6) or Use Case 4 (Part 2).

### 5. Tie every screen to value

The table below is the spine of both the slide walkthrough and the presenter's talking notes. Use it as the literal script structure — one row per beat.

| # | Screen (real, in code) | What the tester does | What data is captured | Why this reduces friction | OOXii constraint protected | If it fails |
|---|---|---|---|---|---|---|
| 1 | **Dashboard** — single next-action card (`getNextAction()` in `lib/workflow.ts`) | Taps the one highlighted next step; no menu-hunting | Nothing yet — this is navigation | Removes decision fatigue: a lay tester with a few days' training gets exactly one obvious next action, not thirteen menu items | Preserves the linear, strict decision-tree flow OOXii already relies on — the app *enforces* sequence rather than adding choice | If the tester is unsure what to do next, the same card re-renders the same instruction — there is no dead end |
| 2 | **New anonymous client** | Selects age band, gender, cataract history, location site, current-glasses status; taps "Generate ID" | A short anonymous ID (e.g. `C-482K`) + demographic bands only — **no name, DOB, phone, or address fields exist in the schema at all** | Removes the single biggest privacy and paperwork risk in the field — there is nothing sensitive to mistype, lose, or leak | Directly implements the brief's non-negotiable design rule: *"No personal client data in the app… clients are assigned an anonymous ID"* — the screen carries an explicit on-screen notice to this effect | If the tester leaves it blank, the record simply can't proceed to recording — no partial identity ever gets saved |
| 3 | **Record conversation — guided swipe prompts** | Swipes (or taps chevrons) through a fixed, ordered prompt sequence; taps "Play aloud" to hear the prompt spoken; can open "Why this matters" | The step position in the sequence; nothing about content yet | Turns a linear form into a linear *conversation aid* — the tester still talks to the client exactly as she does today, the app just keeps her on-script and in-sequence | Never lets the tester skip or reorder steps — same strict decision-tree flow, just presented as a conversation rather than a form | If a step is skipped, `TranscriptScreen` later lists it explicitly as an "unvisited prompt" so nothing silently disappears |
| 4 | **Record conversation — audio capture** | Taps Start/Pause/Resume/Stop; sees a live transcript panel (English only); can tap "Mark unclear" | Recorded audio (kept locally); live transcript text where available | Lets the tester keep talking naturally instead of typing while listening — audio capture runs in the background of the conversation, not instead of it | Nothing here touches OOXii's clinical calculation — this only captures *what was said*, not a diagnosis | If the mic or STT engine fails, "Cannot record?" exposes manual structured fields plus a required override-reason field — the record is never blocked |
| 5 | **Review transcript** | Reads the raw transcript (locked, never silently edited), reviews flagged "quality alerts," edits a separate "corrected transcript" field, taps "Review captured fields" | Raw transcript, tester-corrected transcript, per-flag apply/ignore/mark-unclear decisions | Puts a human in the loop before any field gets treated as fact — the transcript is support material, not an automatic record | Directly implements *"speech-to-text is draft support, not clinical truth"* — the raw transcript is explicitly labelled as preserved and untouched | If STT never ran (manual entry only), this screen still works from the manual notes — "Generate transcript from captured draft" rebuilds it without ever inventing audio-derived text |
| 6 | **Captured fields (auto-fill)** | Reviews each of the 21 structured fields (vision, glasses/astigmatism, and the optional short-sighted module); each shows a **Source badge** (Manual / Transcript / Corrected transcript), a **Confidence badge**, a **Ready vs Review-required badge**, and a quoted **Evidence** line pulled straight from the transcript; ticks "Fields reviewed"; taps "Save record" | The 21 result fields (e.g. right/left distance result, glasses selected, right/left astigmatism & toric power, short-sighted result) plus their provenance | This is the actual manual-entry-burden reduction: the tester checks and confirms rather than retyping from memory after a verbal exchange | Every auto-filled value is traceable to an exact quoted excerpt — nothing is asserted without a visible source, which is what makes "draft support, not clinical truth" a real, checkable claim rather than a slogan | Low-confidence or unmatched fields are marked "Review required" and cannot be silently accepted — they force the QC gate |
| 7 | **Saved (offline)** | Sees Client ID, time saved, and honest sync/QC/processing badges; can start the next client or jump to QC | The finished, structured `TestRecord` | Confirms the record exists *locally* the moment it's saved — no dependency on connectivity to finish a test | Implements offline-first: the workflow completes fully without a network round-trip; sync is a background concern, not a blocking one | The badge never claims "Synced" unless a Supabase round-trip actually happened — if offline, it honestly says "Local only" |
| 8 | **QC review** | Filters records by needs-QC / edited / missing-fields / low-confidence / recording-issues / pending-sync; edits fields if needed; adds QC notes; marks complete | QC decisions and notes, always tagged as manual/high-confidence once corrected | Gives a second, deliberately human check to exactly the records that need it — not every record, just the ones the system itself flagged as uncertain | This is the app's answer to "uncertain records go to QC" — a single real function (`evaluateNeedsQc`) combines ~14 signals (confidence, edits, missing fields, unclear audio, translation-safety flags, etc.) into one gate | A record that never clears QC simply never contributes to the clean export — it doesn't corrupt the dataset silently |
| 9 | **Export** | Chooses and downloads a CSV | **"OOXii Data Longlist"** (41 columns, one row per record: client/session identifiers, all 21 result fields, recording/QC/sync status) or **"Full Non-Personal Audit Longlist"** (31 columns, long/tidy format — one row per record-and-field pair — adding transcript source, confidence, evidence quote, and QC provenance for every field) | Turns a shift's worth of tests into one clean, immediately usable file for OOXii — no re-typing from paper, no generic unstructured spreadsheet | Both exports are anonymous-ID only by construction — there is no name/DOB/address field anywhere in the underlying data model for a CSV column to leak | Records still needing QC are visibly flagged in-app before export, with a direct shortcut back to finish reviewing them first |

### 6. Proof of value — close the walkthrough

State outcomes as direct consequences of the mechanisms just shown, not as separate claims:

- **Better data completeness** — because every field carries a visible Source/Confidence/Evidence badge, missing or low-confidence data is *visible*, not silently absent, the way it is in a generic spreadsheet export.
- **Lower manual input burden** — the tester reviews and confirms values already drafted from the conversation she was already having, instead of re-typing everything from memory after the fact.
- **Privacy by construction** — there is no name/DOB/phone/address field in the schema at all; anonymity isn't a policy the app might violate, it's a data model that has nothing to violate it with.
- **Offline resilience** — every step from client creation to saved record works with zero network calls; sync status is always reported honestly, never faked.
- **Quality control that targets real risk** — QC effort goes to the ~14-signal-flagged subset of records, not to every record uniformly.
- **A foundation for scaling** — the same guided-prompt architecture already carries three language packs (English, Tok Pisin, Bislama demo) and an admin-editable prompt layer, which is the seam a future version would extend, not rebuild.

---

## PART 2 — Video Segment Plan

**Target length: 6 minutes 30 seconds – 7 minutes 30 seconds** (hard ceiling from the brief is 10 minutes; the brief and course convention both reward tight, evidence-dense videos over padded ones). Structure below assumes ~7 minutes with three required use cases plus the optional fourth.

| Timestamp | Screen / action | Voiceover script (condensed) | Visual evidence to show | What NOT to say | Backup if the feature fails live |
|---|---|---|---|---|---|
| 0:00–0:35 | Title card, then a still of a tester with the physical OOXii kit (or a description slide if no real photo is available) | *"Two billion people live with uncorrected vision problems. OOXii solves the hardware side with a low-cost testing kit. We looked at the digital side — the app that guides the tester through it in the field."* | Title card only | Don't claim OOXii's global reach numbers as *our* achievement — attribute the problem-at-scale framing to OOXii | N/A |
| 0:35–1:00 | Text card: design principle | *"We are not changing OOXii's clinical process. We're improving how it's guided, recorded, reviewed, and exported."* | The sentence itself, large, on screen | — | — |
| **1:00–3:10** | **Use Case 1 — Standard successful capture.** Dashboard → New client → swipe through 4 prompts, "Play aloud" once → Start recording → speak a short scripted client exchange → Stop → Transcript review (show raw transcript populated) → Captured fields (zoom on one Evidence quote + Confidence badge) → tick "Fields reviewed" → Save → Saved screen | *"Here's a full test, start to finish. New anonymous client — no name, no date of birth, just an ID. The app guides the tester through the same four prompts OOXii already uses, in order. She records the conversation naturally. When she's done, the transcript is right there — untouched — and the fields are drafted from it, each one showing exactly which sentence it came from and how confident the system is. She checks it, confirms it, saves it — fully offline."* | Zoom-in on the Evidence quote line; zoom on the anonymous ID; zoom on the offline "Local only" sync badge | Don't say "the app transcribes any language" — say "English" if that's the demo language. Don't say "AI extracts the fields" — the extraction is deterministic, not AI, and the app's own code says so | If live mic capture is unreliable in the recording room, pre-record this segment once in a quiet space rather than risk a live failure on the flagship use case |
| **3:10–4:30** | **Use Case 2 — Poor audio / STT failure / manual fallback.** Start a new client → begin recording → deliberately mute the mic or speak too quietly → show "Mark unclear" and/or open "Cannot record?" → fill the manual override fields + required reason → Finish → Transcript screen shows manual-entry banner requiring QC | *"Field connectivity and audio aren't always perfect. If the mic fails or a segment is unclear, the tester isn't stuck — she can enter results manually, with a reason. The app doesn't pretend this is as good as a clean transcript: manual entries are automatically flagged for QC before they can be exported."* | The explicit on-screen QC-required warning text | Don't say "it still works perfectly" — the honest point is that it degrades safely, not invisibly | If you can't reliably reproduce a live mic failure, toggle airplane mode or use Settings → connectionMode ("force-offline") to force the degraded path, and say so on screen |
| **4:30–5:50** | **Use Case 3 — QC and export.** Open QC screen → filter to "Needs QC" → open the manual-entry record from UC2 → read the QC notes/reason → mark reviewed → go to Export → show both CSV options → open one exported file briefly | *"On the QC screen, the reviewer sees exactly why a record needs attention — in plain language, not a jargon code. Once reviewed, it's ready. Exporting produces two files: a clean OOXii Data Longlist for day-to-day reporting, and a Full Non-Personal Audit Longlist with the full evidence trail, for anyone who needs to check how a value was derived. Both are anonymous — there's no personal data in either file, because there's none in the app to begin with."* | The actual open CSV, scrolled to show column headers (client_id, age_band… — no name/DOB columns exist) | Don't call this "OOXii's official reporting format" — call it what it is, a structured export the team designed for OOXii's use | If Supabase sync isn't configured in the demo environment, don't hide it — say "this instance is running fully offline; sync to a shared database is optional and already wired in" |
| **5:50–6:50** *(optional)* | **Use Case 4 — Language/localisation.** Switch language to Tok Pisin or Bislama on Settings/Language → show the client-facing prompt translated → tap "Play aloud" → briefly open Admin → Prompt editor to show an editable prompt field | *"The same guided-prompt architecture already carries multiple language packs, and partner organisations can edit the wording themselves through a simple prompt editor — no engineering required for a wording change."* | The language switch and the translated prompt text side by side with English | Don't claim live speech-to-text works in this language — say plainly that live transcript is English-only today, and this pack is for guided audio prompts, not transcription | If the Admin editor isn't wired to a shared/synced store, say so: *"today this saves to the device; a shared, versioned store is the next step"* |
| 6:50–7:15 | Closing text card | *"OOXii Assist doesn't replace clinical judgement. It improves guidance, audio capture, transcript review, QC, and non-personal data export."* | Safe core line on screen | — | — |

---

## PART 3 — Exact Spoken Script

### A. 90-second condensed version

> "Two billion people live with vision problems glasses could fix — but in places like Papua New Guinea, the bottleneck isn't the glasses, it's delivery. OOXii solves that with a low-cost testing kit and a guided app. We focused on one gap: the real test happens verbally, often in a local language, while recording results has been a separate, English-only, manual task.
>
> Here's our proof of concept. A tester starts a new anonymous client — no name, no date of birth, just a short ID. She's guided through the same clinical steps OOXii already uses, in order, with prompts she can play aloud. She records the conversation naturally. The transcript comes back untouched, and the key results are drafted from it — each one showing exactly which sentence it came from, and how confident the system is. She checks it, confirms it, and it saves — fully offline.
>
> If a recording is unclear or the mic fails, she can enter results manually, and that record is automatically flagged for review. A reviewer sees exactly why, resolves it, and then it's ready to export — either a clean summary file or a full audit file with the evidence trail, both anonymous by design because there's no personal data anywhere in the app to leak.
>
> The app does not replace clinical judgement. It improves guidance, audio capture, transcript review, QC, and non-personal data export."

### B. 6–8 minute full video version

Use the Part 2 table verbatim as the shot-by-shot script; the lines above extend naturally into the longer per-segment voiceovers already written there. Deliver at a measured, conversational pace — roughly 130–150 words per minute — and let the screen actions breathe; don't narrate over every click.

### C. 2-minute live class walkthrough version

> "Quick context: OOXii's kit tests vision in places with almost no eye-care access. The clinical test — wheel, paddle, decision tree — is proven and we haven't touched it. What we changed is how it's guided, recorded, reviewed, and exported.
>
> Watch this. New anonymous client — no name, no birthdate, just an ID, because OOXii's rule is anonymous IDs only. She swipes through the same four clinical steps, records the conversation instead of typing while she listens, and the transcript stays untouched — that's the raw evidence. From that transcript we draft the result fields, and — this is the important part — every drafted value shows the exact quote it came from and a confidence level. Nothing is asserted blind.
>
> If something's unclear, it's flagged, not guessed — that record goes to QC, where a human resolves it before it's ever exported. Export gives OOXii two anonymous files: a clean longlist and a full audit trail.
>
> To be clear about scope: this doesn't replace clinical judgement, and speech-to-text here is draft support, not clinical truth — every value is tester-reviewed before it's saved. That's the whole point: less friction, same rigor."

**Safe core line (use verbatim, at least once per format):**
> "The app does not replace clinical judgement. It improves guidance, audio capture, transcript review, QC and non-personal data export."

---

## PART 4 — Screen Recording Checklist

| # | Shot | Recording-only or face included? | Speed | Pause for emphasis? | Cut entirely? |
|---|---|---|---|---|---|
| 1 | Home / Dashboard | Screen only | Normal | No | No |
| 2 | New anonymous client + privacy notice | Screen only | Normal | **Yes — pause 1–2s on the "Do not enter name/DOB/phone/address" notice** | No |
| 3 | Record conversation: swipe prompt navigation | Screen only | Slightly sped up between swipes (1.2–1.5x) is fine; keep actual recording start/stop at real speed | No | No |
| 4 | Start recording (mic permission prompt if shown) | Screen only | Normal | No | Cut if the OS permission dialog is ugly/distracting — pre-grant permission before recording |
| 5 | Live transcript populating | Screen only | Normal (don't speed this up — it's proof the STT is real, not staged) | Brief pause when a phrase lands correctly | No |
| 6 | Transcript review screen | Screen only | Normal | **Yes — pause on the "Preserved… never edited" label** | No |
| 7 | Auto-filled fields with Evidence + Confidence badges | Screen only, **face optional as a small inset if presenting live** | Normal | **Yes — pause and zoom on one Evidence quote** | No |
| 8 | Manual edit or "Cannot record?" fallback triggering QC | Screen only | Normal | **Yes — pause on the QC-required warning text** | No |
| 9 | Saved offline screen | Screen only | Normal, brief | No | Could be trimmed to 2–3s if time-constrained, never cut fully (it's the offline-resilience proof) |
| 10 | QC review (filter + resolve a flagged record) | Screen only | Sped up while scrolling/filtering; normal speed while reading the flag reason aloud | Yes, on the plain-language reason text | No |
| 11 | Export screen + opened CSV | Screen only | Normal | **Yes — pause on the CSV column headers showing no name/DOB columns** | No |
| 12 | Language pack switch / Admin prompt editor | Screen only | Normal | No | This is the one segment safe to cut first if the video is running long — it's Use Case 4 (optional) |
| 13 | Settings / Insights / Training screens | — | — | — | **Cut entirely from the main video** — these are marker-Q&A material (Part 6), not walkthrough material; showing them dilutes the vertical slice |

**Where to include your face:** an opening 5–10 second face-to-camera framing ("Hi, we're [team], this is OOXii Assist") and a closing 5–10 second face-to-camera line delivering the safe core line are both effective and expected in a project video — but the middle 5+ minutes should be screen-only with clean voiceover, since that's where the marker is checking the app actually works, not checking presentation delivery.

---

## PART 5 — Slide Deck Integration

Deck ceiling from the assessment outline: **35 pages max (16:9), excluding appendices.** The five slides below are the walkthrough section specifically — they sit inside that budget, not on top of it.

### Slide A — Framing slide (before the walkthrough)

- **Title:** "From clinical process to guided, recorded, reviewed, exported"
- **Layout:** Left: one-sentence design principle, large. Right: the pain-point sentence (verbal, local-language, low-connectivity friction) in smaller supporting text.
- **Key message:** We are showing an improvement layer, not a redesign of OOXii's clinical logic.
- **Speaker notes:** State the principle sentence verbatim, then say: "Everything you're about to see sits on top of the existing decision tree — it doesn't touch it."
- **Suggested still:** A simple two-box diagram — "OOXii's clinical process (unchanged)" next to "What we added: guidance / capture / review / QC / export."

### Slide B — Visual user journey slide

- **Title:** "The vertical slice we're demonstrating"
- **Layout:** Horizontal 8-step journey strip matching Part 1's table exactly: Home → New client → Record → Transcript review → Captured fields → Saved → QC → Export.
- **Key message:** One coherent flow, no gaps, no "and then imagine."
- **Speaker notes:** "This is the exact sequence you'll see in the demo video and live today — nothing skipped."
- **Suggested still:** Icons or thumbnails per step, not full screenshots (save those for Slide C).

### Slide C — Screenshot montage slide

- **Title:** "What each screen actually looks like"
- **Layout:** 2×3 or 2×4 grid of real screenshots (not mockups) — New client, Recording (mid-swipe), Transcript review, Captured fields (zoomed on one Evidence badge), Saved, QC, Export.
- **Key message:** This is a working app, not a Figma file.
- **Speaker notes:** Point once at the Evidence badge screenshot specifically: "Every drafted value traces to an exact quote — that's what makes 'draft support, not clinical truth' checkable, not just a claim."
- **Suggested still:** Actual PNG screenshots taken during a real run-through, timestamped in the deck footer if possible (extra credibility that it's live, not staged).

### Slide D — Data flow slide

- **Title:** "Where the data goes"
- **Layout:** Left-to-right pipeline: Voice/manual input → Local device storage (offline) → Structured `TestRecord` (Source/Confidence/Evidence per field) → QC gate → Two anonymous CSV exports (OOXii Data Longlist / Full Non-Personal Audit Longlist) → optional Supabase sync (when configured).
- **Key message:** Every stage is either local-first or explicitly optional/labelled — nothing is silently sent anywhere.
- **Speaker notes:** "Sync status never says 'Synced' unless a server round-trip actually happened — it's honest by construction, not just by policy."
- **Suggested still:** A simple flow diagram (no screenshot needed here).

### Slide E — PoV / impact slide (after the walkthrough)

- **Title:** "Why this is more than a prototype"
- **Layout:** Three columns — "Evidence it works" (Week 7 demo feedback, testing notes) / "Evidence it's needed" (the group's own 5-Whys friction point: verbal-only handoff of test results) / "What's next" (multi-language STT, human-voiced audio, shared prompt store).
- **Key message:** Value is demonstrated, not asserted.
- **Speaker notes:** Close with the safe core line.
- **Suggested still:** A short quote or summary from actual PoV/user-testing evidence gathered during the term.

---

## PART 6 — Marker Questions

**1. Why didn't you change OOXii's clinical testing process?**
Because the linear decision tree is a proven, working piece of clinical logic that the wheel and paddle hardware already depend on — changing it is a clinical-safety question, not a UX one, and it was explicitly out of scope per our own discovery (Assumption 1: "the clinical process should remain linear... our focus is only on improving how the app guides users through that process"). Our value-add is entirely in guidance, capture, review, QC, and export around that unchanged process.

**2. Why is voice-to-text safe enough to use as a draft input?**
Because it's never treated as final. Every extracted field carries a visible Source, Confidence, and quoted Evidence line, and the tester has to actively confirm ("Fields reviewed") before a record with any uncertain field can leave draft status. It's support for data entry, not a replacement for the tester's judgement or OOXii's clinical calculation.

**3. What happens if speech-to-text fails or isn't available in a language?**
The tester isn't blocked. She can mark a segment unclear, or use "Cannot record?" to enter results manually with a required reason. That path is deliberately less convenient by design — a manual-entry record is automatically routed to QC before export, so a degraded input degrades safely instead of silently.

**4. How is client privacy actually protected — not just promised?**
Structurally, not just by policy: there is no name, date-of-birth, phone, or address field anywhere in the client or record data model. The anonymous ID is a short, auto-generated code. You can't leak what the schema has no field for.

**5. How does offline mode actually work, and what happens without connectivity?**
The entire flow — from creating a client through saving a record — runs on local device storage with zero required network calls. Sync to a shared database is optional and additive: when configured, it happens automatically in the background; when not, the UI reports "Local only" honestly rather than pretending success.

**6. How does OOXii actually get useful data out of this?**
Two structured, anonymous CSV exports: a clean day-to-day reporting file, and a full audit file that includes the transcript, confidence, and evidence trail behind every value — so anyone checking data quality later can see exactly why a value was recorded the way it was, not just what the value is.

**7. How does this scale to more languages?**
The guided-prompt architecture is already language-pack-based, with multiple packs in place and an admin screen that lets non-engineers edit prompt wording directly. That's the seam we'd extend next — adding packs and, eventually, speech recognition per language — without re-architecting the app.

**8. How does QC actually prevent an unsafe or low-quality record from being treated as good data?**
A single evaluation function combines roughly fourteen real signals — low confidence, manual edits, missing fields, unclear audio segments, skipped prompts, translation-safety flags — into one gate. Any record that trips it is visibly held for human review before it can be marked complete or exported clean.

**9. Why is this more than "a pretty prototype"?**
Every screen we've shown writes to and reads from a real, working data model — not static mockup content. A record created on the client screen is the same record you see flagged in QC and the same row you see in the exported CSV. That continuity is verifiable live, which is exactly the PoC bar this course sets: working end-to-end with realistic data, not a clickable wireframe.

**10. What's intentionally out of scope, and why?**
Real-time multi-device/Bluetooth group testing, live GPS-based location, payments, and a lens-inventory recommender are all explicitly out of scope — they were already identified in the partner brief as open, unresolved problems requiring infrastructure or policy decisions beyond a ten-week digital-layer PoC. We scoped deliberately to what we could build *and prove*, rather than claim broad coverage we couldn't demonstrate live.

---

## PART 7 — Final Quality Standard

### 1. Strongest 5 talking points

1. **The design principle is a genuine constraint, not a slogan** — every screen shown demonstrably leaves OOXii's clinical decision tree untouched.
2. **Every drafted field is traceable** — the Source/Confidence/Evidence badge triplet makes "draft support, not clinical truth" a checkable property of the running app, not a claim in a slide.
3. **Failure degrades safely, not silently** — manual fallback always works, and always forces QC; nothing bad gets exported quietly.
4. **Privacy is structural** — there is no personal-data field to leak, not just a rule not to enter one.
5. **The exports are real and already OOXii-shaped** — two named, structured, anonymous CSVs exist today, not as a future promise.

### 2. Weakest 3 risks to acknowledge honestly

1. **Live speech-to-text only works reliably in English today** — Tok Pisin and Bislama have guided audio prompts and translated text, but not live transcription; this is stated honestly in the app rather than hidden, and is the clearest "next" item.
2. **The admin prompt editor persists locally only** — a partner organisation editing prompts today isn't yet syncing that edit to other devices or to a shared store; a real deployment would need this to be server-backed and versioned.
3. **Supabase sync is present but optional scaffolding** — it's wired and functional when configured, but the demo may run in a fully local mode; be upfront that "Local only" in the demo reflects the environment, not a broken feature.

### 3. Exact closing sentence for the walkthrough

> **"OOXii Assist doesn't replace clinical judgement, and it doesn't touch OOXii's clinical process — it makes the process around it easier to guide, faster to record, safer to review, and simpler to export, with every draft value traceable back to what was actually said."**

### 4. Final recommended video length

**7 minutes** — enough for three required use cases plus the optional language use case, comfortably under the 10-minute ceiling while staying dense with evidence rather than padded.

### 5. Final recommended order of screen segments

Home/Dashboard → New anonymous client (pause on privacy notice) → Record conversation: guided swipe prompts → Start/stop recording with live transcript → Transcript review (pause on "preserved, never edited") → Captured fields (pause + zoom on one Evidence badge) → Saved offline screen → QC review (resolve a flagged record) → Export (pause on CSV headers) → *(optional)* Language pack switch + Admin prompt editor → Closing safe-core-line card.
