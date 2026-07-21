"use client";

import { Save, ShieldAlert, Zap } from "lucide-react";
import type { ExtractedFields, ExtractionSafetyStatus, FieldConfidenceLevel, ManualExtractedFields, ProcessingStatus } from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import { InfoCard, PrimaryButton, SecondaryButton, StatusBadge, WarningCard, type BadgeTone } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const FIELD_LABELS: Record<keyof Omit<ExtractedFields, "missing_fields" | "confidence_score" | "field_confidence">, string> = {
  right_eye_distance_result: "Right eye distance result",
  left_eye_distance_result: "Left eye distance result",
  final_readable_line: "Final readable line",
  glasses_selected: "Glasses selected",
  comfort_response: "Comfort response",
  cataract_history_confirmed: "Cataract history confirmed",
  current_glasses: "Current glasses",
  additional_notes: "Additional notes"
};

const HIGH_RISK_FIELD_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript", string> = {
  manual: "Manual entry",
  transcript: "Transcript",
  corrected_transcript: "Corrected transcript"
};

const CONFIDENCE_TONE: Record<FieldConfidenceLevel, BadgeTone> = {
  high: "good",
  medium: "neutral",
  low: "warn",
  unknown: "warn"
};

export function CapturedFieldsScreen({
  clientId,
  extracted,
  editedFields,
  processingStatus,
  isOnline,
  onEditField,
  onBackToTranscript,
  onSave,
  extractionSafetyStatus
}: {
  clientId: string;
  extracted: ExtractedFields;
  editedFields: ExtractedFields | null;
  processingStatus: ProcessingStatus;
  isOnline: boolean;
  onEditField: (key: keyof ExtractedFields, value: string) => void;
  onBackToTranscript: () => void;
  onSave: () => void;
  /** "draft_review_required" when the transcript/translation this extraction is based on was flagged uncertain — see lib/transcriptQuality.ts deriveExtractionSafetyStatus. */
  extractionSafetyStatus: ExtractionSafetyStatus;
}) {
  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields) || extractionSafetyStatus === "draft_review_required";

  return (
    <section>
      <ScreenHeader title="Review captured fields" subtitle={clientId} onBack={onBackToTranscript} isOnline={isOnline} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
        <span className={`status-pill normal-case tracking-normal ${lowConfidence ? "badge-warn" : "badge-good"}`}>
          <Zap className="h-3.5 w-3.5" />
          Capture confidence: {Math.round(effective.confidence_score * 100)}%
        </span>
        {editedFields && <StatusBadge label="Edited — verify in QC" tone="warn" />}
        {/* processingStatusLabel already reads "Needs QC" in danger tone once processingStatus is "needs_qc" — only add this badge when it says something else (e.g. a not-yet-processed draft) so the same risk isn't shown twice. */}
        {qcRequired && processingStatus !== "needs_qc" && <StatusBadge label="Needs QC" tone="danger" />}
      </div>

      {extractionSafetyStatus === "draft_review_required" && (
        <div className="mb-5">
          <WarningCard icon={<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}>
            Draft extraction — requires review. These fields were drafted from a transcript flagged with quality or
            translation risk; verify each one against the audio before treating it as correct.
          </WarningCard>
        </div>
      )}

      <div className="space-y-4">
        {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((key) => {
          const missing = effective.missing_fields.includes(key);
          const fieldMeta = effective.field_confidence?.[key as keyof ManualExtractedFields];
          const flagConfidence = fieldMeta && (fieldMeta.confidence === "low" || fieldMeta.confidence === "unknown");
          const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
          return (
            <label key={key} className={`block ${missing || flagConfidence ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}`}>
              <span className="field-label flex flex-wrap items-center gap-2">
                {FIELD_LABELS[key]}
                {isHighRisk && <StatusBadge label="High-risk field" tone="neutral" icon={<ShieldAlert className="h-3.5 w-3.5" />} />}
              </span>
              <input
                className="field-input"
                value={effective[key]}
                placeholder={missing ? "Not captured" : undefined}
                onChange={(event) => onEditField(key, event.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {fieldMeta && <StatusBadge label={`Source: ${SOURCE_LABELS[fieldMeta.source]}`} tone="neutral" />}
                {fieldMeta && <StatusBadge label={`Confidence: ${fieldMeta.confidence}`} tone={CONFIDENCE_TONE[fieldMeta.confidence]} />}
                {fieldMeta?.requiresReview && <StatusBadge label="Review required" tone="warn" />}
              </div>
              {fieldMeta?.reason && flagConfidence && <p className="mt-1 text-xs opacity-60">{fieldMeta.reason}</p>}
            </label>
          );
        })}
      </div>

      {effective.missing_fields.length > 0 && (
        <div className="mt-3">
          <WarningCard>
            Missing: {effective.missing_fields.map((key) => FIELD_LABELS[key as keyof typeof FIELD_LABELS] ?? key).join(", ")}
          </WarningCard>
        </div>
      )}

      <div className="mt-5">
        <InfoCard>Editing fields does not change the source transcript. Edited fields are flagged for QC review.</InfoCard>
      </div>

      <PrimaryButton fullWidth className="mt-6" icon={<Save className="h-5 w-5" />} onClick={onSave}>
        Save record
      </PrimaryButton>
      <SecondaryButton fullWidth className="mt-3" onClick={onBackToTranscript}>
        Back to transcript
      </SecondaryButton>
    </section>
  );
}
