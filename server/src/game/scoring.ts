import type { Outcome, RoundResult } from "@insider/shared";
import type { GameState, Round } from "./state.js";
import { RULES as R } from "./rules.js";
export function scoreRound(
  round: Round,
  playerIds: string[],
): { outcomes: Outcome[]; trustDelta: number } {
  if (!round.tip) throw new Error("A round needs an official tip.");
  const outcomes: Outcome[] = playerIds.map((playerId) => ({
    playerId,
    correct: false,
    directionDelta: 0,
    callDelta: 0,
    insiderDelta: 0,
    delta: 0,
    satOut: false,
  }));
  const insider = outcomes.find((x) => x.playerId === round.insiderId)!;
  let caught = false,
    sympathy = false;
  for (const out of outcomes) {
    if (out.playerId === round.insiderId) continue;
    const guess = round.guesses[out.playerId];
    if (!guess) {
      out.satOut = true;
      continue;
    }
    out.guess = { ...guess };
    out.correct = guess.direction === round.direction;
    out.directionDelta = out.correct ? guess.stake : -guess.stake;
    const success = round.role === "PARTNER" ? out.correct : !out.correct;
    insider.insiderDelta += round.tip.strong
      ? success
        ? R.strongSuccess
        : R.strongFailure
      : success
        ? R.normalSuccess
        : 0;
    if (guess.callShark) {
      if (round.role === "SHARK") {
        out.callDelta = R.correctCall;
        insider.callDelta -= R.correctCall;
        caught = true;
      } else {
        out.callDelta = R.wrongCall;
        sympathy = true;
      }
    }
  }
  for (const out of outcomes)
    out.delta = out.directionDelta + out.callDelta + out.insiderDelta;
  const truth = round.tip.direction === round.direction;
  const trustDelta =
    (truth ? R.truthTrust : R.lieTrust) * (round.tip.strong ? 2 : 1) +
    (caught ? R.caughtTrust : 0) +
    (sympathy ? R.sympathyTrust : 0);
  return { outcomes, trustDelta };
}
export function correctCalls(history: RoundResult[], id: string) {
  return history.filter(
    (r) =>
      r.role === "SHARK" &&
      r.outcomes.some((o) => o.playerId === id && o.guess?.callShark),
  ).length;
}
export function standings(g: GameState) {
  return [...g.players].sort(
    (a, b) =>
      b.coins - a.coins ||
      correctCalls(g.history, b.id) - correctCalls(g.history, a.id),
  );
}
