# OOXii longlist demo — presenter script

How to demonstrate the two longlist exports, and the exact framing to use.
The longlists are **not** meant to prove medical correctness. They prove that
OOXii Assist converts field capture into structured, reviewable, non-personal
operational data.

## Setup (10 seconds)

Open **More → Export records** (or the Export shortcut). If the device has no
records, press **Load sample records** — twenty deterministic sample records
load instantly, one per demo case, all tagged `demo_record = true`. **Clear
sample records** removes exactly those twenty and never touches real records.

The status line should read: **20 records · 9 ready for export · 11 need review · 1 pending sync**

## The twenty sample cases

The first six are the "classic" cases used in the 90-second walkthrough below.
The remaining fourteen exist to give reviewers/markers a deep, believable
dataset to dig into — every high-risk field gets its own missing-value case,
every sync/QC/recording state the app supports appears at least once, and
astigmatism/short-sighted variants are covered in both directions.

| Record | Client | Case it demonstrates | Outcome |
|---|---|---|---|
| R-001 | C-811W | Clean standard wheel/paddle capture, no astigmatism, short-sighted never mentioned | Export ready |
| R-002 | C-274K | Astigmatism captured both eyes — toric power + axis, per-eye lens split | Export ready |
| R-003 | C-352P | Right/left eye captured with evidence, **final readable line missing** | QC required |
| R-004 | C-489T | Short-sighted test **explicitly not performed**; approved offline | Export ready, pending sync |
| R-005 | C-560M | Short-sighted test performed but **left result missing** | QC required, specific reason |
| R-006 | C-638R | Unclear transcript value **corrected by the tester in Review** | In review, audit trail preserved |
| R-007 | C-905L | **Right eye result missing** (never read back) | QC required |
| R-008 | C-127Q | **Left eye result missing** (missed resetting the paddle) | QC required |
| R-009 | C-346B | Session ended before dispensing was discussed — **glasses/dispensing missing** | QC required |
| R-010 | C-782F | **Cataract history missing** (never asked) | QC required |
| R-011 | C-214H | Client left early — **comfort response missing** | QC required |
| R-012 | C-561N | Client reports **"Uncomfortable"**, but every field captured cleanly | Export ready |
| R-013 | C-098Z | Client **declined glasses** — nothing dispensed, frames "Not applicable" | Export ready |
| R-014 | C-433Y | Astigmatism in the **right eye only** | Export ready |
| R-015 | C-720D | Astigmatism in the **left eye only** | Export ready |
| R-016 | C-186S | Short-sighted module performed **and fully complete** (all 3 results) | Export ready |
| R-017 | C-955V | **Microphone failed** — every field entered manually (`manual_override`) | QC required |
| R-018 | C-307J | Hedged, uncertain transcript throughout — **high transcript-quality risk** | QC required, "In review" |
| R-019 | C-644E | Approved and otherwise clean, but the **sync attempt failed** | QC required |
| R-020 | C-521G | Clean capture, device has **no Supabase configured** ("Local only" sync) | Export ready |

## What to say about each export

**OOXii Data Longlist** —
"This gives OOXii an operational view of each completed test record. It shows
what was captured, what still needs review, whether optional tests were
performed, and whether the record is ready to export." Pressing **Export
OOXii Data Longlist** downloads a real Excel spreadsheet (`.xlsx`) — one row
per record, with a frozen header row and auto-filter already applied. A plain
`.csv` is still available as a secondary "Export as CSV" link for anyone who
specifically wants the raw text file.

**Full Audit Longlist** —
"This gives OOXii the traceability layer. Each field is linked to its source,
evidence quote, confidence/status, manual edits and QC reason. This is how we
avoid treating speech-to-text as unquestioned truth." This export stays a
`.csv` download.

**Privacy** —
"The export is non-personal. It uses generated client IDs and excludes names,
DOB, phone numbers, addresses and GPS." (Those fields don't exist in the data
model at all, and a runtime guard blocks any export whose header list ever
contains one — both the CSV and the XLSX path re-check it.)

**Optional tests** —
"Optional tests are not treated as missing when they are not performed. They
are exported as *Not tested* so operational reporting can distinguish skipped
modules from failed capture."

**Astigmatism / right–left lens split** —
"Right and left lens values are separated, with toric/axis fields where
astigmatism details are captured. This avoids hiding important lens details
inside a single vague 'glasses selected' field — and it's tracked
independently per eye, so a client with astigmatism in only one eye (R-014,
R-015) never gets a fabricated value in the other."

## The three-value vocabulary (worth saying out loud)

- **Missing** — an expected value the capture failed to produce. Blocks export until reviewed.
- **Not tested** — an optional module deliberately not performed. Never blocks export.
- **Not recorded** — an optional value that simply never came up (e.g. toric power when there is no astigmatism). Never blocks export.

Nothing is ever exported as a silent blank, so a spreadsheet reader can always
tell *why* a cell has no clinical value.

## Suggested 90-second walkthrough

1. **Status line** — "nine of twenty are ready; the app won't pretend the other eleven are."
2. **Data preview** — point at C-811W (clean) vs C-352P (`Missing` final line) vs C-489T (`Not tested`).
3. **Toggle to Audit preview** — point at C-638R: original extracted value `Line 2`, reviewed value `Line 3`, source `reviewed_manual_entry`, original evidence quote preserved. "The correction is transparent, not silent."
4. **Export the Excel longlist** — tap **Export OOXii Data Longlist**, open the downloaded `.xlsx` on the phone, scroll to a `Missing` cell and a `Not tested` cell side by side.
5. Close with the privacy line.

### If there's time for more (marker Q&A depth)

The other fourteen cases exist specifically so a marker can ask "what about
X?" and get a real answer instead of "we didn't build that case":

- "What if the mic just fails?" → **C-955V**, `recording_mode = manual_override`.
- "What if the transcript is genuinely unreliable?" → **C-307J**, high
  transcript-quality risk, still needs QC even mid-review.
- "What if a record is approved but sync fails?" → **C-644E** — the one sync
  state that keeps an Approved record flagged for QC.
- "What if the device never has connectivity?" → **C-521G**, `Local only`
  sync, export ready — distinct from the pending-sync timing state (C-489T).
- "What if only one eye has astigmatism?" → **C-433Y** / **C-720D** — the
  untouched eye reads "No", never a fabricated value.

## Honest limitations (if asked)

- Sample records are authored, not recorded — but every QC/export outcome is
  computed by the same production predicates real records go through, and the
  seed is regression-tested (`npm run test:exports`, 30 cases covering all 20
  records).
- The app does not generate prescriptions and has no clinical validation; the
  longlists are operational/traceability artefacts only.
- Region, clinic ID, frames and checklist ride on an optional operational
  metadata block; real records created before that block exists export honest
  "Not recorded" values rather than fabricated ones.
