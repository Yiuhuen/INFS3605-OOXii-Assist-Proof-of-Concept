"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ExtractedFields, TestRecord } from "@/lib/types";
import { filterRecords, qcFilters, qcReasons, type QcFilter } from "@/lib/qc";
import { EmptyState, PrimaryButton, SecondaryButton, StatusBadge, TextAreaField } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

export function QcScreen({
  records,
  latestRecordId,
  qcAudioUrl,
  isOnline,
  loadQcAudio,
  updateRecord,
  markComplete,
  onBack
}: {
  records: TestRecord[];
  latestRecordId: string | null;
  qcAudioUrl: string;
  isOnline: boolean;
  loadQcAudio: (record: TestRecord) => void;
  updateRecord: (record: TestRecord, patch: Partial<ExtractedFields>) => void;
  markComplete: (record: TestRecord) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<QcFilter>("needs_qc");
  const filtered = filterRecords(records, filter);
  const [selectedId, setSelectedId] = useState(latestRecordId ?? filtered[0]?.id ?? "");
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];

  useEffect(() => {
    if (selected) loadQcAudio(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const effective = selected ? selected.edited_extracted_json ?? selected.extracted_json : null;
  const transcriptDiffers = selected
    ? selected.corrected_transcript_text.trim().length > 0 && selected.corrected_transcript_text.trim() !== selected.raw_transcript_text.trim()
    : false;

  return (
    <section>
      <ScreenHeader title="QC Review" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Check records with missing, edited, or low-confidence fields before export.</p>

      <div className="mb-5 flex flex-wrap gap-2">
        {qcFilters.map((option) => (
          <button
            key={option.id}
            className={filter === option.id ? "primary-button py-2 text-sm" : "secondary-button py-2 text-sm"}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <EmptyState title="No records match this filter" detail="Try a different filter or complete a test first." />}

      {filtered.length > 0 && (
        <div className="mb-6 space-y-2">
          {filtered.map((record) => {
            const isSelected = selected?.id === record.id;
            return (
              <button
                key={record.id}
                onClick={() => setSelectedId(record.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  isSelected ? "border-[var(--gold)] bg-field-card" : "border-field-line bg-field-card hover:bg-field-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{record.client_id}</span>
                  <span className="text-xs opacity-60">{new Date(record.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge label={`${Math.round(record.confidence_score * 100)}% confidence`} tone={record.confidence_score < 0.7 ? "warn" : "good"} />
                  {record.edited_by_user && <StatusBadge label="Edited" tone="warn" />}
                  {record.sync_status === "Pending sync" && <StatusBadge label="Pending sync" tone="warn" />}
                  {record.qc_status === "Approved" ? <StatusBadge label="Complete" tone="good" /> : <StatusBadge label="Needs QC" tone="danger" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && effective && (
        <div className="field-card space-y-5">
          <div className="flex flex-wrap gap-2">
            {qcReasons(selected).map((reason) => (
              <StatusBadge key={reason} label={reason} tone="warn" />
            ))}
          </div>

          {qcAudioUrl ? (
            <audio className="w-full" controls src={qcAudioUrl} />
          ) : (
            <p className="text-sm opacity-60">No audio available for this record.</p>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="field-label mb-0">Original transcript</p>
              <StatusBadge label="Preserved" tone="good" />
            </div>
            <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">{selected.raw_transcript_text}</pre>
          </div>

          {transcriptDiffers && (
            <div>
              <p className="field-label">Corrected transcript</p>
              <pre className="ink-panel max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">{selected.corrected_transcript_text}</pre>
            </div>
          )}

          <div>
            <p className="field-label">Review captured fields</p>
            <p className="mb-3 text-xs opacity-60">Missing fields are highlighted. Editing here flags the record as edited for verification.</p>
            <div className="space-y-3">
              {(Object.entries(effective) as Array<[string, string | number | string[]]>)
                .filter(([key]) => key !== "missing_fields" && key !== "confidence_score")
                .map(([key, value]) => {
                  const missing = selected.missing_fields.includes(key);
                  return (
                    <TextAreaField
                      key={key}
                      label={key.replaceAll("_", " ")}
                      className={missing ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}
                      value={String(value)}
                      onChange={(event) => updateRecord(selected, { [key]: event.target.value } as Partial<ExtractedFields>)}
                      rows={2}
                    />
                  );
                })}
            </div>
          </div>

          {selected.qc_status !== "Approved" ? (
            <PrimaryButton fullWidth icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => markComplete(selected)}>
              Mark complete
            </PrimaryButton>
          ) : (
            <StatusBadge label="QC complete" tone="good" />
          )}
        </div>
      )}

      <SecondaryButton fullWidth className="mt-5" onClick={onBack}>
        Back to dashboard
      </SecondaryButton>
    </section>
  );
}
