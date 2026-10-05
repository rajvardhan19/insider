import type { Mode } from "./protocol.js";
export const MAX_PLAYERS = 20;
export const MAX_INSIDER_TURNS = 6;
export const MAX_ROUNDS = MAX_PLAYERS * MAX_INSIDER_TURNS;
export function sessionRounds(
  count: number,
  mode: Mode,
  insiderTurns?: number,
) {
  const turns =
    insiderTurns ??
    (count >= 4 ? 1 : count === 3 ? 2 : 3) * (mode === "FULL" ? 2 : 1);
  return count * turns;
}
