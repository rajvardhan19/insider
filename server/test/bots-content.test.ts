import { describe, expect, it } from "vitest";
import { BOTS, type Personality } from "@insider/shared";
import {
  botLines,
  decideGuess,
  decideTip,
  tellPlan,
} from "../src/bots/decisions.js";
import { samples } from "../src/game/rng.js";
import news from "../src/content/news.json";
import { HEADLINES } from "../src/narration/templates.js";

describe("complete bot and content inventory", () => {
  it("has 150 unique fictional news records and balanced sentiments", () => {
    expect(news.length).toBeGreaterThanOrEqual(150);
    expect(new Set(news.map((n) => n.id)).size).toBe(news.length);
    expect(new Set(news.map((n) => n.headline)).size).toBe(news.length);
    expect(
      news.every(
        (n) =>
          n.company &&
          n.description &&
          n.headline &&
          ["UP", "DOWN"].includes(n.sentiment),
      ),
    ).toBe(true);
    const good = news.filter((n) => n.sentiment === "UP").length / news.length;
    expect(good).toBeGreaterThanOrEqual(0.4);
    expect(good).toBeLessThanOrEqual(0.6);
    expect(HEADLINES.length).toBeGreaterThanOrEqual(40);
  });
  it.each(Object.keys(BOTS) as Personality[])(
    "%s has tell/non-tell lines and never lies as a Partner",
    (bot) => {
      expect(botLines(bot, true)).toHaveLength(10);
      expect(botLines(bot, false)).toHaveLength(10);
      expect(
        [...botLines(bot, true), ...botLines(bot, false)].every((x) =>
          x.includes("{tip}"),
        ),
      ).toBe(true);
      for (let seed = 0; seed < 100; seed++) {
        const [r] = samples(seed, 6);
        expect(
          decideTip(
            bot,
            { role: "PARTNER", direction: "DOWN", sentiment: "UP" },
            r,
          ).direction,
        ).toBe("DOWN");
      }
    },
  );
  it("uses visible observations only and makes chat modifiers bounded and non-stacking", () => {
    const base = {
      tip: { direction: "UP" as const, strong: false },
      sentiment: "DOWN" as const,
      trust: 100,
      round: 1,
      allInUsed: false,
      chat: [],
    };
    const r = [0, 0.89, 0.2, 0.8, 0.9, 0.9];
    const msg = {
      id: "1",
      playerId: "insider",
      text: "Trust me.",
      phraseId: "trust",
      round: 1,
      at: 0,
    };
    expect(decideGuess("sam", base, r).guess.direction).toBe("UP");
    expect(
      decideGuess("sam", { ...base, chat: [msg] }, r).guess.direction,
    ).toBe("DOWN");
    expect(decideGuess("sam", { ...base, chat: [msg, msg, msg] }, r)).toEqual(
      decideGuess("sam", { ...base, chat: [msg] }, r),
    );
    expect(decideGuess("sal", { ...base, chat: [msg] }, r)).toEqual(
      decideGuess("sal", base, r),
    );
    expect(decideGuess("nina", base, r).guess.direction).toBe("DOWN");
    expect(
      decideGuess(
        "walt",
        { ...base, round: 4, allInUsed: true },
        [0, 0.1, 0.1, 0.1, 0, 0.1],
      ).guess.stake,
    ).not.toBe(300);
  });
  it("implements false tells, first-game tell rates, and Walt timing overrides", () => {
    expect(tellPlan("lucy", "PARTNER", false, [0.05, 0.5, 0]).line).toContain(
      "!!!",
    );
    expect(
      tellPlan("lucy", "PARTNER", false, [0.1, 0.5, 0]).line,
    ).not.toContain("!!!");
    expect(tellPlan("lucy", "SHARK", false, [0.8, 0.5, 0]).line).not.toContain(
      "!!!",
    );
    expect(tellPlan("lucy", "SHARK", true, [0.8, 0.5, 0]).line).toContain(
      "!!!",
    );
    expect(tellPlan("walt", "SHARK", false, [0.1, 0.5, 0]).delay).toBeLessThan(
      1000,
    );
    expect(
      tellPlan("walt", "PARTNER", false, [0.5, 0.5, 0]).delay,
    ).toBeGreaterThanOrEqual(4000);
  });
});

it("gives the three new personalities distinct public-information decisions", () => {
  const ctx = {
    tip: { direction: "UP" as const, strong: true },
    sentiment: "UP" as const,
    trust: 120,
    round: 4,
    allInUsed: false,
    chat: [],
  };
  const draws = [0, 0.5, 0.3, 0.5, 0.4, 0.5];
  expect(decideGuess("penny", ctx, draws).guess).toEqual({
    direction: "UP",
    stake: 100,
    callShark: false,
  });
  expect(decideGuess("ollie", ctx, draws).guess).toEqual({
    direction: "DOWN",
    stake: 100,
    callShark: true,
  });
  expect(decideGuess("rex", ctx, draws).guess).toEqual({
    direction: "DOWN",
    stake: 300,
    callShark: true,
  });
  expect(
    decideGuess("rex", { ...ctx, allInUsed: true }, draws).guess.stake,
  ).toBe(200);
});
