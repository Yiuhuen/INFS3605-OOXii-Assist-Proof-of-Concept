"use client";

import { useEffect, useRef } from "react";
import { tokenizeTranscript } from "@/lib/transcriptHighlight";

/**
 * Renders `text` with line/eye-side/diopter/comfort/cataract phrases
 * highlighted (see lib/transcriptHighlight.ts), and — when `focusPhrase` is
 * given — scrolls that specific evidence phrase into view and marks it with
 * a stronger highlight. This is the "click a captured field, jump to its
 * transcript evidence" mechanism used by Review captured fields and QC.
 */
export function HighlightedTranscript({
  text,
  focusPhrase,
  className = ""
}: {
  text: string;
  /** Evidence quote (FieldConfidence.evidence) to spotlight and scroll to, if it appears in `text`. */
  focusPhrase?: string;
  className?: string;
}) {
  const focusRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (focusPhrase && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [text, focusPhrase]);

  if (!text.trim()) return <p className={`opacity-60 ${className}`}>No transcript captured yet.</p>;

  const tokens = tokenizeTranscript(text, focusPhrase);
  let focusAssigned = false;

  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {tokens.map((token, index) => {
        if (token.kind === "focus") {
          const isFirstFocus = !focusAssigned;
          focusAssigned = true;
          return (
            <mark key={index} ref={isFirstFocus ? focusRef : undefined} className="transcript-highlight-focus">
              {token.text}
            </mark>
          );
        }
        if (token.kind === "pattern") {
          return (
            <mark key={index} className="transcript-highlight">
              {token.text}
            </mark>
          );
        }
        return <span key={index}>{token.text}</span>;
      })}
    </p>
  );
}
