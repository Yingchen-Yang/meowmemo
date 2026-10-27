import { getCaptionBasis, getOriginalContext, getOwnerContext, isSupportedContext, stableHash } from "./captions.ts";
import type { Recording, SupportedContext } from "./types";

const LEGACY_VERSION = "context-pov-1.0.0";
const LEGACY_CAPTIONS: Record<SupportedContext, readonly string[]> = {
  "Waiting for food": [
    "Human, I believe you forgot something important.",
    "The bowl situation requires your immediate attention.",
    "A small snack would solve everything.",
    "I have reviewed the kitchen. More food is needed.",
  ],
  Brushing: [
    "I did not approve this grooming session.",
    "Why is the brush back again?",
    "You may continue, but I am judging you.",
    "This hairstyle was not my idea.",
  ],
  "Isolation in an unfamiliar room": [
    "Hello? I would like the usual room back, please.",
    "This place smells suspiciously unfamiliar.",
    "I need my human to inspect this area immediately.",
    "New room. Many questions. Few answers.",
  ],
};

function legacyCaption(context: SupportedContext, recordingId: string) {
  const variants = LEGACY_CAPTIONS[context];
  return variants[stableHash(`${LEGACY_VERSION}:${context}:${recordingId}`) % variants.length];
}

/** Persist the exact caption older versions derived at render time. Existing stored text is never touched. */
export function migrateLegacyRecordingCaptions(recordings: Recording[]) {
  let changed = false;
  const migrated = recordings.map((recording) => {
    const ownerContext = getOwnerContext(recording);
    if (!isSupportedContext(ownerContext)) return recording;
    if (recording.povCaptions?.[ownerContext]) return recording;
    const inferredContext = getOriginalContext(recording);
    const caption = recording.povCaption || legacyCaption(ownerContext, recording.id);
    changed = true;
    return {
      ...recording,
      povCaption: caption,
      povCaptions: { ...(recording.povCaptions || {}), [ownerContext]: caption },
      captionVersion: recording.captionVersion || LEGACY_VERSION,
      captionBasis: getCaptionBasis(inferredContext, ownerContext),
    };
  });
  return { recordings: migrated, changed };
}
