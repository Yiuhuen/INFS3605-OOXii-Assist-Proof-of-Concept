"use client";

import { Download } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { CSV_COLUMNS } from "@/lib/csv";
import { recordNeedsQc } from "@/lib/qc";
import { DangerButton, MetricCard, PrimaryButton, SecondaryButton, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

function readableColumn(column: string) {
  return column.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

export function ExportScreen({
  records,
  isOnline,
  onExport,
  onClear,
  onReviewQc,
  onBack
}: {
  records: TestRecord[];
  isOnline: boolean;
  onExport: () => void;
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
      <p className="mb-5 text-sm opacity-70">Exports a CSV longlist for QC and reporting. Not a replacement for the main clinical database.</p>

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

      <div className="field-card mb-5">
        <p className="mb-3 font-bold">Column preview</p>
        <div className="flex flex-wrap gap-2">
          {CSV_COLUMNS.map((column) => (
            <span key={column} className="status-pill normal-case tracking-normal">
              {readableColumn(column)}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <PrimaryButton fullWidth icon={<Download className="h-5 w-5" />} disabled={records.length === 0} onClick={onExport}>
          Download CSV
        </PrimaryButton>
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
