import phraseData from "./content/phrases.json";
import type { Personality } from "./protocol.js";
export const BOTS: Record<
  Personality,
  { name: string; initial: string; tell: string; description: string }
> = {
  penny: {
    name: "Patient Penny",
    initial: "PP",
    description: "Small bets. Trust must be earned.",
    tell: "Talk of a safety margin often hides a Shark.",
  },
  ollie: {
    name: "Opposite Ollie",
    initial: "OO",
    description: "Fades the headline and looks for the surprise.",
    tell: "Calling something obvious often means he is a Shark.",
  },
  rex: {
    name: "Risky Rex",
    initial: "RR",
    description: "Raises the stakes and challenges confident tips.",
    tell: "A rocket emoji often accompanies his Shark tips.",
  },
  lucy: {
    name: "Loyal Lucy",
    initial: "LL",
    tell: "Extra exclamation marks often mean she is a Shark.",
    description: "Trusts a good tip. Sometimes a little too much.",
  },
  sam: {
    name: "Skeptic Sam",
    initial: "SS",
    tell: "Suspiciously precise numbers often mean he is a Shark.",
    description: "The stronger your pitch, the less he believes it.",
  },
  nina: {
    name: "Newsy Nina",
    initial: "NN",
    tell: "Watch for mentions of her “sources”.",
    description: "Reads every headline. Believes most of them.",
  },
  walt: {
    name: "Wildcard Walt",
    initial: "WW",
    tell: "An almost instant tip often means he is a Shark.",
    description: "Big bets. Bigger unpredictability.",
  },
  sal: {
    name: "Sneaky Sal",
    initial: "SA",
    tell: "An angel emoji often hides a Shark. A smile is usually calmer.",
    description: "Watches reputations, not promises.",
  },
};
export const PHRASES = phraseData;
export type PhraseId = keyof typeof PHRASES;
