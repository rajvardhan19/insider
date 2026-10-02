import type { Award } from "@insider/shared";
import type { GameState } from "./state.js";
import { correctCalls, standings } from "./scoring.js";
export function awards(g: GameState): Award[] {
  const result: Award[] = [];
  function best(
    title: string,
    description: string,
    values: { id: string; n: number; t?: number }[],
    positive = true,
  ) {
    values.sort((a, b) => b.n - a.n || (b.t ?? 0) - (a.t ?? 0));
    const top = values[0];
    if (!top || (positive && top.n <= 0)) return;
    result.push({
      title,
      description,
      playerIds: values
        .filter((v) => v.n === top.n && (v.t ?? 0) === (top.t ?? 0))
        .map((v) => v.id),
    });
  }
  best(
    "Best Detective",
    "Most correct Shark calls",
    g.players.map((p) => ({ id: p.id, n: correctCalls(g.history, p.id) })),
  );
  best(
    "Most Trusted",
    "Highest closing trust price",
    g.players.map((p) => ({ id: p.id, n: p.trust })),
    false,
  );
  best(
    "Most Fooled",
    "Most wrong picks against Sharks",
    g.players.map((p) => {
      const outcomes = g.history
        .filter((r) => r.role === "SHARK")
        .flatMap((r) =>
          r.outcomes.filter(
            (o) => o.playerId === p.id && o.guess && !o.correct,
          ),
        );
      return {
        id: p.id,
        n: outcomes.length,
        t: outcomes.reduce((a, o) => a - o.directionDelta, 0),
      };
    }),
  );
  const bluffs = g.players.flatMap((p) => {
    const rounds = g.history
      .filter((r) => r.role === "SHARK" && r.insiderId === p.id)
      .map((r) => ({
        id: p.id,
        n: r.outcomes.find((o) => o.playerId === p.id)!.delta,
        t: r.outcomes
          .filter((o) => o.guess && !o.correct)
          .reduce((a, o) => a - o.directionDelta, 0),
      }));
    rounds.sort((a, b) => b.n - a.n || b.t - a.t);
    return rounds.slice(0, 1);
  });
  best("Biggest Bluff", "Largest profitable Shark round", bluffs);
  return result;
}
export function winners(g: GameState) {
  const sorted = standings(g),
    top = sorted[0];
  return sorted
    .filter(
      (p) =>
        p.coins === top.coins &&
        correctCalls(g.history, p.id) === correctCalls(g.history, top.id),
    )
    .map((p) => p.id);
}
