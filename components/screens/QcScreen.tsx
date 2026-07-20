"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { ExtractedFields, TestRecord } from "@/lib/types";
import { filterRecords, processingStatusLabel, processingStatusTone, qcFilters, qcReasons, type QcFilter } from "@/lib/qc";
import { Disclosure, EmptyState, PrimaryButton, SecondaryButton, StatusBadge, TextAreaField, type BadgeTone } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const RISK_TONE: Record<"low" | "medium" | "high", BadgeTone> = { low: "good", medium: "warn", high: "danger" };
const SEVERITY_TONE: Record<"info" | "warning" | "critical", BadgeTone> = { info: "neutral", warning: "warn", critical: "danger" };

export function QcScreen({
  records,
  latestRecordId,
  qcAudioUrl,
  isOnline,
  loadQcAudio,
  updateRecord,
  updateNotes,
  markComplete,
  onBack
}: {
  records: TestRecord[];
  latestRecordId: string | null;
  qcAudioUrl: string;
  isOnline: boolean;
  loadQcAudio: (record: TestRecord) => void;
  updateRecord: (record: TestRecord, patch: Partial<ExtractedFields>) => void;
  updateNotes: (record: TestRecord, notes: string) => void;
  markComplete: (record: TestRecord) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<QcFilter>("needs_qc");
  const filtered = useMemo(() => filterRecords(records, filter), [records, filter]);
  const [selectedId, setSelectedId] = useState(latestRecordId ?? filtered[0]?.id ?? "");
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!filtered.some((record) => record.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selected) loadQcAudio(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const effective = selected ? selected.edited_extracted_json ?? selected.extracted_json : null;
  const correctedTranscriptDiffers = selected
    ? selected.corrected_transcript_text.trim().length > 0 && selected.corrected_transcript_text.trim() !== selected.raw_transcript_text.trim()
    : false;

  return (
    <section>
      <ScreenHeader title="QC Review" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">Review records with missing, edited, low-confidence, or unresolved information before export.</p>

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
                  <span className="text-xs opacity-60">
                    {new Date(record.created_at).toLocaleDateString([], { day: "2-digit", month: "short" })} ·{" "}
                    {new Date(record.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge label={processingStatusLabel(record.processing_status)} tone={processingStatusTone(record.processing_status)} />
                  <StatusBadge label={`${Math.round(record.confidence_score * 100)}% confidence`} tone={record.confidence_score < 0.7 ? "warn" : "good"} />
                  {record.missing_fields.length > 0 && <StatusBadge label={`${record.missing_fields.length} missing`} tone="warn" />}
                  {record.edited_by_user && <StatusBadge label="Edited" tone="warn" />}
                  {record.recording_status !== "recorded" && <StatusBadge label="Recording issue" tone="warn" />}
                  {record.sync_status === "Pending sync" && <StatusBadge label="Pending sync" tone="warn" />}
                  {record.sync_status === "Failed" && <StatusBadge label="Sync failed" tone="danger" />}
                  {record.qc_status === "Approved" ? <StatusBadge label="Complete" tone="good" /> : <StatusBadge label="Needs QC" tone="danger" />}
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 text-xs font-bold text-[var(--gold)]">
                  Review record
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && effective && (
        <div className="field-card space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={processingStatusLabel(selected.processing_status)} tone={processingStatusTone(selected.processing_status)} />
            <StatusBadge
              label={`${Math.round(selected.confidence_score * 100)}% confidence`}
              tone={selected.confidence_score < 0.7 ? "warn" : "good"}
            />
            {qcReasons(selected).map((reason) => (
              <StatusBadge key={reason} label={reason} tone="warn" />
            ))}
          </div>

          {selected.manual_override_reason.trim() && (
            <div className="rounded-2xl border border-field-line bg-field-surface p-3 text-sm">
              <span className="font-bold">Manual override reason:</span> {selected.manual_override_reason.trim()}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="field-label mb-0">Audio record</p>
              <StatusBadge
                label={`${Math.floor(selected.recording_duration_seconds / 60)
                  .toString()
                  .padStart(2, "0")}:${Math.floor(selected.recording_duration_seconds % 60)
                  .toString()
                  .padStart(2, "0")}`}
                tone="neutral"
              />
            </div>
            {qcAudioUrl ? (
              <audio className="mt-2 w-full" controls src={qcAudioUrl} />
            ) : (
              <p className="mt-2 text-sm opacity-60">No audio available for this record.</p>
            )}
            {(selected.recording_started_at || selected.recording_stopped_at) && (
              <p className="mt-2 text-xs opacity-60">
                {selected.recording_started_at && `Started ${new Date(selected.recording_started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                {selected.recording_started_at && selected.recording_stopped_at && " · "}
                {selected.recording_stopped_at && `Stopped ${new Date(selected.recording_stopped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
          </div>

          {selected.unclear_segments.length > 0 && (
            <div>
              <p className="field-label">Unclear sections ({selected.unclear_segments.length})</p>
              <div className="space-y-1.5">
                {selected.unclear_segments.map((segment) => (
                  <p key={segment.id} className="text-sm opacity-80">
                    <span className="mr-2 text-xs font-bold tabular-nums opacity-50">
                      {new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {segment.note}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="field-label mb-0">Original transcript</p>
              <StatusBadge label="Preserved" tone="good" />
            </div>
            <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">{selected.raw_transcript_text}</pre>
          </div>

          {selected.english_processing_transcript && (
            <div>
              <p className="field-label">English processing copy</p>
              <pre className="ink-panel max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">{selected.english_processing_transcript}</pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="field-label mb-0">Corrected transcript</p>
              {!correctedTranscriptDiffers && <StatusBadge label="Same as processing copy" tone="neutral" />}
            </div>
            <pre className="ink-panel mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm opacity-90">
              {selected.corrected_transcript_text || "No corrected transcript recorded."}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="field-label mb-0">Transcript quality</p>
              <StatusBadge label={`Risk: ${selected.transcript_quality_risk}`} tone={RISK_TONE[selected.transcript_quality_risk]} />
              {selected.translation_review_required && <StatusBadge label="Translation requires review" tone="warn" />}
              {selected.extraction_safety_status === "draft_review_required" && <StatusBadge label="Draft extraction — requires review" tone="warn" />}
            </div>
            {selected.transcript_quality_flags.length === 0 ? (
              <p className="text-sm opacity-60">No transcript quality flags were raised for this record.</p>
            ) : (
              <Disclosure label={`Quality flags (${selected.transcript_quality_flags.length})`} defaultOpen>
                <div className="space-y-3">
                  {selected.transcript_quality_flags.map((flag) => (
                    <div key={flag.id} className="rounded-xl border border-field-line bg-field-surface p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge label={flag.type.replaceAll("_", " ")} tone={SEVERITY_TONE[flag.severity]} />
                        {selected.unresolved_transcript_flag_ids.includes(flag.id) ? (
                          <StatusBadge label="Unresolved" tone="warn" />
                        ) : (
                          <StatusBadge label="Correction applied" tone="good" />
                        )}
                      </div>
                      <p>
                        Detected: &ldquo;{flag.originalText}&rdquo;
                        {flag.suggestedText && (
                          <>
                            {" "}
                            → Suggested: &ldquo;{flag.suggestedText}&rdquo;
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs opacity-60">{flag.reason}</p>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}
            {selected.corrections_applied.length > 0 && (
              <div className="mt-3">
                <Disclosure label={`Corrections applied (${selected.corrections_applied.length})`}>
                  <div className="space-y-2">
                    {selected.corrections_applied.map((correction) => (
                      <p key={correction.id} className="text-sm opacity-80">
                        &ldquo;{correction.originalText}&rdquo; → &ldquo;{correction.suggestedText}&rdquo; — applied {new Date(correction.appliedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {correction.affectsClinicalMeaning && <span className="ml-2 text-xs font-bold text-[var(--danger)]">Clinical</span>}
                      </p>
                    ))}
                  </div>
                </Disclosure>
              </div>
            )}
          </div>

          <div>
            <p className="field-label">Review captured fields</p>
            <p className="mb-3 text-xs opacity-60">Missing fields are highlighted. Editing here flags the record as edited for verification.</p>
            <div className="space-y-3">
              {(Object.entries(effective) as Array<[string, string | number | string[]]>)
                .filter(([key]) => key !== "missing_fields" && key !== "confidence_score" && key !== "field_confidence")
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

          <div>
            <TextAreaField
              label="QC notes"
              value={selected.qc_notes}
              onChange={(event) => updateNotes(selected, event.target.value)}
              placeholder="Optional — notes for other reviewers about this record's QC decision"
              rows={2}
            />
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
