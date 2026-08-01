"use client";

import { useMemo, useState } from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { AUDIT_CSV_COLUMNS, LONGLIST_CSV_COLUMNS, buildFullAuditLonglist, buildOoxiiDataLonglist } from "@/lib/csv";
import { recordNeedsQc } from "@/lib/qc";
import { DangerButton, DetailModal, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

/** "id"/"qc" are acronyms and stay fully uppercase; only the first word is otherwise capitalised (sentence case) — matches column names used elsewhere in the app. */
const ACRONYM_WORDS = new Set(["id", "qc"]);

function readableColumn(column: string) {
  return column
    .split("_")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYM_WORDS.has(lower)) return lower.toUpperCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function FieldChecklist({ fields }: { fields: readonly string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-2 text-sm">
          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--good)]" />
          <span className="leading-snug opacity-85">{readableColumn(field)}</span>
        </div>
      ))}
    </div>
  );
}

/** Presentation-only grouping of LONGLIST_CSV_COLUMNS for the "included fields" detail modal — keep in sync with lib/csv.ts if that list changes. */
const LONGLIST_FIELD_GROUPS: Array<{ title: string; fields: readonly string[] }> = [
  { title: "Record identity", fields: ["record_id", "client_id", "tester_id", "clinic_id", "session_number", "started_at", "completed_at", "active_test_module", "record_status"] },
  { title: "Location and session", fields: ["country", "state", "city", "offline_created", "pending_sync"] },
  { title: "Core capture", fields: ["current_glasses", "cataract_history", "right_eye_line", "left_eye_line", "both_eyes_line", "final_readable_line", "comfort_response"] },
  {
    title: "Glasses and dispensing",
    fields: [
      "right_lens_selected",
      "left_lens_selected",
      "right_astigmatism",
      "right_toric_power",
      "right_axis",
      "left_astigmatism",
      "left_toric_power",
      "left_axis",
      "glasses_dispensed_status",
      "frame_colour",
      "frame_size",
      "frame_type"
    ]
  },
  {
    title: "Optional tests",
    fields: ["short_sighted_test_performed", "short_sighted_right_result", "short_sighted_left_result", "short_sighted_both_eyes_result", "short_sighted_notes_status"]
  },
  { title: "Review, QC and export", fields: ["capture_summary", "review_status", "qc_required", "qc_reason_summary", "export_ready", "reviewed_by", "reviewed_at"] },
  {
    title: "Completion",
    fields: [
      "checklist_results_card_completed",
      "checklist_care_instructions_given",
      "checklist_return_if_problem",
      "checklist_regular_eye_health_checks",
      "non_personal_session_comment"
    ]
  },
  { title: "Provenance", fields: ["language_pack", "recording_mode", "capture_confidence", "sync_status", "demo_record", "demo_dataset_version"] }
];

/** Presentation-only grouping of AUDIT_CSV_COLUMNS for the "included fields" detail modal — one row per record PER FIELD, so these columns describe a single field-row, not a whole record. */
const AUDIT_FIELD_GROUPS: Array<{ title: string; fields: readonly string[] }> = [
  { title: "Row identity", fields: ["audit_row_id", "record_id", "client_id", "field_group", "field_name", "field_label"] },
  { title: "Field-level evidence", fields: ["field_value", "field_status", "field_source", "field_confidence", "evidence_quote", "transcript_line_number"] },
  { title: "Prompt coverage", fields: ["prompt_step", "prompt_label", "prompt_viewed", "prompt_recorded"] },
  { title: "Review trail", fields: ["manually_edited", "original_extracted_value", "reviewed_value", "reviewer_action", "requires_review", "qc_reason", "reviewed_at"] },
  { title: "Export", fields: ["export_ready", "demo_record", "demo_dataset_version"] }
];

/** Columns the on-screen Data preview shows — the full CSV keeps all LONGLIST_CSV_COLUMNS; this is just a readable subset so the screen never becomes a giant raw database table. */
const DATA_PREVIEW_COLUMNS: Array<{ column: string; label: string }> = [
  { column: "client_id", label: "Client" },
  { column: "right_lens_selected", label: "Right lens" },
  { column: "left_lens_selected", label: "Left lens" },
  { column: "final_readable_line", label: "Final line" },
  { column: "short_sighted_test_performed", label: "Short-sighted" },
  { column: "qc_required", label: "QC" },
  { column: "export_ready", label: "Export" }
];

/** Audit-preview row statuses worth showing on screen — the rows that demonstrate the evidence/QC trail, not all 22 fields per record. A record with none of these still gets one representative "not_tested" row so its skipped optional module stays visible. */
const AUDIT_PREVIEW_STATUSES = new Set(["missing", "edited", "check"]);

function previewCell(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ExportScreen({
  records,
  isOnline,
  hasDemoRecords,
  onExportLonglist,
  onExportAudit,
  onLoadSampleRecords,
  onClearSampleRecords,
  onClear,
  onReviewQc,
  onBack
}: {
  records: TestRecord[];
  isOnline: boolean;
  hasDemoRecords: boolean;
  onExportLonglist: () => void;
  onExportAudit: () => void;
  onLoadSampleRecords: () => void;
  onClearSampleRecords: () => void;
  onClear: () => void;
  onReviewQc: () => void;
  onBack: () => void;
}) {
  const pending = records.filter((record) => record.sync_status === "Pending sync").length;
  const needsQc = records.filter(recordNeedsQc).length;
  const ready = records.length - needsQc;
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [fieldsModal, setFieldsModal] = useState<"longlist" | "audit" | null>(null);
  const [previewMode, setPreviewMode] = useState<"data" | "audit">("data");
  /** Set only when a download actually fires this session — never pre-filled, so "Not yet generated" is honest until a real export happens. */
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const dataPreview = useMemo(() => {
    const table = buildOoxiiDataLonglist(records.slice(0, 6));
    const indexes = DATA_PREVIEW_COLUMNS.map(({ column }) => table.columns.indexOf(column));
    return table.rows.map((row) => indexes.map((index) => previewCell(row[index])));
  }, [records]);

  const auditPreview = useMemo(() => {
    const table = buildFullAuditLonglist(records.slice(0, 6));
    const col = (name: string) => table.columns.indexOf(name);
    const allRows = table.rows.map((row) => ({
      recordId: String(row[col("record_id")]),
      clientId: String(row[col("client_id")]),
      fieldName: String(row[col("field_name")]),
      group: String(row[col("field_group")]),
      label: String(row[col("field_label")]),
      value: String(row[col("field_value")]),
      status: String(row[col("field_status")]),
      source: String(row[col("field_source")]),
      evidence: String(row[col("evidence_quote")])
    }));
    // Group by record: up to 3 attention rows (missing/edited/check) each; a
    // record with none still shows its skipped optional module as one
    // representative "Not tested" row, so the preview stays illustrative
    // without drowning in repeated not_tested sub-fields.
    const byRecord = new Map<string, { clientId: string; rows: typeof allRows }>();
    for (const row of allRows) {
      const entry = byRecord.get(row.recordId) ?? { clientId: row.clientId, rows: [] };
      if (AUDIT_PREVIEW_STATUSES.has(row.status) && entry.rows.length < 3) entry.rows.push(row);
      byRecord.set(row.recordId, entry);
    }
    for (const row of allRows) {
      const entry = byRecord.get(row.recordId);
      if (entry && entry.rows.length === 0 && row.fieldName === "short_sighted_test_performed") entry.rows.push(row);
    }
    return Array.from(byRecord.entries()).filter(([, entry]) => entry.rows.length > 0);
  }, [records]);

  function stampGenerated() {
    setLastGeneratedAt(new Date().toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
  }

  function handleExportLonglist() {
    onExportLonglist();
    stampGenerated();
  }

  function handleExportAudit() {
    onExportAudit();
    stampGenerated();
  }

  return (
    <OneScreenShell
      header={<CompactHeader title="Export longlists" onBack={onBack} isOnline={isOnline} />}
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          {needsQc > 0 && (
            <SecondaryButton fullWidth className="py-2 text-sm" onClick={onReviewQc}>
              Review remaining QC records first
            </SecondaryButton>
          )}
          {confirmingClear ? (
            <div className="space-y-2 rounded-2xl border border-[var(--danger)] p-3">
              <WarningCard>
                <span className="line-clamp-2">This permanently deletes all {records.length} local record{records.length === 1 ? "" : "s"} and their audio. Cannot be undone.</span>
              </WarningCard>
              <div className="flex gap-2">
                <SecondaryButton fullWidth className="flex-1 py-2 text-sm" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </SecondaryButton>
                <DangerButton
                  fullWidth
                  className="flex-1 py-2 text-sm"
                  onClick={() => {
                    setConfirmingClear(false);
                    onClear();
                  }}
                >
                  Delete all
                </DangerButton>
              </div>
            </div>
          ) : (
            <DangerButton fullWidth className="py-2 text-sm" disabled={records.length === 0} onClick={() => setConfirmingClear(true)}>
              Clear all local records
            </DangerButton>
          )}
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto">
        {/* One compact status line — answers "what can OOXii safely export
            now?" with counts, not a metrics dashboard. */}
        <div className="shrink-0 rounded-xl border border-field-line bg-field-card px-3 py-2.5">
          <p className="text-sm font-bold">
            {records.length} record{records.length === 1 ? "" : "s"} · {ready} ready for export · {needsQc} need{needsQc === 1 ? "s" : ""} review ·{" "}
            {pending} pending sync
          </p>
          <p className="mt-0.5 text-xs opacity-60">{lastGeneratedAt ? `Last generated: ${lastGeneratedAt}` : "Not yet generated this session"}</p>
        </div>

        <p className="flex shrink-0 items-center gap-1.5 text-xs opacity-70">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-field-muted" />
          Exports exclude names, DOB, phone, address and GPS. Client IDs are generated, never personal.
        </p>

        {/* Sample-record controls — lets a presenter show a meaningful export
            preview without recording six real tests. Sample records are
            tagged demo_record=true and never mix with real ones. */}
        {records.length === 0 ? (
          <div className="field-card shrink-0">
            <p className="text-sm font-bold">No records yet</p>
            <p className="mt-1 text-xs opacity-70">Load the six sample records to preview both longlists. Samples are tagged demo_record and can be cleared at any time.</p>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" onClick={onLoadSampleRecords}>
              Load sample records
            </PrimaryButton>
          </div>
        ) : hasDemoRecords ? (
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-field-line px-3 py-2">
            <p className="text-xs opacity-70">Sample records loaded (demo_record = true)</p>
            <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={onClearSampleRecords}>
              Clear sample records
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-field-line px-3 py-2">
            <p className="text-xs opacity-70">Real records only — samples never mix with them</p>
            <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={onLoadSampleRecords}>
              Load sample records
            </button>
          </div>
        )}

        {/* shrink-0 so the export cards can never be clipped — the content column's fallback scroll keeps them reachable on tiny viewports. */}
        <div className="flex shrink-0 flex-col gap-2">
          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">OOXii Data Longlist</p>
              <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={() => setFieldsModal("longlist")}>
                Fields ({LONGLIST_CSV_COLUMNS.length})
              </button>
            </div>
            <p className="mt-1 text-xs leading-snug opacity-70">
              One row per test record. Summarises captured values, right/left lens data, optional test status, QC status and export readiness.
            </p>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={handleExportLonglist}>
              Export OOXii Data Longlist
            </PrimaryButton>
          </div>

          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">Full Audit Longlist</p>
              <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={() => setFieldsModal("audit")}>
                Fields ({AUDIT_CSV_COLUMNS.length})
              </button>
            </div>
            <p className="mt-1 text-xs leading-snug opacity-70">
              One row per captured field. Includes source, evidence quote, manual edits, QC reason and review status.
            </p>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={handleExportAudit}>
              Export Full Audit Longlist
            </PrimaryButton>
          </div>
        </div>

        {/* Preview — a readable subset on screen; the full column set only
            ever ships in the downloaded CSV. */}
        {records.length > 0 && (
          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">Preview</p>
              <div className="flex gap-1">
                {(
                  [
                    { id: "data", label: "Data preview" },
                    { id: "audit", label: "Audit preview" }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      previewMode === tab.id ? "border-[var(--gold)] text-[var(--gold)]" : "border-field-line opacity-60"
                    }`}
                    onClick={() => setPreviewMode(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {previewMode === "data" ? (
              <>
                <p className="mt-1 text-xs leading-snug opacity-70">
                  The operational view: what was captured, what still needs review, whether optional tests were performed, and whether each record is ready
                  to export. Optional tests read “Not tested” — never a blank — so skipped modules are distinguishable from failed capture.
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-field-line text-field-muted">
                        {DATA_PREVIEW_COLUMNS.map(({ label }) => (
                          <th key={label} className="whitespace-nowrap py-1.5 pr-3 font-bold">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataPreview.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-field-line/50">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="max-w-[140px] truncate whitespace-nowrap py-1.5 pr-3 opacity-85">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs leading-snug opacity-70">
                  The evidence and QC trail — not a medical validation report. Each field links to its source, evidence quote and QC reason, so
                  speech-to-text output is never treated as unquestioned truth. Showing the rows that need attention; the CSV carries every field.
                </p>
                <div className="mt-2 space-y-2.5">
                  {auditPreview.map(([recordId, entry]) => (
                    <div key={recordId}>
                      <p className="text-xs font-bold text-field-muted">
                        {recordId} · {entry.clientId}
                      </p>
                      <div className="mt-1 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <tbody>
                            {entry.rows.map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-b border-field-line/50">
                                <td className="whitespace-nowrap py-1.5 pr-3 opacity-60">{row.group}</td>
                                <td className="max-w-[130px] truncate whitespace-nowrap py-1.5 pr-3 font-bold opacity-85">{row.label}</td>
                                <td className="max-w-[110px] truncate whitespace-nowrap py-1.5 pr-3 opacity-85">{row.value}</td>
                                <td className="whitespace-nowrap py-1.5 pr-3 opacity-70">{row.status}</td>
                                <td className="max-w-[150px] truncate whitespace-nowrap py-1.5 opacity-60">{row.evidence || row.source}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {auditPreview.length === 0 && <p className="text-xs opacity-60">Every field in the loaded records is clean — nothing needs attention.</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <DetailModal open={fieldsModal === "longlist"} title={`OOXii Data Longlist fields (${LONGLIST_CSV_COLUMNS.length})`} onClose={() => setFieldsModal(null)}>
        <div className="space-y-4">
          <p className="text-xs opacity-70">One row per test record — the operational summary for council/NGO/OOXii reporting.</p>
          {LONGLIST_FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-bold text-field-muted">
                {group.title} ({group.fields.length})
              </p>
              <FieldChecklist fields={group.fields} />
            </div>
          ))}
        </div>
      </DetailModal>

      <DetailModal open={fieldsModal === "audit"} title={`Full Audit Longlist fields (${AUDIT_CSV_COLUMNS.length})`} onClose={() => setFieldsModal(null)}>
        <div className="space-y-4">
          <p className="text-xs opacity-70">
            One row per saved record <span className="font-bold">per field</span> — 6 records with 22 tracked fields produce 132 rows, not 6.
          </p>
          {AUDIT_FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-bold text-field-muted">
                {group.title} ({group.fields.length})
              </p>
              <FieldChecklist fields={group.fields} />
            </div>
          ))}
        </div>
      </DetailModal>
    </OneScreenShell>
  );
}
