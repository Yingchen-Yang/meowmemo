import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTION_VERSION, POV_CAPTIONS, eligiblePovCaptions, getCaptionBasis, getOriginalContext,
  getOwnerContext, getPovCaption, getRecordingCaption, selectPovCaption,
} from "./captions.ts";
import { assignCaptionInState, assignPovCaption, emptyCaptionState, initializeCaptionState } from "./caption-storage.ts";
import { migrateLegacyRecordingCaptions } from "./legacy-captions.ts";

const contexts = ["Waiting for food", "Brushing", "Isolation in an unfamiliar room"];

test("caption library contains exactly 60 unique captions, 20 per context", () => {
  const all = contexts.flatMap((context) => POV_CAPTIONS[context]);
  for (const context of contexts) assert.equal(POV_CAPTIONS[context].length, 20);
  assert.equal(all.length, 60);
  assert.equal(new Set(all).size, 60);
});

test("all captions are reachable by deterministic selection", () => {
  for (const context of contexts) {
    const reached = new Set();
    for (let index = 0; index < 20_000 && reached.size < 20; index += 1) reached.add(selectPovCaption(context, `recording-${index}`));
    assert.deepEqual(reached, new Set(POV_CAPTIONS[context]));
  }
});

test("caption selection is stable, versioned, and context-bound", () => {
  for (const context of contexts) {
    const caption = getPovCaption(context, "recording-42");
    assert.equal(caption, getPovCaption(context, "recording-42"));
    assert.ok(POV_CAPTIONS[context].includes(caption));
  }
  assert.equal(CAPTION_VERSION, "context-pov-2.0.0");
});

test("unsupported and unknown results never receive a caption", () => {
  assert.equal(getPovCaption("Unknown", "seed"), null);
  assert.equal(getPovCaption("Other", "seed"), null);
  assert.equal(getPovCaption(null, "seed"), null);
});

test("same-context assignments never repeat any of the previous three", () => {
  let state = emptyCaptionState(); const recent = [];
  for (let index = 0; index < 100; index += 1) {
    const result = assignCaptionInState(state, `brushing-${index}`, "Brushing");
    assert.ok(!recent.slice(-3).includes(result.assignment.caption));
    recent.push(result.assignment.caption); state = result.state;
  }
});

test("a caption becomes eligible after leaving the recent-three window", () => {
  const [first, second, third, fourth] = POV_CAPTIONS.Brushing;
  assert.ok(!eligiblePovCaptions("Brushing", [first, second, third]).includes(first));
  assert.ok(eligiblePovCaptions("Brushing", [second, third, fourth]).includes(first));
});

test("contexts keep independent histories and cats share context history", () => {
  let state = emptyCaptionState();
  const first = assignCaptionInState(state, "cat-a-recording", "Brushing"); state = first.state;
  const second = assignCaptionInState(state, "cat-b-recording", "Brushing"); state = second.state;
  assert.notEqual(first.assignment.caption, second.assignment.caption);
  const food = assignCaptionInState(state, "cat-a-food", "Waiting for food"); state = food.state;
  assert.equal(state.recent.Brushing.length, 2);
  assert.equal(state.recent["Waiting for food"].length, 1);
  assert.equal(state.recent["Isolation in an unfamiliar room"].length, 0);
});

test("reassigning the same recording is idempotent and does not update history", () => {
  const first = assignCaptionInState(emptyCaptionState(), "same-id", "Isolation in an unfamiliar room");
  const before = JSON.stringify(first.state.recent);
  const repeated = assignCaptionInState(first.state, "same-id", "Isolation in an unfamiliar room");
  assert.equal(repeated.created, false);
  assert.equal(repeated.assignment.caption, first.assignment.caption);
  assert.equal(JSON.stringify(repeated.state.recent), before);
});

test("one recording keeps a permanent independent assignment for each context", () => {
  const brushing = assignCaptionInState(emptyCaptionState(), "multi-context", "Brushing");
  const food = assignCaptionInState(brushing.state, "multi-context", "Waiting for food");
  const brushingAgain = assignCaptionInState(food.state, "multi-context", "Brushing");
  assert.equal(brushingAgain.assignment.caption, brushing.assignment.caption);
  assert.notEqual(food.assignment.context, brushing.assignment.context);
  assert.equal(brushingAgain.created, false);
});

test("serialized state preserves an assignment across reloads and note edits", () => {
  const first = assignCaptionInState(emptyCaptionState(), "persistent-id", "Brushing");
  const reloaded = JSON.parse(JSON.stringify(first.state));
  const repeated = assignCaptionInState(reloaded, "persistent-id", "Brushing");
  assert.equal(repeated.assignment.caption, first.assignment.caption);
  const recording = { id: "persistent-id", povCaption: first.assignment.caption, note: "before", analysis: { context_label: "Brushing" }, ownerLabel: "Brushing" };
  assert.equal(getRecordingCaption({ ...recording, note: "after" }), first.assignment.caption);
});

test("stored recording captions are read verbatim and never regenerated", () => {
  const oldCaption = "Why is the brush back again?";
  const stored = { id: "legacy-1", povCaption: oldCaption, ownerLabel: "Brushing", analysis: { context_label: "Brushing" } };
  assert.equal(getOriginalContext(stored), "Brushing");
  assert.equal(getOwnerContext(stored), "Brushing");
  assert.equal(getRecordingCaption(stored), oldCaption);
  assert.equal(getRecordingCaption({ ...stored, povCaption: undefined }), null);
  assert.equal(getCaptionBasis("Waiting for food", "Brushing"), "owner_corrected_context");
});

test("legacy render-time captions migrate once while stored text remains untouched", () => {
  const existing = { id: "stored", povCaption: "Original saved text.", ownerLabel: "Brushing", analysis: { context_label: "Brushing" } };
  const missing = { id: "legacy-1", ownerLabel: "Waiting for food", analysis: { context_label: "Waiting for food" } };
  const first = migrateLegacyRecordingCaptions([existing, missing]);
  assert.equal(first.changed, true);
  assert.equal(first.recordings[0].povCaption, "Original saved text.");
  assert.equal(first.recordings[1].povCaption, "I have reviewed the kitchen. More food is needed.");
  assert.equal(first.recordings[1].captionVersion, "context-pov-1.0.0");
  const repeated = migrateLegacyRecordingCaptions(first.recordings);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.recordings, first.recordings);
});

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  clear() { this.#values.clear(); }
}

test("nearly simultaneous assignments serialize without recent-three repeats", async () => {
  globalThis.localStorage = new MemoryStorage();
  const assignments = await Promise.all(Array.from({ length: 24 }, (_, index) => assignPovCaption(`parallel-${index}`, "Waiting for food")));
  assignments.forEach((assignment, index) => assert.ok(!assignments.slice(Math.max(0, index - 3), index).some((previous) => previous.caption === assignment.caption)));
});

test("journal initialization preserves legacy text and repeat initialization is harmless", async () => {
  globalThis.localStorage = new MemoryStorage();
  const recording = {
    id: "saved-legacy", createdAt: "2026-01-01T00:00:00.000Z", povCaption: "This hairstyle was not my idea.",
    captionVersion: "context-pov-1.0.0", originalInferredContext: "Brushing", analysis: { context_label: "Brushing" }, ownerLabel: "Brushing",
  };
  await initializeCaptionState([recording]); await initializeCaptionState([recording]);
  const assignment = await assignPovCaption("saved-legacy", "Brushing");
  assert.equal(assignment.caption, recording.povCaption);
  assert.equal(assignment.libraryVersion, "context-pov-1.0.0");
});
