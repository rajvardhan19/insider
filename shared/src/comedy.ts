import data from "./content/comedy.json";
import type { PlayerView } from "./protocol.js";
export const COMEDY = data;
export function creditRating(trust: number) {
  return (
    data.ratings.find((rating) => trust >= rating.min)?.label ?? "Known Fraud"
  );
}
export function copy(
  spot: keyof typeof data.microcopy,
  seed = 0,
  slots: Record<string, string | number> = {},
) {
  const lines = data.microcopy[spot];
  return lines[Math.abs(seed) % lines.length].replace(
    /\{(\w+)\}/g,
    (_, key: string) =>
      String(
        key === "people"
          ? slots.count === 1
            ? "person"
            : "people"
          : (slots[key] ?? ""),
      ),
  );
}
export function lostAllIn(
  view: Pick<PlayerView, "history" | "round">,
  id: string,
) {
  return view.history.some(
    (r) =>
      r.round >= view.round - 1 &&
      r.outcomes.some(
        (o) => o.playerId === id && o.guess?.stake === 300 && !o.correct,
      ),
  );
}
