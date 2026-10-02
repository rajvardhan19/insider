import type { Personality } from "./protocol.js";
export const BOTS: Record<
  Personality,
  { name: string; initial: string; tell: string; description: string }
> = {
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
export const PHRASES = {
  trust: { text: "Trust me.", audience: "insider" },
  never: { text: "I’d never lie to you.", audience: "insider" },
  strong: { text: "Strong means strong.", audience: "insider" },
  news: { text: "Read the news.", audience: "insider" },
  ignoreNews: { text: "Don’t trust the headline.", audience: "insider" },
  would: { text: "Would I lie?", audience: "insider" },
  doubt: { text: "I don’t buy it.", audience: "guesser" },
  shark: { text: "Shark alert 🦈", audience: "guesser" },
  follow: { text: "Following you.", audience: "guesser" },
  prove: { text: "Prove it.", audience: "guesser" },
  lied: { text: "You lied last time.", audience: "guesser" },
  allin: { text: "All in on you.", audience: "guesser" },
  smirk: { text: "😏", audience: "all" },
  think: { text: "🤔", audience: "all" },
  angel: { text: "😇", audience: "all" },
  sharkEmoji: { text: "🦈", audience: "all" },
  money: { text: "💸", audience: "all" },
  laugh: { text: "😂", audience: "all" },
} as const;
export type PhraseId = keyof typeof PHRASES;
