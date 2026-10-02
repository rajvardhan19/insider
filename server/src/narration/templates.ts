import type { RoundResult } from "@insider/shared";
import type { GameState, Player } from "../game/state.js";
import { winners } from "../game/awards.js";
export const HEADLINES = [
  "The closing bell has opinions.",
  "The market has entered its dramatic era.",
  "Confidence was not a strategy.",
  "Trust just found its price.",
  "The receipts are in.",
  "Another day on the rumor exchange.",
  "Someone should have read the fine print.",
  "The ticker tells all.",
  "The market has spoken. Loudly.",
  "The floor would like a word.",
  "A volatile afternoon for friendships.",
  "The truth finally went public.",
  "The portfolio has feelings.",
  "Analysts are taking notes.",
  "Consider this a learning dividend.",
  "A fresh entry in the book of questionable tips.",
  "The rumor mill closes in five.",
  "That confidence came with a spread.",
  "The market enjoys a plot twist.",
  "Credibility is trading actively.",
  "A dramatic finish on the trust exchange.",
  "The floor is reviewing the tape.",
  "Some tips age faster than others.",
  "The bell brought receipts.",
  "A small correction in the friendship market.",
  "Breaking: conviction meets accounting.",
  "Please keep your feelings inside the portfolio.",
  "A lively session for imaginary money.",
  "The audit has begun.",
  "A headline worth holding.",
  "Rumors settle. Balances remain.",
  "A sharp move on very personal news.",
  "The desk reports elevated eyebrows.",
  "Today’s most liquid asset: doubt.",
  "Someone priced in the wrong story.",
  "The next tip comes with baggage.",
  "The market rewards a good read.",
  "Reputations remain open for trading.",
  "A memorable candle on the chart.",
  "The floor is officially awake.",
];
export function roundNarration(
  r: RoundResult,
  players: Player[],
  draw: number,
) {
  const name = players.find((p) => p.id === r.insiderId)!.name,
    wrong = r.outcomes.filter((o) => o.guess && !o.correct).length,
    correct = r.outcomes.filter((o) => o.guess && o.correct).length,
    calls = r.outcomes.filter((o) => o.guess?.callShark).length;
  const truth = r.tip.direction === r.direction;
  const detail =
    r.role === "PARTNER"
      ? `${name} was a Partner. ${correct} correct read${correct === 1 ? "" : "s"}${calls ? `; ${calls} false accusation${calls === 1 ? "" : "s"}` : ""}.`
      : `${name} was a Shark ${truth ? "telling the truth" : "selling a lie"}. ${wrong} wrong pick${wrong === 1 ? "" : "s"}; ${calls} correct Shark call${calls === 1 ? "" : "s"}.`;
  return `${HEADLINES[Math.floor(draw * HEADLINES.length)]} ${detail}`;
}
export function closingNarration(g: GameState) {
  const names = winners(g)
    .map((id) => g.players.find((p) => p.id === id)!.name)
    .join(" and ");
  const total = g.history
    .flatMap((r) => r.outcomes)
    .filter((o) => o.guess?.callShark && o.callDelta > 0).length;
  return `${names} ${winners(g).length === 1 ? "takes" : "share"} the closing bell. The floor recorded ${total} correct Shark call${total === 1 ? "" : "s"} across ${g.round} rounds. Reputations may recover. The receipts will remain.`;
}
