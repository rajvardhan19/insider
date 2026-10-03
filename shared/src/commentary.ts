import type {
  Chat,
  CommentaryLine,
  Phase,
  RoundResult,
  Tip,
} from "./protocol.js";
export type CommentaryLevel = "OFF" | "BIG MOMENTS" | "NORMAL" | "CHATTY";
export const COMMENTARY_LEVELS: CommentaryLevel[] = [
  "OFF",
  "BIG MOMENTS",
  "NORMAL",
  "CHATTY",
];
export const priorityScore = { high: 3, medium: 2, low: 1 };
/** No private current-round fields, player selections, or RNG exist in this contract. */
export interface CommentaryFrame {
  gameId: string;
  round: number;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  insiderId: string;
  company: string;
  tip?: Tip;
  players: {
    id: string;
    name: string;
    trust: number;
    connected: boolean;
    submitted: boolean;
  }[];
  chat: Chat[];
  history: RoundResult[]; // Immutable, already publicly revealed records only.
  closingReport?: string;
}
export interface CaptionState {
  queue: CommentaryLine[];
  seen: string[];
  lastAt: number;
  current?: CommentaryLine;
}
export function emptyCaptions(): CaptionState {
  return { queue: [], seen: [], lastAt: -Infinity };
}
/** Clients never reschedule a consumed line after switching levels or reconnecting. */
export function advanceCaptions(
  state: CaptionState,
  incoming: CommentaryLine[],
  level: CommentaryLevel,
  now: number,
  gameId: string,
  round: number,
  phase: Phase,
): CaptionState {
  const next = structuredClone(state);
  const accepts = (line: CommentaryLine) =>
    level !== "OFF" &&
    (level === "CHATTY" ||
      line.priority === "high" ||
      (level === "NORMAL" && line.priority === "medium"));
  const relevant = (line: CommentaryLine) =>
    line.gameId === gameId &&
    line.round === round &&
    line.phase === phase &&
    line.expiresAt > now;
  for (const line of incoming) {
    if (next.seen.includes(line.id)) continue;
    next.seen.push(line.id);
    if (accepts(line) && relevant(line)) next.queue.push(line);
  }
  next.seen = next.seen.slice(-100);
  next.queue = next.queue
    .filter((l) => accepts(l) && relevant(l))
    .sort(
      (a, b) =>
        priorityScore[b.priority] - priorityScore[a.priority] || a.at - b.at,
    )
    .slice(0, 12);
  if (next.current && (!accepts(next.current) || !relevant(next.current)))
    next.current = undefined;
  if (level === "OFF") {
    next.queue = [];
    next.current = undefined;
    return next;
  }
  const pace = level === "CHATTY" ? 2500 : 5000;
  if (
    now - next.lastAt >= pace &&
    next.queue.length &&
    next.queue[0].at <= now
  ) {
    next.current = next.queue.shift();
    next.lastAt = now;
  }
  return next;
}
