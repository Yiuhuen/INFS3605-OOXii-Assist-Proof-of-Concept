import type { ExtractedFields } from "./types";

export const demoTranscript = `Tester: Please cover your left eye and read the smallest line you can see.
Client: I can read line 6 with the right eye and line 7 with the left eye. I have not had cataract surgery.
Tester: Do you currently have glasses?
Client: No. The trial glasses feel clearer, but the left eye is a little blurry.
Tester: We selected the blue right eye lens and white left eye lens for review. Client says vision is clearer and comfortable enough.`;

function findLine(transcript: string, eye: "right" | "left") {
  const pattern = new RegExp(`${eye}[^.\\n]*line\\s*(\\d+)`, "i");
  const match = transcript.match(pattern);
  return match ? `Line ${match[1]}` : "";
}

export function mockExtractFields(transcript: string): ExtractedFields {
  const lower = transcript.toLowerCase();
  const right = findLine(transcript, "right");
  const left = findLine(transcript, "left");
  const cataract = lower.includes("not had cataract") || lower.includes("no cataract") ? "no" : lower.includes("cataract") ? "mentioned - needs QC" : "";
  const glasses = lower.includes("no.") || lower.includes("no glasses") ? "no current glasses" : lower.includes("glasses") ? "mentioned" : "";
  const comfort = lower.includes("clearer") ? "Client reported clearer vision; left eye slightly blurry." : "";
  const selected = lower.includes("blue") || lower.includes("white") ? "Right/left lenses mentioned for QC review" : "";

  const extracted: ExtractedFields = {
    comfort_response: comfort,
    cataract_history_confirmed: cataract,
    right_eye_distance_result: right,
    left_eye_distance_result: left,
    final_readable_line: right || left ? [right, left].filter(Boolean).join("; ") : "",
    glasses_selected: selected,
    additional_notes: lower.includes("blurry") ? "Left eye blur flagged for QC follow-up." : "",
    missing_fields: [],
    confidence_score: 0
  };

  const required: Array<keyof ExtractedFields> = [
    "comfort_response",
    "cataract_history_confirmed",
    "right_eye_distance_result",
    "left_eye_distance_result",
    "glasses_selected"
  ];

  extracted.missing_fields = required.filter((field) => !String(extracted[field] ?? "").trim());
  extracted.confidence_score = Math.max(0.45, Math.round((1 - extracted.missing_fields.length / required.length) * 100) / 100);
  return extracted;
}
