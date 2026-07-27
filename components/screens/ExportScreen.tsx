"use client";

import { useState } from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { LONGLIST_CSV_COLUMNS } from "@/lib/csv";
import { recordNeedsQc } from "@/lib/qc";
import { DangerButton, DetailModal, MetricCard, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
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

/** Presentation-only grouping of AUDIT_CSV_COLUMNS for the "included fields" detail modal — keep in sync with lib/csv.ts if that list changes. */
const AUDIT_FIELD_GROUPS: Array<{ title: string; fields: readonly string[] }> = [
  { title: "Core test fields", fields: LONGLIST_CSV_COLUMNS },
  {
    title: "Transcript fields",
    fields: ["language", "raw_transcript_language", "raw_transcript_text", "english_processing_transcript", "corrected_transcript_text"]
  },
  {
    title: "QC and confidence fields",
    fields: [
      "confidence_score",
      "missing_fields",
      "edited_by_user",
      "requires_qc_verification",
      "unclear_segments",
      "has_unvisited_prompts",
      "demo_helper_used"
    ]
  },
  { title: "Recording fields", fields: ["recording_status", "manual_override_reason", "prompt_markers"] },
  { title: "Sync and timestamp fields", fields: ["processing_status", "sync_attempts", "created_at", "updated_at"] }
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
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <MetricCard value={records.length} label="Total records" />
          <MetricCard value={ready} label="Ready to export" tone="good" />
          <MetricCard value={needsQc} label="Needs QC" tone="danger" />
          <MetricCard value={pending} label="Pending sync" tone="gold" />
        </div>

        {needsQc > 0 && (
          <div className="shrink-0">
            <WarningCard>
              <span className="line-clamp-1">Some records still require review before final reporting.</span>
            </WarningCard>
          </div>
        )}

        {/* shrink-0 so the export cards can never be clipped — the content column's fallback scroll keeps them reachable on tiny viewports. */}
        <div className="flex shrink-0 flex-col gap-2">
          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">A. OOXii Data Longlist</p>
              <button className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline" onClick={() => setFieldsModal("longlist")}>
                Fields ({LONGLIST_CSV_COLUMNS.length})
              </button>
            </div>
            <p className="mt-1 line-clamp-2 text-xs opacity-70">Core operational dataset — no raw transcript text, anonymous IDs only.</p>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={onExportLonglist}>
              Download Longlist
            </PrimaryButton>
          </div>

          <div className="field-card shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm font-bold">B. Full Audit Longlist</p>
              <button
                className="shrink-0 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                onClick={() => setFieldsModal("audit")}
              >
                Fields
              </button>
            </div>
            <p className="mt-1 line-clamp-2 text-xs opacity-70">Full non-personal audit trail — transcripts, markers, confidence flags, timestamps.</p>
            <PrimaryButton fullWidth className="mt-2 py-2 text-sm" icon={<Download className="h-4 w-4" />} disabled={records.length === 0} onClick={onExportAudit}>
              Download Audit Longlist
            </PrimaryButton>
          </div>
        </div>
      </div>

      <DetailModal open={fieldsModal === "longlist"} title={`OOXii Data Longlist fields (${LONGLIST_CSV_COLUMNS.length})`} onClose={() => setFieldsModal(null)}>
        <FieldChecklist fields={LONGLIST_CSV_COLUMNS} />
      </DetailModal>

      <DetailModal open={fieldsModal === "audit"} title="Full Audit Longlist fields" onClose={() => setFieldsModal(null)}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-field-line bg-field-surface p-3">
            <p className="flex items-center gap-1.5 text-xs opacity-80">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              No names, DOB, phone numbers, addresses, or GPS are collected or exported.
            </p>
          </div>
          {AUDIT_FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-field-muted">
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
