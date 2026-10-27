import { CAPTION_VERSION, isSupportedContext, selectPovCaption } from "./captions.ts";
import type { Recording, SupportedContext } from "./types";

const CAPTION_STATE_KEY = "meowmemo.caption-state.v2";
const LOCK_NAME = "meowmemo-caption-assignment";
const contexts: SupportedContext[] = ["Brushing", "Waiting for food", "Isolation in an unfamiliar room"];

export type CaptionAssignment = { caption: string; context: SupportedContext; libraryVersion: string; assignedAt: string };
export type CaptionState = {
  schemaVersion: 2;
  initializedFromJournal: boolean;
  assignments: Record<string, CaptionAssignment>;
  recent: Record<SupportedContext, string[]>;
};

export function emptyCaptionState(): CaptionState {
  return { schemaVersion: 2, initializedFromJournal: false, assignments: {}, recent: { Brushing: [], "Waiting for food": [], "Isolation in an unfamiliar room": [] } };
}

function normalizeState(value: unknown): CaptionState {
  const fallback = emptyCaptionState();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<CaptionState>;
  return {
    schemaVersion: 2,
    initializedFromJournal: Boolean(candidate.initializedFromJournal),
    assignments: candidate.assignments && typeof candidate.assignments === "object" ? candidate.assignments : {},
    recent: Object.fromEntries(contexts.map((context) => [context, Array.isArray(candidate.recent?.[context]) ? candidate.recent[context].slice(-3) : []])) as CaptionState["recent"],
  };
}

function loadState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(CAPTION_STATE_KEY) || "null")); }
  catch { return emptyCaptionState(); }
}

function saveState(state: CaptionState) { localStorage.setItem(CAPTION_STATE_KEY, JSON.stringify(state)); }

export function assignCaptionInState(state: CaptionState, recordingId: string, context: SupportedContext, assignedAt = new Date().toISOString()) {
  const assignmentId = `${recordingId}::${context}`;
  const existing = state.assignments[assignmentId];
  if (existing) return { state, assignment: existing, created: false };
  const caption = selectPovCaption(context, recordingId, state.recent[context]);
  const assignment = { caption, context, libraryVersion: CAPTION_VERSION, assignedAt };
  const next: CaptionState = {
    ...state,
    assignments: { ...state.assignments, [assignmentId]: assignment },
    recent: { ...state.recent, [context]: [...state.recent[context], caption].slice(-3) },
  };
  return { state: next, assignment, created: true };
}

let localQueue = Promise.resolve();
function serialized<T>(operation: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(LOCK_NAME, operation);
  const pending = localQueue.then(operation, operation);
  localQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export function assignPovCaption(recordingId: string, context: SupportedContext): Promise<CaptionAssignment> {
  return serialized(() => {
    const current = loadState();
    const result = assignCaptionInState(current, recordingId, context);
    if (result.created) saveState(result.state);
    return result.assignment;
  });
}

export function initializeCaptionState(recordings: Recording[]): Promise<void> {
  return serialized(() => {
    const current = loadState();
    if (current.initializedFromJournal) return;
    const next: CaptionState = { ...current, assignments: { ...current.assignments }, recent: { ...current.recent } };
    const ordered = [...recordings].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const recording of ordered) {
      const legacyContext = recording.ownerConfirmedContext || recording.ownerLabel || recording.originalInferredContext || recording.analysis.context_label;
      const captions = { ...(recording.povCaptions || {}) };
      if (recording.povCaption && isSupportedContext(legacyContext) && !captions[legacyContext]) captions[legacyContext] = recording.povCaption;
      for (const context of contexts) {
        const caption = captions[context];
        if (!caption) continue;
        const assignmentId = `${recording.id}::${context}`;
        if (!next.assignments[assignmentId]) next.assignments[assignmentId] = { caption, context, libraryVersion: recording.captionVersion || "legacy-stored", assignedAt: recording.createdAt };
        next.recent[context] = [...next.recent[context], caption].slice(-3);
      }
    }
    next.initializedFromJournal = true;
    saveState(next);
  });
}
