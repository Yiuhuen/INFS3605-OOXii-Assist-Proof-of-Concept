"use client";

import { useState } from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { AUDIT_CSV_COLUMNS, LONGLIST_CSV_COLUMNS } from "@/lib/csv";
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

/**
 * Presentation-only grouping of AUDIT_CSV_COLUMNS for the "included fields"
 * detail modal — keep in sync with lib/csv.ts if that list changes. This
 * export is long/tidy format: one row per record PER FIELD (see the note
 * rendered above the groups below), so these columns describe a single
 * field-row, not a whole record.
 */
const AUDIT_FIELD_GROUPS: Array<{ title: string; fields: readonly string[] }> = [
  { title: "Record identity", fields: ["record_id", "anonymous_client_id", "demo_record", "created_at", "outreach_session", "tester_label", "language_pack"] },
  { title: "Field-level evidence", fields: ["field_name", "field_value", "field_source", "field_confidence", "field_status", "evidence_quote"] },
  { title: "Review flags", fields: ["manually_edited", "requires_review", "qc_reason"] },
  { title: "Prompt coverage", fields: ["prompt_step_id", "prompt_viewed", "prompt_recorded"] },
  { title: "Recording and sync", fields: ["recording_mode", "transcript_available", "saved_locally", "sync_status", "export_ready"] }
];

export function ExportScreen({
  records,
  isOnline,
  onExportLonglist,
  onExportAudit,
  onClear,
  onReviewQc,
  onBack
}: {
  records: TestRecord[];
  isOnline: boolean;
  onExportLonglist: () => void;
  onExportAudit: () => void;
  onClear: () => void;
  onReviewQc: () => void;
  onBack: () => void;
}) {
  const pending = records.filter((record) => record.sync_status === "Pending sync").length;
  const needsQc = records.filter(recordNeedsQc).length;
  const ready = records.length - needsQc;
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [fieldsModal, setFieldsModal] = useState<"longlist" | "audit" | null>(null);
  /** Set only when a download actually fires this session — never pre-filled, so "Not yet generated" is honest until a real export happens. */
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

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
      header={<CompactHeader title="Export" onBack={onBack} isOnline={isOnline} />}
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
              Clear local demo records
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
            {records.length} record{records.length === 1 ? "" : "s"} · {ready} ready for export · {needsQc} need{needsQc === 1 ? "s" : ""} QC ·{" "}
            {pending} pending sync
          </p>
          <p className="mt-0.5 text-xs opacity-60">{lastGeneratedAt ? `Last generated: ${lastGeneratedAt}` : "Not yet generated this session"}</p>
        </div>

        <p className="flex shrink-0 items-center gap-1.5 text-xs opacity-70">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-field-muted" />
          Exports exclude names, DOB, phone, address and GPS.
        </p>

        {/* shrink-0 so the export cards can never be clipped — the content column's fallback scroll keeps them reachable on tiny viewports. */}
        <div className="flex shrink-0 flex-col gap-2">
          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">OOXii Data Longlist</p>
              <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={() => setFieldsModal("longlist")}>
                Fields ({LONGLIST_CSV_COLUMNS.length})
              </button>
            </div>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={handleExportLonglist}>
              Export OOXii Data Longlist
            </PrimaryButton>
            <p className="mt-1.5 line-clamp-1 text-xs opacity-70">One row per record.</p>
          </div>

          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">Full Audit Longlist</p>
              <button
                className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                onClick={() => setFieldsModal("audit")}
              >
                Fields ({AUDIT_CSV_COLUMNS.length})
              </button>
            </div>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={handleExportAudit}>
              Export Full Audit Longlist
            </PrimaryButton>
            <p className="mt-1.5 line-clamp-1 text-xs opacity-70">One row per field with evidence and QC trail.</p>
          </div>
        </div>
      </div>

      <DetailModal open={fieldsModal === "longlist"} title={`OOXii Data Longlist fields (${LONGLIST_CSV_COLUMNS.length})`} onClose={() => setFieldsModal(null)}>
        <FieldChecklist fields={LONGLIST_CSV_COLUMNS} />
      </DetailModal>

      <DetailModal open={fieldsModal === "audit"} title="Full Audit Longlist fields" onClose={() => setFieldsModal(null)}>
        <div className="space-y-4">
          <p className="text-xs opacity-70">
            One row per saved record <span className="font-bold">per field</span> — a 12-record test set with 8 tracked
            fields produces 96 rows, not 12.
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
