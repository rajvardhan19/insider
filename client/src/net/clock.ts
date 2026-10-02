/** Rendering only: the server remains responsible for advancing the phase. */
export function secondsRemaining(
  startedAt: number,
  endsAt: number,
  now: number,
) {
  return Math.min(
    Math.max(0, Math.ceil((endsAt - startedAt) / 1000)),
    Math.max(0, Math.ceil((endsAt - now) / 1000)),
  );
}
