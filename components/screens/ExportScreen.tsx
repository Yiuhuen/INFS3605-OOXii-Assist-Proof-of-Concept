"use client";

import { Download } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { AUDIT_CSV_COLUMNS, LONGLIST_CSV_COLUMNS } from "@/lib/csv";
import { recordNeedsQc } from "@/lib/qc";
import { DangerButton, MetricCard, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

function readableColumn(column: string) {
  return column.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

function ColumnPreview({ columns }: { columns: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {columns.map((column) => (
        <span key={column} className="status-pill normal-case tracking-normal">
          {readableColumn(column)}
        </span>
      ))}
    </div>
  );
}

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

  return (
    <section>
      <ScreenHeader title="Export records" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Exports work fully offline and are saved to this device. Not a replacement for the main clinical database.</p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <MetricCard value={records.length} label="Total records" />
        <MetricCard value={pending} label="Pending sync" tone="gold" />
        <MetricCard value={needsQc} label="Needs QC" tone="danger" />
        <MetricCard value={ready} label="Ready to export" />
      </div>

      {needsQc > 0 && (
        <div className="mb-5">
          <WarningCard>{needsQc} record{needsQc === 1 ? "" : "s"} still need QC review before this export is clean.</WarningCard>
        </div>
      )}

      <div className="field-card mb-4">
        <p className="font-bold">A. OOXii Data Longlist</p>
        <p className="mt-1 mb-3 text-xs opacity-60">
          Core operational dataset: captured fields, statuses, and client snapshot for QC and reporting. No raw transcript
          text. Anonymous client IDs only — no name, DOB, phone, address, or GPS is ever collected.
        </p>
        <ColumnPreview columns={LONGLIST_CSV_COLUMNS} />
        <PrimaryButton fullWidth className="mt-4" icon={<Download className="h-5 w-5" />} disabled={records.length === 0} onClick={onExportLonglist}>
          Download OOXii Data Longlist
        </PrimaryButton>
      </div>

      <div className="field-card mb-5">
        <p className="font-bold">B. Full Non-Personal Audit Longlist</p>
        <p className="mt-1 mb-3 text-xs opacity-60">
          Fuller audit trail — includes the actual transcript content (raw, English processing copy, corrected), segment
          and prompt-marker detail, and recording timestamps. Still anonymous-ID only.
        </p>
        <ColumnPreview columns={AUDIT_CSV_COLUMNS} />
        <PrimaryButton fullWidth className="mt-4" icon={<Download className="h-5 w-5" />} disabled={records.length === 0} onClick={onExportAudit}>
          Download Audit Longlist
        </PrimaryButton>
      </div>

      <div className="space-y-3">
        {needsQc > 0 && (
          <SecondaryButton fullWidth onClick={onReviewQc}>
            Review remaining QC records first
          </SecondaryButton>
        )}
        <DangerButton fullWidth disabled={records.length === 0} onClick={onClear}>
          Clear local demo records
        </DangerButton>
      </div>
    </section>
  );
}
