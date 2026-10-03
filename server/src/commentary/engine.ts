import {
  creditRating,
  COMEDY,
  priorityScore,
  type CommentaryFrame,
  type CommentaryLine,
} from "@insider/shared";
import templates from "./lines.json";
type Trigger = (typeof templates)[number]["trigger"];
export interface CommentaryState {
  previous?: CommentaryFrame;
  queue: CommentaryLine[];
  published: CommentaryLine[];
  lastAt: number;
  serial: number;
}
export function emptyCommentary(): CommentaryState {
  return { queue: [], published: [], lastAt: -Infinity, serial: 0 };
}
/** Callbacks are derived exclusively from revealed history, never from current-round secrets. */
export function publicMemory(frame: CommentaryFrame) {
  const name = (id: string) =>
    frame.players.find((p) => p.id === id)?.name ??
    COMEDY.messages.unknownTrader;
  const past = frame.history.filter((r) => r.round < frame.round);
  const fooled = past
    .filter((r) => r.role === "SHARK")
    .flatMap((r) =>
      r.outcomes
        .filter((o) => o.guess && !o.correct)
        .map((o) => ({
          insider: r.insiderId,
          victim: o.playerId,
          loss: -o.directionDelta,
          name: name(r.insiderId),
          victimName: name(o.playerId),
        })),
    );
  const own = past.filter((r) => r.insiderId === frame.insiderId);
  const truth = own.at(-1)
    ? own.at(-1)!.tip.direction === own.at(-1)!.direction
    : true;
  let streak = 0;
  for (const r of [...own].reverse()) {
    if ((r.tip.direction === r.direction) !== truth) break;
    streak++;
  }
  return {
    fooled,
    truth,
    streak,
    lostAllIns: past.flatMap((r) =>
      r.outcomes
        .filter((o) => o.guess?.stake === 300 && !o.correct)
        .map((o) => ({
          playerId: o.playerId,
          round: r.round,
          name: name(o.playerId),
        })),
    ),
    ratingChanges: past
      .filter((r) => r.trustDelta !== 0)
      .map((r) => ({
        playerId: r.insiderId,
        round: r.round,
        delta: r.trustDelta,
      })),
    repeatedCompany: past.some((r) => r.news.company === frame.company),
  };
}
export function advanceCommentary(
  state: CommentaryState,
  frame: CommentaryFrame,
  now: number,
): CommentaryState {
  const s =
    state.previous?.gameId === frame.gameId
      ? structuredClone(state)
      : emptyCommentary();
  const old = s.previous;
  const name = (id: string) =>
    frame.players.find((p) => p.id === id)?.name ??
    COMEDY.messages.unknownTrader;
  const base = {
    name: name(frame.insiderId),
    round: frame.round,
    tip: frame.tip?.direction === "UP" ? "BUY" : "SELL",
    company: frame.company,
  };
  const add = (
    trigger: Trigger,
    values: Record<string, string | number> = {},
  ) => {
    const pool = templates.filter((l) => l.trigger === trigger);
    const template = pool[(frame.round + s.serial) % pool.length];
    const slots: Record<string, string | number> = { ...base, ...values };
    s.queue.push({
      trigger,
      id: `${frame.gameId}:caption:${++s.serial}`,
      gameId: frame.gameId,
      round: frame.round,
      phase: frame.phase,
      priority: template.priority as CommentaryLine["priority"],
      at: now,
      expiresAt: now + 12000,
      turns: template.turns.map((t) => ({
        speaker: t.speaker as "Brad Bull" | "Barb Bear",
        text: t.text.replace(/\{(\w+)\}/g, (_, key: string) =>
          String(slots[key] ?? ""),
        ),
      })),
    });
  };
  const newRound = !old || old.round !== frame.round;
  if (newRound && frame.phase === "TIP") {
    add("round");
    add("deciding");
    const memory = publicMemory(frame);
    const grudge = [...memory.fooled]
      .reverse()
      .find(
        (r) =>
          r.insider === frame.insiderId &&
          frame.players.some((p) => p.id === r.victim),
      );
    if (grudge) add("grudge", { victim: grudge.victimName, loss: grudge.loss });
    const lost = memory.lostAllIns.find(
      (l) => l.playerId === frame.insiderId && l.round === frame.round - 1,
    );
    if (lost) add("allin", { name: lost.name });
    if (memory.streak >= 2)
      add(memory.truth ? "truth" : "lie", { streak: memory.streak });
    if (memory.repeatedCompany) add("repeat");
  }
  if (frame.phase === "GUESS" && old?.phase !== "GUESS") {
    add(frame.tip?.strong ? "strong" : "tip");
    if (old?.phase === "TIP" && frame.phaseStartedAt >= old.phaseEndsAt)
      add("timeout");
  }
  for (const player of frame.players) {
    const before = old?.players.find((p) => p.id === player.id);
    if (before && !before.connected && player.connected)
      add("reconnect", { name: player.name });
    if (before && creditRating(before.trust) !== creditRating(player.trust))
      add("rating", { name: player.name, rating: creditRating(player.trust) });
    if (
      before &&
      !before.submitted &&
      player.submitted &&
      frame.phase === "GUESS" &&
      now - frame.phaseStartedAt <= 3000
    )
      add("fast", { name: player.name });
  }
  for (const chat of frame.chat.filter(
    (c) =>
      c.round === frame.round &&
      now - c.at < 5000 &&
      !old?.chat.some((o) => o.id === c.id),
  ))
    add("chat", { name: name(chat.playerId) });
  if (frame.phase === "REVEAL" && old?.phase !== "REVEAL") {
    const r = frame.history.at(-1);
    if (r) {
      add("reveal", { report: r.narration });
      for (const o of r.outcomes) {
        if (
          old?.phase === "GUESS" &&
          now - old.phaseStartedAt <= 3000 &&
          o.guess &&
          !old.players.find((p) => p.id === o.playerId)?.submitted
        )
          add("fast", { name: name(o.playerId) });
        if (o.satOut) add("timeout", { name: name(o.playerId) });
        if (o.guess?.stake === 300 && !o.correct)
          add("allin", { name: name(o.playerId) });
      }
    }
  }
  if (frame.phase === "FINAL" && old?.phase !== "FINAL")
    add("end", {
      report: frame.closingReport ?? COMEDY.messages.closingFallback,
    });
  const relevant = (l: CommentaryLine) =>
    l.round === frame.round && l.phase === frame.phase && l.expiresAt > now;
  s.queue = s.queue
    .filter(relevant)
    .sort(
      (a, b) =>
        priorityScore[b.priority] - priorityScore[a.priority] || a.at - b.at,
    )
    .slice(0, 12);
  s.published = s.published.filter(relevant).slice(-8);
  if (now - s.lastAt >= 2500 && s.queue.length) {
    const next = s.queue.shift()!;
    // Publication time, not trigger time, controls client pacing.
    next.at = now;
    s.published.push(next);
    s.lastAt = now;
  }
  s.previous = structuredClone(frame);
  return s;
}
