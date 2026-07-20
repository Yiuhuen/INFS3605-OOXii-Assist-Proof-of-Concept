"use client";

import { Save, Zap } from "lucide-react";
import type { ExtractedFields, ProcessingStatus } from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { FormField, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, WarningCard } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const FIELD_LABELS: Record<keyof Omit<ExtractedFields, "missing_fields" | "confidence_score">, string> = {
  right_eye_distance_result: "Right eye distance result",
  left_eye_distance_result: "Left eye distance result",
  final_readable_line: "Final readable line",
  glasses_selected: "Glasses selected",
  comfort_response: "Comfort response",
  cataract_history_confirmed: "Cataract history confirmed",
  current_glasses: "Current glasses",
  additional_notes: "Additional notes"
};

export function CapturedFieldsScreen({
  clientId,
  extracted,
  editedFields,
  processingStatus,
  isOnline,
  onEditField,
  onBackToTranscript,
  onSave
}: {
  clientId: string;
  extracted: ExtractedFields;
  editedFields: ExtractedFields | null;
  processingStatus: ProcessingStatus;
  isOnline: boolean;
  onEditField: (key: keyof ExtractedFields, value: string) => void;
  onBackToTranscript: () => void;
  onSave: () => void;
}) {
  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields);

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
        {qcRequired && <StatusBadge label="Needs QC" tone="danger" />}
      </div>

      <div className="space-y-4">
        {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((key) => {
          const missing = effective.missing_fields.includes(key);
          return (
            <FormField
              key={key}
              label={FIELD_LABELS[key]}
              className={missing ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}
              value={effective[key]}
              placeholder={missing ? "Not captured" : undefined}
              onChange={(event) => onEditField(key, event.target.value)}
            />
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
