"use client";

import { Database, Sparkles } from "lucide-react";
import type { AnalysisMode } from "@/lib/types";

const choices: Array<{ mode: AnalysisMode; name: string; description: string; recommended?: boolean }> = [
  {
    mode: "database_match",
    name: "Database Match",
    description: "Look only for a sufficiently close match among labeled cat vocalization examples.",
  },
  {
    mode: "database_plus_ai",
    name: "Database + AI",
    description: "Try labeled examples first, then compare the sound pattern when no reliable match is found.",
    recommended: true,
  },
];

export function AnalysisModePicker({ value, onChange }: { value: AnalysisMode; onChange: (mode: AnalysisMode) => void }) {
  return (
    <div className="mode-grid" role="radiogroup" aria-label="Analysis mode">
      {choices.map((choice) => {
        const selected = value === choice.mode;
        const Icon = choice.mode === "database_match" ? Database : Sparkles;
        return (
          <button
            key={choice.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`mode-card ${selected ? "selected" : ""}`}
            onClick={() => onChange(choice.mode)}
          >
            <span className="mode-icon"><Icon size={21} /></span>
            <span className="mode-copy">
              <span className="mode-title">{choice.name}{choice.recommended ? <small>Recommended</small> : null}</span>
              <span className="mode-description">{choice.description}</span>
            </span>
            <span className="radio-mark" aria-hidden><span /></span>
          </button>
        );
      })}
    </div>
  );
}
