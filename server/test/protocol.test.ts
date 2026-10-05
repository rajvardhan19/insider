import { describe, expect, it } from "vitest";
import {
  commandSchema,
  entrySchema,
  nameSchema,
  PHRASES,
  BOTS,
} from "@insider/shared";
import { RULES, totalRounds } from "../src/game/rules.js";

describe("untrusted public inputs", () => {
  it("trims names and rejects empty, oversized, unsafe, and offensive names", () => {
    expect(nameSchema.parse("  Maya  ")).toBe("Maya");
    for (const value of [
      "",
      "   ",
      "abcdefghijklmnop",
      "<script>",
      "Maya\nLeo",
      "shit",
    ]) {
      expect(nameSchema.safeParse(value).success, value).toBe(false);
    }
  });
  it("requires a valid room code and an opaque-length resume token", () => {
    expect(
      entrySchema.safeParse({ type: "join", name: "Maya", code: "ABCD" })
        .success,
    ).toBe(true);
    expect(
      entrySchema.safeParse({ type: "join", name: "Maya", code: "abc" })
        .success,
    ).toBe(false);
    expect(
      entrySchema.safeParse({ type: "rejoin", code: "ABCD", token: "short" })
        .success,
    ).toBe(false);
    expect(
      entrySchema.safeParse({
        type: "rejoin",
        code: "ABCD",
        token: "a".repeat(64),
      }).success,
    ).toBe(true);
  });
  it("rejects forged identity, bad stakes, unknown actions and phrases", () => {
    const base = { commandId: "command-123", gameId: "game-123", roundId: 1 };
    for (const action of [
      { type: "guess", direction: "UP", stake: 999, callShark: false },
      {
        type: "guess",
        direction: "UP",
        stake: 100,
        callShark: false,
        playerId: "someone-else",
      },
      { type: "tip", direction: "UP", strong: "yes" },
      { type: "debug:force", role: "PARTNER" },
      { type: "chat", phraseId: "free-text-injection" },
    ])
      expect(commandSchema.safeParse({ ...base, action }).success).toBe(false);
    expect(
      commandSchema.safeParse({
        ...base,
        action: {
          type: "guess",
          direction: "DOWN",
          stake: 300,
          callShark: true,
        },
      }).success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({
        ...base,
        roundId: -1,
        action: { type: "start" },
      }).success,
    ).toBe(false);
  });
  it("contains every planned bot and preset phrase", () => {
    expect(Object.keys(BOTS).sort()).toEqual([
      "lucy",
      "nina",
      "ollie",
      "penny",
      "rex",
      "sal",
      "sam",
      "walt",
    ]);
    expect(Object.keys(PHRASES)).toHaveLength(23);
  });
});

describe("original-v1 rules", () => {
  it.each([
    [2, 6],
    [3, 6],
    [4, 4],
    [5, 5],
  ])(
    "gives %i players %i Quick rounds and double in Full",
    (players, quick) => {
      expect(totalRounds(players, "QUICK")).toBe(quick);
      expect(totalRounds(players, "FULL")).toBe(quick * 2);
      expect(quick % players).toBe(0);
    },
  );
  it("preserves original scoring and signals with discussion timers", () => {
    expect(RULES).toMatchObject({
      version: "original-v1",
      startingCoins: 1000,
      normalSuccess: 50,
      strongSuccess: 100,
      strongFailure: -100,
      correctCall: 100,
      wrongCall: -150,
      accuracy: 0.6,
      sharkChance: 0.5,
      tipMs: 60000,
      guessMs: 120000,
      revealMs: 8000,
    });
  });
});

it("validates custom turns and commands throughout a 120-round game", () => {
  for (const n of [1, 6])
    expect(
      commandSchema.safeParse({
        commandId: "rounds-test",
        gameId: null,
        roundId: 0,
        action: { type: "rounds", insiderTurns: n },
      }).success,
    ).toBe(true);
  for (const n of [0, 7, 20, 1.5, "2"])
    expect(
      commandSchema.safeParse({
        commandId: "rounds-test",
        gameId: null,
        roundId: 0,
        action: { type: "rounds", insiderTurns: n },
      }).success,
    ).toBe(false);
  expect(
    commandSchema.safeParse({
      commandId: "rounds-test",
      gameId: "game",
      roundId: 120,
      action: { type: "leave" },
    }).success,
  ).toBe(true);
  expect(totalRounds(20, "QUICK", 6)).toBe(120);
});
