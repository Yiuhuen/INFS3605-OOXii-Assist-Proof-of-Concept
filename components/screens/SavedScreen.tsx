"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, Plus } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { processingStatusLabel, processingStatusTone, qcStatusLabel, syncStatusLabel } from "@/lib/qc";
import { PrimaryButton, SecondaryButton, StatusDot } from "@/components/ui";
import { OneScreenShell, BottomActionBar } from "@/components/layout/OneScreenShell";

export function SavedScreen({
  record,
  syncMessage,
  onNextClient,
  onQc,
  onDashboard
}: {
  record: TestRecord;
  syncMessage: string;
  onNextClient: () => void;
  onQc: () => void;
  onDashboard: () => void;
}) {
  const savedTitle =
    record.sync_status === "Pending sync"
      ? "Saved offline"
      : record.sync_status === "Failed" || record.sync_status === "Local only"
        ? "Saved locally"
        : "Record saved";
  const processingIncomplete = record.processing_status === "not_processed" || record.processing_status === "needs_qc";
  const qcRequired = record.qc_status !== "Approved";

  return (
    <OneScreenShell
      header={null}
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          <p className="line-clamp-1 text-center text-xs opacity-60">{syncMessage || "Syncs automatically when online — keep testing offline."}</p>
          <PrimaryButton fullWidth className="py-2.5 text-sm" icon={<Plus className="h-4 w-4" />} onClick={onNextClient}>
            Start next client
          </PrimaryButton>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton className="py-2 text-sm" icon={<AlertTriangle className="h-4 w-4" />} onClick={onQc}>
              QC Review
            </SecondaryButton>
            <SecondaryButton className="py-2 text-sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={onDashboard}>
              Home
            </SecondaryButton>
          </div>
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto text-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--good-bg)] text-[var(--good)]">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-black">{savedTitle}</h1>
          <p className="mt-1 line-clamp-1 text-sm opacity-70">Client {record.client_id} — audio and answers stored on this phone.</p>
        </div>

        {/* One status dot per row, same vocabulary as QC's record summary — never a stack of pills. */}
        <div className="field-card w-full space-y-2 text-left text-sm">
          <div className="flex items-center justify-between">
            <span className="opacity-70">Sync status</span>
            <StatusDot label={syncStatusLabel(record.sync_status)} tone={record.sync_status === "Synced" ? "good" : "warn"} />
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-70">QC status</span>
            <StatusDot label={qcStatusLabel(record.qc_status)} tone={record.qc_status === "Approved" ? "good" : "warn"} />
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-70">Processing</span>
            <StatusDot label={processingStatusLabel(record.processing_status)} tone={processingStatusTone(record.processing_status)} />
          </div>
        </div>

        {(processingIncomplete || qcRequired) && (
          <p className="line-clamp-2 text-xs font-semibold text-[var(--warn)]">
            {processingIncomplete ? "Processing incomplete — " : ""}
            {qcRequired ? "QC required before final reporting." : ""}
          </p>
        )}
      </div>
    </OneScreenShell>
  );
}
