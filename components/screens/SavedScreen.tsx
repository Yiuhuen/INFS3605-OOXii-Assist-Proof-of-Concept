"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, Clock, Plus } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { processingStatusLabel, processingStatusTone, qcStatusLabel } from "@/lib/qc";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@/components/ui";

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
    record.sync_status === "Pending sync" ? "Saved offline" : record.sync_status === "Failed" ? "Saved locally" : "Record saved";
  const savedDetail =
    record.sync_status === "Synced" ? "Record is ready for review and export." : "Record is safe on this phone.";

  return (
    <section className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--good-bg)] text-[var(--good)]">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="text-2xl font-black">{savedTitle}</h1>
      <p className="mt-2 opacity-70">{savedDetail}</p>

      <div className="field-card mt-6 space-y-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-70">Client ID</span>
          <span className="font-bold text-[var(--gold)]">{record.client_id}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-70">Time saved</span>
          <span className="font-bold">{new Date(record.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="h-px bg-field-line" />
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-70">Sync status</span>
          <StatusBadge
            label={record.sync_status === "Synced" && !isSupabaseConfigured ? "Saved locally" : record.sync_status}
            tone={record.sync_status === "Synced" ? "good" : "warn"}
            icon={<Clock className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-70">QC status</span>
          <StatusBadge
            label={qcStatusLabel(record.qc_status)}
            tone={record.qc_status === "Approved" ? "good" : "warn"}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-70">Processing status</span>
          <StatusBadge label={processingStatusLabel(record.processing_status)} tone={processingStatusTone(record.processing_status)} />
        </div>
      </div>

      <p className="mt-4 text-sm opacity-60">
        {syncMessage || "This record will sync automatically when a connection is available. You can keep testing offline."}
      </p>

      <div className="mt-6 space-y-3">
        <PrimaryButton fullWidth icon={<Plus className="h-5 w-5" />} onClick={onNextClient}>
          Start next client
        </PrimaryButton>
        <div className="grid grid-cols-2 gap-3">
          <SecondaryButton icon={<AlertTriangle className="h-4 w-4" />} onClick={onQc}>
            QC Review
          </SecondaryButton>
          <SecondaryButton icon={<ChevronLeft className="h-4 w-4" />} onClick={onDashboard}>
            Home
          </SecondaryButton>
        </div>
      </div>
    </section>
  );
}
