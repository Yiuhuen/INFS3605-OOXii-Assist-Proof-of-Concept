export function generateClientId() {
  const body = Math.floor(100 + Math.random() * 900);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const check = letters[Math.floor(Math.random() * letters.length)];
  return `C-${body}${check}`;
}

export function generateRecordId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function generateSegmentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `SEG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
