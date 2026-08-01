# OOXii longlist demo — presenter script

How to demonstrate the two longlist exports, and the exact framing to use.
The longlists are **not** meant to prove medical correctness. They prove that
OOXii Assist converts field capture into structured, reviewable, non-personal
operational data.

## Setup (10 seconds)

Open **More → Export records** (or the Export shortcut). If the device has no
records, press **Load sample records** — six deterministic sample records load
instantly, one per demo case, all tagged `demo_record = true`. **Clear sample
records** removes exactly those six and never touches real records.

The status line should read: **6 records · 3 ready for export · 3 need review · 1 pending sync**

## The six sample cases

| Record | Client | Case it demonstrates | Outcome |
|---|---|---|---|
| R-001 | C-811W | Clean standard wheel/paddle capture, no astigmatism, short-sighted never mentioned | Export ready |
| R-002 | C-274K | Astigmatism captured both eyes — toric power + axis, per-eye lens split | Export ready |
| R-003 | C-352P | Right/left eye captured with evidence, **final readable line missing** | QC required |
| R-004 | C-489T | Short-sighted test **explicitly not performed**; approved offline | Export ready, pending sync |
| R-005 | C-560M | Short-sighted test performed but **left result missing** | QC required, specific reason |
| R-006 | C-638R | Unclear transcript value **corrected by the tester in Review** | In review, audit trail preserved |

## What to say about each export

**OOXii Data Longlist** —
"This gives OOXii an operational view of each completed test record. It shows
what was captured, what still needs review, whether optional tests were
performed, and whether the record is ready to export."

**Full Audit Longlist** —
"This gives OOXii the traceability layer. Each field is linked to its source,
evidence quote, confidence/status, manual edits and QC reason. This is how we
avoid treating speech-to-text as unquestioned truth."

**Privacy** —
"The export is non-personal. It uses generated client IDs and excludes names,
DOB, phone numbers, addresses and GPS." (Those fields don't exist in the data
model at all, and a runtime guard blocks any export whose header list ever
contains one.)

**Optional tests** —
"Optional tests are not treated as missing when they are not performed. They
are exported as *Not tested* so operational reporting can distinguish skipped
modules from failed capture."

**Astigmatism / right–left lens split** —
"Right and left lens values are separated, with toric/axis fields where
astigmatism details are captured. This avoids hiding important lens details
inside a single vague 'glasses selected' field."

## The three-value vocabulary (worth saying out loud)

- **Missing** — an expected value the capture failed to produce. Blocks export until reviewed.
- **Not tested** — an optional module deliberately not performed. Never blocks export.
- **Not recorded** — an optional value that simply never came up (e.g. toric power when there is no astigmatism). Never blocks export.

Nothing is ever exported as a silent blank, so a spreadsheet reader can always
tell *why* a cell has no clinical value.

## Suggested 90-second walkthrough

1. **Status line** — "three of six are ready; the app won't pretend the other three are."
2. **Data preview** — point at C-811W (clean) vs C-352P (`Missing` final line) vs C-489T (`Not tested`).
3. **Toggle to Audit preview** — point at C-638R: original extracted value `Line 2`, reviewed value `Line 3`, source `reviewed_manual_entry`, original evidence quote preserved. "The correction is transparent, not silent."
4. **Export both CSVs** — open the audit CSV, filter `field_status = missing` — "this is the QC worklist."
5. Close with the privacy line.

## Honest limitations (if asked)

- Sample records are authored, not recorded — but every QC/export outcome is
  computed by the same production predicates real records go through, and the
  seed is regression-tested (`npm run test:exports`).
- The app does not generate prescriptions and has no clinical validation; the
  longlists are operational/traceability artefacts only.
- Region, clinic ID, frames and checklist ride on an optional operational
  metadata block; real records created before that block exists export honest
  "Not recorded" values rather than fabricated ones.
