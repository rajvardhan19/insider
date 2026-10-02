import type {
  Direction,
  Guess,
  Personality,
  Role,
  Tip,
  Chat,
} from "@insider/shared";
import { opposite } from "../game/engine.js";
import { RULES as R } from "../game/rules.js";
export interface GuessObservation {
  tip: Tip;
  sentiment: Direction;
  trust: number;
  round: number;
  allInUsed: boolean;
  chat: Chat[];
}
const clamp = (p: number) => Math.max(0.05, Math.min(0.95, p));
export function decideGuess(
  bot: Personality,
  ctx: GuessObservation,
  r: number[],
): { guess: Guess; reply?: string } {
  const personality = r[0] < R.personalityRate,
    ids = new Set(ctx.chat.map((c) => c.phraseId)),
    trustPhrase = ["trust", "never", "would", "strong"].some((id) =>
      ids.has(id),
    );
  let follow = 0.5,
    call = 0.1,
    raise = 0.3,
    big = 0.05,
    reply: string | undefined;
  if (personality) {
    if (bot === "lucy") {
      follow = 0.95;
      call = 0.05;
      raise = ctx.trust > 100 ? 0.95 : 0.05;
      if (trustPhrase) {
        follow += 0.1;
        raise += 0.2;
        reply = "Following you.";
      }
      if (ids.has("smirk")) follow -= 0.1;
    }
    if (bot === "sam") {
      follow = ctx.tip.strong ? 0.1 : 0.9;
      call = ctx.tip.strong ? 0.7 : 0.15;
      raise = 0.15;
      if (trustPhrase) {
        follow -= 0.2;
        call += 0.25;
        reply = "Prove it.";
      }
    }
    if (bot === "nina") {
      follow = ctx.tip.direction === ctx.sentiment ? 1 : 0;
      call = 0.05;
      raise = 0.15;
      if (ids.has("ignoreNews") && r[5] < 0.3) {
        follow = 1;
        reply = "Rechecking the headline.";
      }
      if (ids.has("news")) follow = ctx.tip.direction === ctx.sentiment ? 1 : 0;
    }
    if (bot === "walt") {
      follow = 0.5;
      call = 0.25;
      raise = 0.65;
      big = ctx.round > 2 ? 0.3 : 0;
      if (ctx.chat.length) {
        raise += 0.2;
        big += 0.2;
        reply = "Let’s make this interesting.";
      }
    }
    if (bot === "sal") {
      follow = ctx.trust > 100 ? 0.9 : ctx.trust < 100 ? 0.1 : 0.5;
      call = ctx.trust < 90 ? 0.75 : 0.1;
      raise = 0.35;
    }
  }
  // Nina's deterministic headline policy takes precedence over probability clamps.
  const follows =
    r[1] < (personality && bot === "nina" ? follow : clamp(follow));
  const stake =
    !ctx.allInUsed && ctx.round > 2 && r[4] < clamp(big)
      ? 300
      : r[3] < clamp(raise)
        ? 200
        : 100;
  return {
    guess: {
      direction: follows ? ctx.tip.direction : opposite(ctx.tip.direction),
      stake,
      callShark: r[2] < clamp(call),
    },
    reply,
  };
}
export function decideTip(
  bot: Personality,
  ctx: { direction: Direction; role: Role; sentiment: Direction },
  r: number[],
): Tip {
  let direction = ctx.direction,
    strong = r[2] < 0.25;
  if (ctx.role === "SHARK") {
    if (r[0] >= R.personalityRate) direction = r[1] < 0.5 ? "UP" : "DOWN";
    else if (bot === "nina") direction = ctx.sentiment;
    else if (bot === "sal")
      direction = r[1] < 0.8 ? ctx.direction : opposite(ctx.direction);
    else if (bot === "walt") direction = r[1] < 0.5 ? "UP" : "DOWN";
    else direction = opposite(ctx.direction);
  }
  if (bot === "lucy") strong = r[2] < 0.1;
  if (bot === "walt") strong = r[2] < 0.8;
  if (bot === "sal" && ctx.role === "SHARK") strong = r[2] < 0.8;
  return { direction, strong };
}
const BASE = [
  "My read is {tip}.",
  "The desk says {tip}.",
  "I have a feeling: {tip}.",
  "My official tip is {tip}.",
  "Here’s my call: {tip}.",
  "I’m leaning {tip}.",
  "Put me down for {tip}.",
  "Today I’m saying {tip}.",
  "A quiet little {tip}.",
  "Let’s go with {tip}.",
];
export function botLines(bot: Personality, tell: boolean): string[] {
  return BASE.map((s, i) => {
    if (!tell) return bot === "sal" ? `${s} 🙂` : s;
    if (bot === "lucy") return `${s.replaceAll(".", "!")} Trust me!!!`;
    if (bot === "sam") return `${s} Exactly ${87 + i}.${i}% convinced.`;
    if (bot === "nina") return `${s} My sources agree.`;
    if (bot === "sal") return `${s} 😇`;
    return `${s} Watch this.`;
  });
}
export function tellPlan(
  bot: Personality,
  role: Role,
  first: boolean,
  r: number[],
) {
  const active =
    r[0] <
    (role === "SHARK" ? (first ? R.firstTell : R.tellShark) : R.tellPartner);
  const delay =
    bot === "walt"
      ? active
        ? 350 + r[1] * 500
        : 4000 + r[1] * 1900
      : 1000 + r[1] * 3000;
  return { delay, line: botLines(bot, active)[Math.floor(r[2] * 10)] };
}
