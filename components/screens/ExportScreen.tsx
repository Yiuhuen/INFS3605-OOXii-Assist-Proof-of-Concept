"use client";

import { useState } from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import type { InsightTargetPage } from "@/lib/insights";
import { AUDIT_CSV_COLUMNS, LONGLIST_CSV_COLUMNS } from "@/lib/csv";
import { recordNeedsQc } from "@/lib/qc";
import { DangerButton, Disclosure, InfoCard, MetricCard, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ActionableInsightsPreview } from "@/components/screens/InsightsScreen";

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

/** Presentation-only grouping of AUDIT_CSV_COLUMNS for the collapsible sections below — keep in sync with lib/csv.ts if that list changes. */
const AUDIT_FIELD_GROUPS: Array<{ title: string; fields: readonly string[] }> = [
  { title: "Core test fields", fields: LONGLIST_CSV_COLUMNS },
  {
    title: "Transcript fields",
    fields: ["language", "raw_transcript_language", "raw_transcript_text", "english_processing_transcript", "corrected_transcript_text"]
  },
  {
    title: "QC and confidence fields",
    fields: ["confidence_score", "missing_fields", "edited_by_user", "requires_qc_verification", "unclear_segments", "has_unvisited_prompts"]
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
  onInsights,
  onInsightNavigate,
  onBack
}: {
  records: TestRecord[];
  isOnline: boolean;
  onExportLonglist: () => void;
  onExportAudit: () => void;
  onClear: () => void;
  onReviewQc: () => void;
  onInsights: () => void;
  onInsightNavigate: (target: InsightTargetPage) => void;
  onBack: () => void;
}) {
  const pending = records.filter((record) => record.sync_status === "Pending sync").length;
  const needsQc = records.filter(recordNeedsQc).length;
  const ready = records.length - needsQc;
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <section className="pb-8">
      <ScreenHeader title="Export records" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Download non-personal testing records for reporting, QC, and OOXii operations.</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <MetricCard value={records.length} label="Total records" />
        <MetricCard value={ready} label="Ready to export" tone="good" />
        <MetricCard value={needsQc} label="Needs QC" tone="danger" />
        <MetricCard value={pending} label="Pending sync" tone="gold" />
      </div>

      {needsQc > 0 && (
        <div className="mb-5">
          <WarningCard>Some records still require review before final reporting.</WarningCard>
        </div>
      )}

      <div className="space-y-6">
        <div className="field-card">
          <p className="font-bold">A. OOXii Data Longlist</p>
          <p className="mt-1 mb-4 text-sm opacity-70">
            Core operational dataset for stock, QC, and reporting. Includes captured test fields and statuses. No raw
            transcript text. Anonymous client IDs only.
          </p>
          <FieldChecklist fields={LONGLIST_CSV_COLUMNS} />
          <PrimaryButton fullWidth className="mt-5" icon={<Download className="h-5 w-5" />} disabled={records.length === 0} onClick={onExportLonglist}>
            Download OOXii Data Longlist
          </PrimaryButton>
        </div>

        <div className="field-card">
          <p className="font-bold">B. Full Non-Personal Audit Longlist</p>
          <p className="mt-1 mb-4 text-sm opacity-70">
            Full non-personal audit trail for QC review. Includes transcript versions, prompt markers, recording status,
            confidence flags, and timestamps. Anonymous IDs only.
          </p>

          <div className="divide-y divide-field-line">
            {AUDIT_FIELD_GROUPS.map((group) => (
              <Disclosure key={group.title} label={`${group.title} (${group.fields.length})`}>
                <FieldChecklist fields={group.fields} />
              </Disclosure>
            ))}
          </div>

          <div className="mt-4">
            <InfoCard icon={<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}>
              No names, DOB, phone numbers, addresses, or GPS are collected or exported.
            </InfoCard>
          </div>

          <PrimaryButton fullWidth className="mt-5" icon={<Download className="h-5 w-5" />} disabled={records.length === 0} onClick={onExportAudit}>
            Download Full Audit Longlist
          </PrimaryButton>
        </div>
      </div>

      {/* Insights follow the download actions — this screen's job is exporting;
          quality signals are supporting context, not the headline. */}
      <div className="mt-6">
        <ActionableInsightsPreview records={records} onNavigate={onInsightNavigate} onSeeAll={onInsights} />
      </div>

      <div className="mt-6 space-y-3">
        {needsQc > 0 && (
          <SecondaryButton fullWidth onClick={onReviewQc}>
            Review remaining QC records first
          </SecondaryButton>
        )}
        {confirmingClear ? (
          <div className="space-y-3 rounded-2xl border border-[var(--danger)] p-4">
            <WarningCard>
              This permanently deletes all {records.length} local demo record{records.length === 1 ? "" : "s"} and their
              audio from this device. This cannot be undone.
            </WarningCard>
            <div className="flex gap-3">
              <SecondaryButton fullWidth onClick={() => setConfirmingClear(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                fullWidth
                onClick={() => {
                  setConfirmingClear(false);
                  onClear();
                }}
              >
                Yes, delete all records
              </DangerButton>
            </div>
          </div>
        ) : (
          <DangerButton fullWidth disabled={records.length === 0} onClick={() => setConfirmingClear(true)}>
            Clear local demo records
          </DangerButton>
        )}
      </div>
    </section>
  );
}
