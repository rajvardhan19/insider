import type { GameState } from "../game/state.js";
import { awards, winners } from "../game/awards.js";
import { correctCalls } from "../game/scoring.js";
import type { NarrationRequest } from "./narrator.js";

/** Explicit allowlist: never pass private state, RNG, chat, or credentials. */
export function narrationFacts(
  g: GameState,
  kind: NarrationRequest["kind"],
): NarrationRequest {
  const name = (id: string) =>
    g.players.find((p) => p.id === id)?.name.slice(0, 24) ?? "Player";
  if (kind === "closing")
    return {
      kind,
      facts: {
        rounds: g.history.length,
        winners: winners(g).map(name),
        players: g.players.map((p) => ({
          name: name(p.id),
          coins: p.coins,
          trust: p.trust,
          correctCalls: correctCalls(g.history, p.id),
        })),
        awards: awards(g).map((a) => ({
          title: a.title,
          players: a.playerIds.map(name),
        })),
      },
    };
  const r = g.history.at(-1)!;
  return {
    kind,
    facts: {
      round: r.round,
      company: r.news.company,
      direction: r.direction,
      insider: name(r.insiderId),
      role: r.role,
      tip: { direction: r.tip.direction, strong: r.tip.strong },
      truthful: r.tip.direction === r.direction,
      outcomes: r.outcomes.map((o) => ({
        player: name(o.playerId),
        satOut: o.satOut,
        delta: o.delta,
        guess: o.guess
          ? {
              direction: o.guess.direction,
              stake: o.guess.stake,
              callShark: o.guess.callShark,
            }
          : null,
        correct: o.correct,
        callDelta: o.callDelta,
      })),
    },
  };
}
