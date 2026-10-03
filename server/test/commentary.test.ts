import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  advanceCaptions,
  emptyCaptions,
  creditRating,
  lostAllIn,
  PHRASES,
  type CommentaryFrame,
  type CommentaryLevel,
  type CommentaryLine,
  type News,
} from "@insider/shared";
import {
  freshPlayer,
  startGame,
  submitTip,
  submitGuess,
  expire,
} from "../src/game/engine.js";
import { buildCommentaryFrame } from "../src/game/projection.js";
import {
  advanceCommentary,
  emptyCommentary,
  publicMemory,
} from "../src/commentary/engine.js";
import { decideGuess } from "../src/bots/decisions.js";
import lines from "../src/commentary/lines.json";
import news from "../src/content/news.json";
import comedy from "../../shared/src/content/comedy.json";
const game = () =>
  startGame(
    [
      freshPlayer("a", "Alex"),
      freshPlayer("b", "Bex"),
      freshPlayer("c", "Casey"),
    ],
    "QUICK",
    "game",
    31,
    0,
    news as News[],
  );
const frame = (g = game(), now = 0) =>
  buildCommentaryFrame(
    {
      id: "room",
      code: "ROOM",
      revision: 1,
      hostId: "a",
      mode: "QUICK",
      solo: false,
      players: g.players,
      game: g,
    },
    now,
  )!;
function resolved() {
  let g = game();
  g.current.direction = "DOWN";
  g.current.role = "SHARK";
  g = submitTip(g, "a", { direction: "UP", strong: true }, 1);
  g = submitGuess(g, "b", { direction: "UP", stake: 300, callShark: false }, 2);
  return expire(g, g.phaseEndsAt, news as News[]);
}
const line = (
  id: string,
  priority: CommentaryLine["priority"],
  at = 0,
): CommentaryLine => ({
  id,
  trigger: "test",
  gameId: "game",
  round: 1,
  phase: "TIP",
  at,
  expiresAt: 20000,
  priority,
  turns: [{ speaker: "Brad Bull", text: id }],
});
describe("kind comedy content and unchanged numeric boundaries", () => {
  it("covers every news outcome and validates unique punchlines and anchor slots", () => {
    expect(news).toHaveLength(150);
    const jokes = news.flatMap((n) => [n.punchlines.UP, n.punchlines.DOWN]);
    expect(new Set(jokes).size).toBe(300);
    expect(
      jokes.every(
        (j) => j.length > 30 && j.length < 350 && !/[<>]|https?:/.test(j),
      ),
    ).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(120);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(
      new Set(lines.flatMap((l) => l.turns.map((t) => t.text))).size,
    ).toBeGreaterThanOrEqual(120);
    const slots = new Set([
      "name",
      "victim",
      "loss",
      "round",
      "tip",
      "company",
      "rating",
      "report",
      "streak",
    ]);
    for (const l of lines) {
      expect(["high", "medium", "low"]).toContain(l.priority);
      expect(l.turns.length).toBeLessThanOrEqual(2);
      if (["reveal", "end"].includes(l.trigger))
        expect(l.turns.some((t) => t.text.includes("{report}"))).toBe(true);
      for (const t of l.turns) {
        expect(["Brad Bull", "Barb Bear"]).toContain(t.speaker);
        for (const m of t.text.matchAll(/\{(\w+)\}/g))
          expect(slots.has(m[1])).toBe(true);
      }
    }
    for (const spot of Object.values(comedy.microcopy))
      expect(spot.length).toBeGreaterThanOrEqual(2);
  });
  it.each([
    [140, "AAA: Saint"],
    [139, "A: Probably Fine"],
    [110, "A: Probably Fine"],
    [109, "B: Unrated Mystery"],
    [90, "B: Unrated Mystery"],
    [89, "C: Junk Bond"],
    [60, "C: Junk Bond"],
    [59, "Known Fraud"],
    [10, "Known Fraud"],
  ])("rates %s as %s", (value, label) =>
    expect(creditRating(Number(value))).toBe(label),
  );
  it("keeps the cosmetic All In badge through the next round only", () => {
    const g = resolved();
    expect(lostAllIn({ history: g.history, round: 1 }, "b")).toBe(true);
    expect(lostAllIn({ history: g.history, round: 2 }, "b")).toBe(true);
    expect(lostAllIn({ history: g.history, round: 3 }, "b")).toBe(false);
    expect(g.players.find((p) => p.id === "b")!.coins).toBe(700);
    expect(g.players).toHaveLength(3);
  });
  it("maps new trust claims to the existing bounded modifier", () => {
    const context = {
      tip: { direction: "UP" as const, strong: false },
      sentiment: "UP" as const,
      trust: 100,
      round: 1,
      allInUsed: false,
      chat: [],
    };
    const chat = (phraseId: string) => ({
      id: phraseId,
      phraseId,
      text: "",
      at: 0,
      round: 1,
      playerId: "a",
    });
    const draws = [0, 0.85, 0.2, 0.9, 0.9, 0.9];
    const expected = decideGuess(
      "sam",
      { ...context, chat: [chat("trust")] },
      draws,
    );
    expect(
      decideGuess(
        "sam",
        { ...context, chat: [chat("suit"), chat("today")] },
        draws,
      ),
    ).toEqual(expected);
    expect(PHRASES.suit.audience).toBe("insider");
    expect(PHRASES.sec.audience).toBe("guesser");
  });
});
describe("commentary has no unrevealed information", () => {
  it("produces identical frames, memory, queues and spoken lines for secret-only changes", () => {
    for (const phase of ["TIP", "GUESS"] as const) {
      let g = game();
      if (phase === "GUESS") {
        g = submitTip(g, "a", { direction: "UP", strong: true }, 1);
        g = submitGuess(
          g,
          "b",
          { direction: "UP", stake: 300, callShark: true },
          2,
        );
      }
      const base = frame(g, 1000);
      for (let i = 0; i < 32; i++) {
        const altered = structuredClone(g);
        altered.current.role = i % 2 ? "SHARK" : "PARTNER";
        altered.current.direction = i % 3 ? "UP" : "DOWN";
        altered.current.accurate = i % 2 === 0;
        altered.rng = i;
        altered.botRng = i + 99;
        altered.cosmeticRng = i + 300;
        if (phase === "GUESS")
          altered.current.guesses.b = {
            direction: i % 2 ? "UP" : "DOWN",
            stake: i % 2 ? 100 : 200,
            callShark: i % 2 === 0,
          };
        const hidden = frame(altered, 1000);
        expect(hidden).toEqual(base);
        expect(publicMemory(hidden)).toEqual(publicMemory(base));
        let a = emptyCommentary(),
          b = emptyCommentary();
        for (const now of [1000, 3500, 6000, 9000]) {
          a = advanceCommentary(a, base, now);
          b = advanceCommentary(b, hidden, now);
          expect(a).toEqual(b);
        }
      }
      expect(JSON.stringify(base)).not.toMatch(
        /secrets|accurate|role|ownGuess|stake|callShark|Rng/,
      );
    }
  });
  it("cannot import private game state, networking, timers or live AI", () => {
    const source = readFileSync(
      new URL("../src/commentary/engine.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /GameState|\.current\.|narrator|fetch\(|setTimeout|Math.random/,
    );
  });
  it("builds callbacks from revealed results, including loss amounts and prior streaks", () => {
    const g = resolved();
    g.round = 2;
    g.phase = "TIP";
    const memory = publicMemory(frame(g));
    expect(memory.fooled).toMatchObject([
      { insider: "a", victim: "b", loss: 300 },
    ]);
    expect(memory.lostAllIns).toMatchObject([{ playerId: "b", round: 1 }]);
    expect(memory.ratingChanges).toMatchObject([
      { playerId: "a", round: 1, delta: -40 },
    ]);
    expect(memory.truth).toBe(false);
    expect(memory.streak).toBe(1);
    expect(memory.repeatedCompany).toBe(true);
  });
});
describe("server commentary triggers, priority and stale-line handling", () => {
  it("detects the final fast lock-in after the engine immediately enters reveal", () => {
    let g = submitTip(game(), "a", { direction: "UP", strong: false }, 100);
    g = submitGuess(
      g,
      "b",
      { direction: "UP", stake: 100, callShark: false },
      200,
    );
    const before = advanceCommentary(emptyCommentary(), frame(g, 200), 200);
    g = submitGuess(
      g,
      "c",
      { direction: "DOWN", stake: 100, callShark: false },
      300,
    );
    const after = advanceCommentary(before, frame(g, 300), 300);
    expect(
      [...after.queue, ...after.published].some(
        (l) =>
          l.trigger === "fast" && l.turns.some((t) => t.text.includes("Casey")),
      ),
    ).toBe(true);
  });

  it("paces at 2.5 seconds and discards old-phase and old-game banter", () => {
    const f = frame();
    let s = advanceCommentary(emptyCommentary(), f, 0);
    expect(s.published[0].trigger).toBe("round");
    s = advanceCommentary(s, f, 2499);
    expect(s.published).toHaveLength(1);
    s = advanceCommentary(s, f, 2500);
    expect(s.published).toHaveLength(2);
    const tip = {
      ...f,
      phase: "GUESS" as const,
      tip: { direction: "UP" as const, strong: true },
    };
    s = advanceCommentary(s, tip, 5000);
    expect(s.published.map((l) => l.trigger)).toEqual(["strong"]);
    s = advanceCommentary(s, { ...f, gameId: "replacement" }, 6000);
    expect(s.published.every((l) => l.gameId === "replacement")).toBe(true);
  });
  it("covers chat, lock-ins, reconnects, deadlines, ratings, reveals and the closing bell", () => {
    let f = frame();
    let s = advanceCommentary(emptyCommentary(), f, 0);
    const triggers = new Set<string>();
    function step(next: CommentaryFrame, at: number) {
      f = next;
      s = advanceCommentary(s, f, at);
      for (const l of [...s.published, ...s.queue]) triggers.add(l.trigger);
    }
    step(
      { ...f, players: f.players.map((p) => ({ ...p, connected: false })) },
      1,
    );
    step(
      { ...f, players: f.players.map((p) => ({ ...p, connected: true })) },
      2,
    );
    step(
      {
        ...f,
        phase: "GUESS",
        phaseStartedAt: 20000,
        tip: { direction: "UP", strong: false },
      },
      20000,
    );
    step(
      {
        ...f,
        players: f.players.map((p) => ({ ...p, submitted: p.id === "b" })),
        chat: [
          { id: "chat", playerId: "b", text: "test", at: 20001, round: 1 },
        ],
      },
      20001,
    );
    const revealed = frame(resolved(), 40000);
    step(revealed, 40000);
    step(
      { ...revealed, phase: "FINAL", closingReport: "Alex takes the bell." },
      48000,
    );
    for (const required of [
      "reconnect",
      "tip",
      "timeout",
      "fast",
      "chat",
      "rating",
      "reveal",
      "allin",
      "end",
    ])
      expect(triggers.has(required), required).toBe(true);
    expect(
      s.published
        .flatMap((l) => l.turns)
        .some((t) => t.text.includes("Alex takes the bell.")) ||
        s.queue.some((l) => l.trigger === "end"),
    ).toBe(true);
  });
});
describe("per-browser commentary levels", () => {
  it.each(["OFF", "BIG MOMENTS", "NORMAL", "CHATTY"] as CommentaryLevel[])(
    "filters %s with priority first",
    (level) => {
      let s = advanceCaptions(
        emptyCaptions(),
        [line("low", "low"), line("medium", "medium"), line("high", "high")],
        level,
        0,
        "game",
        1,
        "TIP",
      );
      if (level === "OFF") {
        expect(s.current).toBeUndefined();
        expect(s.queue).toEqual([]);
        return;
      }
      expect(s.current?.id).toBe("high");
      expect(s.queue.map((l) => l.id)).toEqual(
        level === "BIG MOMENTS"
          ? []
          : level === "NORMAL"
            ? ["medium"]
            : ["medium", "low"],
      );
      const pace = level === "CHATTY" ? 2500 : 5000;
      s = advanceCaptions(
        s,
        [line("high2", "high")],
        level,
        pace - 1,
        "game",
        1,
        "TIP",
      );
      expect(s.current?.id).toBe("high");
      s = advanceCaptions(s, [], level, pace, "game", 1, "TIP");
      expect(s.current?.id).toBe("high2");
    },
  );
  it("drops stale lines, deduplicates snapshots and responds immediately to OFF", () => {
    let s = advanceCaptions(
      emptyCaptions(),
      [line("first", "high")],
      "NORMAL",
      0,
      "game",
      1,
      "TIP",
    );
    s = advanceCaptions(
      s,
      [line("first", "high")],
      "NORMAL",
      5000,
      "game",
      1,
      "TIP",
    );
    expect(s.queue).toEqual([]);
    s = advanceCaptions(
      s,
      [line("old", "high", 0)],
      "OFF",
      6000,
      "game",
      1,
      "TIP",
    );
    expect(s.current).toBeUndefined();
    s = advanceCaptions(
      s,
      [line("old", "high", 0)],
      "CHATTY",
      6500,
      "game",
      1,
      "TIP",
    );
    expect(s.current).toBeUndefined();
    s = advanceCaptions(
      s,
      [line("expired", "high", 0)],
      "NORMAL",
      21000,
      "game",
      1,
      "TIP",
    );
    expect(s.current).toBeUndefined();
    s = advanceCaptions(
      s,
      [line("wrong-phase", "high", 22000)],
      "CHATTY",
      22000,
      "game",
      2,
      "GUESS",
    );
    expect(s.current).toBeUndefined();
  });
});

it("retains a fresh caption that arrives just ahead of the client clock tick", () => {
  const incoming = line("fresh", "high", 101);
  const first = advanceCaptions(
    emptyCaptions(),
    [incoming],
    "NORMAL",
    100,
    "game",
    1,
    "TIP",
  );
  expect(first.current).toBeUndefined();
  expect(first.queue).toHaveLength(1);
  const next = advanceCaptions(
    first,
    [incoming],
    "NORMAL",
    200,
    "game",
    1,
    "TIP",
  );
  expect(next.current?.id).toBe("fresh");
});
