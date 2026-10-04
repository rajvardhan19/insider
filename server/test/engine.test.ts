import { demos, type Script } from "../src/debug/scenarios.js";
import { describe, expect, it } from "vitest";
import type { Guess, News, Direction } from "@insider/shared";
import {
  freshPlayer,
  startGame,
  submitTip,
  submitGuess,
  expire,
  resolveRound,
} from "../src/game/engine.js";
import type { GameState } from "../src/game/state.js";
import { scoreRound } from "../src/game/scoring.js";
import { awards, winners } from "../src/game/awards.js";
import { buildPlayerView } from "../src/game/projection.js";
import { samples } from "../src/game/rng.js";

const pool: News[] = Array.from({ length: 32 }, (_, i) => ({
  id: `news-${i}`,
  company: `Fiction ${i}`,
  description: "Test fixture",
  headline: "Sales increase.",
  sentiment: "UP",
  punchlines: {
    UP: "The test fern got promoted.",
    DOWN: "The test fern called in wilted.",
  },
}));
function game(names = ["Maya", "Leo", "Priya", "Dev"]) {
  return startGame(
    names.map((name) => freshPlayer(name, name)),
    "QUICK",
    "game",
    12345,
    1000,
    pool,
  );
}
const guess = (
  direction: Direction,
  stake: 100 | 200 | 300 = 100,
  callShark = false,
): Guess => ({ direction, stake, callShark });
function replay(names: string[], scripts: Script[]) {
  let g = game(names);
  for (const s of scripts) {
    g.current.direction = s.direction;
    g.current.role = s.role;
    g.current.accurate = s.direction === g.current.news.sentiment;
    g = submitTip(
      g,
      g.current.insiderId,
      { direction: s.tip, strong: s.strong ?? false },
      g.phaseStartedAt + 1,
    );
    for (const [id, pick] of Object.entries(s.guesses))
      g = submitGuess(g, id, pick, g.phaseStartedAt + 1);
    if (g.phase === "GUESS") g = expire(g, g.phaseEndsAt, pool);
    expect(g.players.map((p) => p.coins)).toEqual(s.coins);
    expect(g.players.map((p) => p.trust)).toEqual(s.trust);
    for (const o of g.history.at(-1)!.outcomes)
      expect(o.delta).toBe(o.directionDelta + o.callDelta + o.insiderDelta);
    g = expire(g, g.phaseEndsAt, pool);
  }
  expect(g.phase).toBe("FINAL");
  return g;
}
describe("exact original-v1 document replays", () => {
  it("reproduces Appendix A, including sit-out, accusations, double bluff, standings and awards", () => {
    const g = replay(demos.A.names, demos.A.rounds);
    expect(winners(g)).toEqual(["Priya"]);
    expect(
      Object.fromEntries(awards(g).map((a) => [a.title, a.playerIds])),
    ).toEqual({
      "The Whistleblower": ["Maya"],
      "The Pinocchio Prize": ["Priya"],
      "Suspiciously Honest": ["Priya"],
      "Golden Gullible": ["Leo"],
    });
    expect(g.players.map((p) => p.record)).toEqual([
      ["Partner (truth)"],
      ["Shark (lied, Strong)"],
      ["Shark (truth, Strong)"],
      ["Shark (truth)"],
    ]);
  });
  it("reproduces Appendix B exactly without treating scripted bot choices as a bot-policy test", () => {
    const g = replay(demos.B.names, demos.B.rounds);
    expect(winners(g)).toEqual(["Alex"]);
    expect(
      Object.fromEntries(awards(g).map((a) => [a.title, a.playerIds])),
    ).toEqual({
      "The Whistleblower": ["Alex"],
      "The Pinocchio Prize": ["Alex"],
      "Suspiciously Honest": ["Alex"],
      "Golden Gullible": ["Lucy"],
    });
    expect(g.players[0].record).toEqual(["Partner (truth)", "Shark (lied)"]);
  });
});
describe("pure transitions and rule boundaries", () => {
  it("rejects duplicate seats, all-bot rosters, and duplicate news IDs", () => {
    const p = freshPlayer("same", "Maya");
    expect(() => startGame([p, p], "QUICK", "g", 1, 0, pool)).toThrow();
    expect(() =>
      startGame(
        [freshPlayer("a", "Lucy", "lucy"), freshPlayer("b", "Sam", "sam")],
        "QUICK",
        "g",
        1,
        0,
        pool,
      ),
    ).toThrow();
    expect(() =>
      startGame([p, freshPlayer("other", "Leo")], "QUICK", "g", 1, 0, [
        ...pool,
        pool[0],
      ]),
    ).toThrow();
  });
  it("does not mutate inputs and repeats exactly with explicit RNG state", () => {
    const g = game(),
      copy = structuredClone(g);
    expect(
      submitTip(g, "Maya", { direction: "UP", strong: false }, 1001),
    ).toEqual(submitTip(g, "Maya", { direction: "UP", strong: false }, 1001));
    expect(g).toEqual(copy);
    expect(game()).toEqual(g);
    expect(samples(123, 10)).toEqual(samples(123, 10));
  });
  it("rejects wrong players, phases, deadlines, duplicate guesses, and invalid stakes", () => {
    let g = game();
    expect(() =>
      submitTip(g, "Leo", { direction: "UP", strong: false }, 1001),
    ).toThrow();
    expect(() =>
      submitTip(g, "Maya", { direction: "UP", strong: false }, g.phaseEndsAt),
    ).toThrow();
    expect(() => submitGuess(g, "Leo", guess("UP"), 1001)).toThrow();
    g = submitTip(g, "Maya", { direction: "UP", strong: false }, 1001);
    expect(() => submitGuess(g, "Maya", guess("UP"), 1002)).toThrow();
    expect(() =>
      submitGuess(
        g,
        "Leo",
        { ...guess("UP"), stake: 999 } as unknown as Guess,
        1002,
      ),
    ).toThrow();
    g = submitGuess(g, "Leo", guess("UP"), 1002);
    expect(() => submitGuess(g, "Leo", guess("DOWN"), 1003)).toThrow();
    g = expire(g, g.phaseEndsAt, pool);
    expect(() => resolveRound(g, 1004)).toThrow();
  });
  it("applies calls and sympathy once, and keeps false-call penalties out of the Insider payout", () => {
    const g = game();
    g.current.role = "PARTNER";
    g.current.direction = "UP";
    g.current.tip = { direction: "UP", strong: false };
    g.current.guesses = {
      Leo: guess("UP", 100, true),
      Priya: guess("UP", 100, true),
    };
    const result = scoreRound(
      g.current,
      g.players.map((p) => p.id),
    );
    expect(result.trustDelta).toBe(25);
    expect(result.outcomes.find((o) => o.playerId === "Maya")!.delta).toBe(100);
    expect(result.outcomes.find((o) => o.playerId === "Leo")!.delta).toBe(-50);
  });
  it("caps trust at ten, allows debt, consumes All In on reveal, and disallows reusing it", () => {
    let g = game();
    g.current.role = "SHARK";
    g.current.direction = "DOWN";
    g.players[0].trust = 12;
    g.players[1].coins = 0;
    g = submitTip(g, "Maya", { direction: "UP", strong: true }, 1001);
    g = submitGuess(g, "Leo", guess("UP", 300, true), 1002);
    expect(g.players[1].allInUsed).toBe(false);
    g = expire(g, g.phaseEndsAt, pool);
    expect(g.players[0].trust).toBe(10);
    expect(g.history.at(-1)!.trustDelta).toBe(-2);
    expect(g.players[1].coins).toBe(-200);
    expect(g.players[1].allInUsed).toBe(true);
    g = expire(g, g.phaseEndsAt, pool);
    g = submitTip(
      g,
      "Leo",
      { direction: "UP", strong: false },
      g.phaseStartedAt + 1,
    );
    // Leo is Insider this round; next eligible round retains the consumed flag.
    g = expire(g, g.phaseEndsAt, pool);
    g = expire(g, g.phaseEndsAt, pool);
    g = submitTip(
      g,
      "Priya",
      { direction: "UP", strong: false },
      g.phaseStartedAt + 1,
    );
    expect(() =>
      submitGuess(g, "Leo", guess("UP", 300), g.phaseStartedAt + 1),
    ).toThrow();
  });
  it("keeps original timeout defaults and does not repeat headlines across a whole match", () => {
    let g = game();
    const headlines: string[] = [];
    while (g.phase !== "FINAL") {
      if (g.phase === "TIP") headlines.push(g.current.news.id);
      g = expire(g, g.phaseEndsAt, pool);
    }
    expect(new Set(headlines).size).toBe(headlines.length);
    expect(g.players.every((p) => p.coins === 1000)).toBe(true);
    expect(g.history.every((r) => !r.tip.strong)).toBe(true);
  });
});
describe("secret-preserving projections", () => {
  const view = (g: GameState, id = "Leo") =>
    buildPlayerView(
      {
        id: "room",
        code: "ABCD",
        revision: 1,
        hostId: "Maya",
        mode: "QUICK",
        solo: false,
        players: g.players,
        game: g,
      },
      id,
      2000,
    );
  it("does not change a non-Insider view when only unrevealed secrets change", () => {
    for (const phase of ["TIP", "GUESS"] as const) {
      let g = game();
      if (phase === "GUESS")
        g = submitTip(g, "Maya", { direction: "UP", strong: false }, 1001);
      const altered = structuredClone(g);
      altered.current.role = g.current.role === "SHARK" ? "PARTNER" : "SHARK";
      altered.current.direction = g.current.direction === "UP" ? "DOWN" : "UP";
      altered.current.accurate = !g.current.accurate;
      expect(view(g)).toEqual(view(altered));
      expect(view(g, "Maya").secrets).toBeDefined();
    }
  });
  it("hides others’ selections and current All In usage while restoring the viewer’s own action", () => {
    let g = submitTip(game(), "Maya", { direction: "UP", strong: false }, 1001);
    g = submitGuess(g, "Priya", guess("UP", 300, true), 1002);
    const other = structuredClone(g);
    other.current.guesses.Priya = guess("DOWN", 100, false);
    expect(view(g)).toEqual(view(other));
    expect(view(g, "Priya").ownGuess).toEqual(guess("UP", 300, true));
    expect(view(g).players.find((p) => p.id === "Priya")!.allInUsed).toBe(
      false,
    );
    expect(JSON.stringify(view(g))).not.toMatch(/botRng|cosmeticRng|usedNews/);
  });
  it("reveals the results together after scoring", () => {
    let g = submitTip(game(), "Maya", { direction: "UP", strong: false }, 1001);
    g = submitGuess(g, "Priya", guess("UP", 300, true), 1002);
    g = expire(g, g.phaseEndsAt, pool);
    expect(view(g).result?.role).toBe(g.current.role);
    expect(view(g).players.find((p) => p.id === "Priya")!.allInUsed).toBe(true);
    expect(view(g, "Maya").secrets).toBeUndefined();
  });
});

it.each(["QUICK", "FULL"] as const)(
  "gives %s games 60s for tips and 120s for discussion/guesses",
  (mode) => {
    let g = startGame(
      [freshPlayer("a", "Alex"), freshPlayer("b", "Blair")],
      mode,
      "timers",
      31,
      1000,
      pool,
    );
    expect(g.phaseEndsAt - g.phaseStartedAt).toBe(60000);
    expect(expire(g, 60999, pool).phase).toBe("TIP");
    g = submitTip(
      g,
      g.current.insiderId,
      { direction: "UP", strong: false },
      60999,
    );
    expect(g.phaseEndsAt - g.phaseStartedAt).toBe(120000);
    expect(expire(g, g.phaseEndsAt - 1, pool).phase).toBe("GUESS");
    expect(expire(g, g.phaseEndsAt, pool).phase).toBe("REVEAL");
  },
);
