import type { CaptionBasis, OwnerLabel, Recording, SupportedContext } from "./types";

export const CAPTION_VERSION = "context-pov-2.0.0";

export const POV_CAPTIONS: Record<SupportedContext, readonly string[]> = {
  Brushing: [
    "Ah yes, my royal grooming appointment.", "Careful, this fluff is designer.", "Five more minutes. I'm almost fabulous.",
    "Is this a spa day or an interrogation?", "I didn't book this appointment, you know.", "Looking this good is a full-time job.",
    "Excuse me, that was my favorite tangle.", "You're brushing the wrong side of my personality.", "Fine. But I'm leaving a one-star review.",
    "Less brushing, more admiring, please.", "I shed. It's called home decorating.", "Do I look fluffier or just more offended?",
    "One more stroke and I might actually purr.", "Please respect my artistic bedhead.", "Who gave you permission to manage my fur?",
    "I'm not dramatic. This brush is dramatic.", "If you find my dignity in there, let me know.", "Okay, that spot is actually pretty nice.",
    "Beauty is pain. Mostly yours, if you keep going.", "My fur has its own plans today.",
  ],
  "Waiting for food": [
    "Hello? The bowl is looking suspiciously empty.", "I have never been fed. Not even once.", "Just checking if dinner got lost.",
    "My stomach has filed a formal complaint.", "Is the chef accepting urgent requests?", "I can hear a treat bag from three rooms away.",
    "That clock says it's mealtime. Don't argue.", "I wasn't staring. I was supervising dinner.", "One tiny snack could save this friendship.",
    "Excuse me, your customer is still waiting.", "The empty bowl is a personal attack.", "I'll stop meowing when the service improves.",
    "I brought my appetite. What did you bring?", "Are we waiting for the Michelin inspector?", "My love language is a full food bowl.",
    "This kitchen has terrible opening hours.", "Perhaps you forgot I'm the main character.", "I see you eating. Interesting choice.",
    "Let's skip the small talk and open the tuna.", "I'll be right here, dramatically starving.",
  ],
  "Isolation in an unfamiliar room": [
    "New room. Who dis?", "I am conducting a very important room inspection.", "Interesting walls. Suspicious vibes.",
    "Is this my new kingdom or just a waiting room?", "Hello? I'm taking attendance.", "Not lost. Just exploring independently.",
    "Every corner requires a professional sniff.", "I would like a map and perhaps a snack.", "Are the humans included with this room?",
    "Just making sure my voice still echoes.", "Who decorated this place? I have notes.", "I've decided this corner belongs to me.",
    "Testing the acoustics. Meow. Perfect.", "I don't recognize this room, but it recognizes me now.", "Excuse me, where is the exit to my usual couch?",
    "New territory, same fabulous cat.", "I'm not complaining. I'm making an announcement.", "Does this room come with room service?",
    "Hello, furniture. We need to talk.", "I'll settle in once I've interviewed the curtains.",
  ],
};

export function isSupportedContext(value: string | null | undefined): value is SupportedContext {
  return value === "Waiting for food" || value === "Brushing" || value === "Isolation in an unfamiliar room";
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function eligiblePovCaptions(context: SupportedContext, recent: readonly string[]) {
  const excluded = new Set(recent.slice(-3));
  return POV_CAPTIONS[context].filter((caption) => !excluded.has(caption));
}

export function selectPovCaption(context: SupportedContext, recordingId: string, recent: readonly string[] = []) {
  const eligible = eligiblePovCaptions(context, recent);
  const signature = eligible.join("\u001f");
  return eligible[stableHash(`${CAPTION_VERSION}:${context}:${recordingId}:${signature}`) % eligible.length];
}

export function getPovCaption(context: OwnerLabel | string | null | undefined, seed: string): string | null {
  return isSupportedContext(context) ? selectPovCaption(context, seed) : null;
}

export function getCaptionBasis(inferred: OwnerLabel, ownerContext: OwnerLabel): CaptionBasis {
  return isSupportedContext(ownerContext) && ownerContext !== inferred ? "owner_corrected_context" : "inferred_context";
}

export function getOriginalContext(recording: Recording): OwnerLabel {
  const stored = recording.originalInferredContext || recording.analysis.context_label;
  return isSupportedContext(stored) ? stored : "Unknown";
}

export function getOwnerContext(recording: Recording): OwnerLabel {
  return recording.ownerConfirmedContext || recording.ownerLabel || getOriginalContext(recording);
}

/** Read only: selection happens in user/analysis event handlers, never during rendering. */
export function getRecordingCaption(recording: Recording, context = getOwnerContext(recording)): string | null {
  if (!isSupportedContext(context)) return null;
  if (recording.povCaptions) return recording.povCaptions[context] || null;
  return recording.povCaption || null;
}
