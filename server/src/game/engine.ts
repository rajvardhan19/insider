import type { Guess, Mode, News, Tip } from "@insider/shared";
import { samples } from "./rng.js";
import { RULES as R, totalRounds } from "./rules.js";
import { type GameState, type Player, requireRule } from "./state.js";
import { scoreRound } from "./scoring.js";
import { roundNarration, closingNarration } from "../narration/templates.js";
export function freshPlayer(
  id: string,
  name: string,
  bot?: Player["bot"],
): Player {
  return {
    id,
    name,
    bot,
    connected: true,
    coins: R.startingCoins,
    trust: R.startingTrust,
    trustHistory: [R.startingTrust],
    record: [],
    allInUsed: false,
  };
}
export function startGame(
  players: Player[],
  mode: Mode,
  id: string,
  seed: number,
  now: number,
  pool: News[],
  firstGame = false,
): GameState {
  requireRule(players.length >= 2 && players.length <= 5, "INVALID_ROSTER");
  requireRule(
    new Set(players.map((p) => p.id)).size === players.length &&
      players.some((p) => !p.bot),
    "INVALID_ROSTER",
  );
  requireRule(mode === "QUICK" || mode === "FULL", "INVALID_MODE");
  requireRule(
    new Set(pool.map((n) => n.id)).size === pool.length,
    "DUPLICATE_NEWS",
  );
  requireRule(
    pool.length >= totalRounds(players.length, mode),
    "NOT_ENOUGH_NEWS",
  );
  const g: Omit<GameState, "current"> = {
    id,
    rulesVersion: R.version,
    mode,
    players: players.map((p) => ({
      ...freshPlayer(p.id, p.name, p.bot),
      connected: p.connected,
    })),
    phase: "LOBBY",
    round: 0,
    totalRounds: totalRounds(players.length, mode),
    phaseStartedAt: now,
    phaseEndsAt: now,
    history: [],
    usedNews: [],
    rng: seed,
    botRng: seed ^ 0x12ab34cd,
    cosmeticRng: seed ^ 0x7c938a21,
    chat: [],
    firstGame,
  };
  return startRound(g, now, pool);
}
export function startRound(
  state: Omit<GameState, "current"> & { current?: GameState["current"] },
  now: number,
  pool: News[],
): GameState {
  requireRule(
    (state.phase === "LOBBY" || state.phase === "REVEAL") &&
      state.round < state.totalRounds,
    "WRONG_PHASE",
  );
  const g = structuredClone(state),
    [draws, next] = samples(g.rng, 3);
  g.rng = next;
  const available = pool.filter((n) => !g.usedNews.includes(n.id));
  requireRule(available.length, "NOT_ENOUGH_NEWS");
  const news = available[Math.floor(draws[0] * available.length)];
  g.usedNews.push(news.id);
  g.round++;
  const accurate = draws[1] < R.accuracy;
  const current: GameState["current"] = {
    insiderId: g.players[(g.round - 1) % g.players.length].id,
    news: structuredClone(news),
    accurate,
    direction: accurate ? news.sentiment : opposite(news.sentiment),
    role: draws[2] < R.sharkChance ? "SHARK" : "PARTNER",
    guesses: {},
  };
  g.phase = "TIP";
  g.phaseStartedAt = now;
  g.phaseEndsAt = now + (g.mode === "QUICK" ? R.quickMs : R.fullMs);
  return { ...g, current };
}
export function opposite(d: "UP" | "DOWN") {
  return d === "UP" ? "DOWN" : "UP";
}
export function submitTip(
  state: GameState,
  id: string,
  tip: Tip,
  now: number,
): GameState {
  requireRule(state.phase === "TIP", "WRONG_PHASE");
  requireRule(now < state.phaseEndsAt, "DEADLINE_PASSED");
  requireRule(id === state.current.insiderId, "UNAUTHORIZED");
  requireRule(
    (tip.direction === "UP" || tip.direction === "DOWN") &&
      typeof tip.strong === "boolean",
    "INVALID_INPUT",
  );
  const g = structuredClone(state);
  g.current.tip = { direction: tip.direction, strong: tip.strong };
  g.phase = "GUESS";
  g.phaseStartedAt = now;
  g.phaseEndsAt = now + (g.mode === "QUICK" ? R.quickMs : R.fullMs);
  return g;
}
export function submitGuess(
  state: GameState,
  id: string,
  guess: Guess,
  now: number,
): GameState {
  requireRule(state.phase === "GUESS", "WRONG_PHASE");
  requireRule(now < state.phaseEndsAt, "DEADLINE_PASSED");
  const player = state.players.find((p) => p.id === id);
  requireRule(player && id !== state.current.insiderId, "UNAUTHORIZED");
  requireRule(!state.current.guesses[id], "ALREADY_SUBMITTED");
  requireRule(
    [100, 200, 300].includes(guess.stake) &&
      (guess.direction === "UP" || guess.direction === "DOWN") &&
      typeof guess.callShark === "boolean",
    "INVALID_INPUT",
  );
  requireRule(guess.stake !== 300 || !player.allInUsed, "ALL_IN_USED");
  const g = structuredClone(state);
  g.current.guesses[id] = {
    direction: guess.direction,
    stake: guess.stake,
    callShark: guess.callShark,
  };
  // The consumable is committed publicly only at reveal; a player cannot submit twice.
  return Object.keys(g.current.guesses).length === g.players.length - 1
    ? resolveRound(g, now)
    : g;
}
export function resolveRound(state: GameState, now: number): GameState {
  requireRule(state.phase === "GUESS", "WRONG_PHASE");
  const g = structuredClone(state),
    r = g.current;
  const { outcomes, trustDelta } = scoreRound(
    r,
    g.players.map((p) => p.id),
  );
  let appliedTrustDelta = 0;
  for (const p of g.players) {
    const o = outcomes.find((x) => x.playerId === p.id)!;
    p.coins += o.delta;
    if (o.guess?.stake === 300) p.allInUsed = true;
    if (p.id === r.insiderId) {
      const before = p.trust;
      p.trust = Math.max(R.minTrust, p.trust + trustDelta);
      appliedTrustDelta = p.trust - before;
      p.record.push(
        `${r.role === "SHARK" ? "Shark" : "Partner"} (${r.tip!.direction === r.direction ? "truth" : "lied"}${r.tip!.strong ? ", Strong" : ""})`,
      );
    }
    p.trustHistory.push(p.trust);
  }
  const result = {
    round: g.round,
    insiderId: r.insiderId,
    news: r.news,
    direction: r.direction,
    role: r.role,
    accurate: r.accurate,
    tip: r.tip!,
    outcomes,
    trustDelta: appliedTrustDelta,
    narration: "",
    revealedAt: now,
  };
  const [draws, next] = samples(g.cosmeticRng, 1);
  g.cosmeticRng = next;
  result.narration = roundNarration(result, g.players, draws[0]);
  g.history.push(result);
  g.phase = "REVEAL";
  g.phaseStartedAt = now;
  g.phaseEndsAt = now + R.revealMs;
  return g;
}
export function expire(state: GameState, now: number, pool: News[]): GameState {
  if (now < state.phaseEndsAt || state.phase === "FINAL") return state;
  if (state.phase === "TIP") {
    const g = structuredClone(state),
      [v, next] = samples(g.rng, 1);
    g.rng = next;
    return submitTip(
      { ...g, phaseEndsAt: now + 1 },
      g.current.insiderId,
      { direction: v[0] < 0.5 ? "UP" : "DOWN", strong: false },
      now,
    );
  }
  if (state.phase === "GUESS") return resolveRound(state, now);
  if (state.phase === "REVEAL") {
    if (state.round === state.totalRounds) {
      const g = structuredClone(state);
      g.phase = "FINAL";
      g.phaseStartedAt = now;
      g.phaseEndsAt = 0;
      g.closingReport ??= closingNarration(g);
      return g;
    }
    return startRound(state, now, pool);
  }
  return state;
}
