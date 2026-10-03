import type { PlayerView } from "@insider/shared";
import type { GameState, Player } from "./state.js";
import { awards, winners } from "./awards.js";
export interface ProjectableRoom {
  id: string;
  code: string;
  revision: number;
  hostId: string;
  mode: "QUICK" | "FULL";
  solo: boolean;
  simulation?: boolean;
  commentary?: { published: import("@insider/shared").CommentaryLine[] };
  reactions?: import("@insider/shared").Reaction[];
  players: Player[];
  game?: GameState;
}
export function buildPlayerView(
  room: ProjectableRoom,
  me: string,
  now: number,
): PlayerView {
  const g = room.game,
    r = g?.current,
    phase = g?.phase ?? "LOBBY";
  const view: PlayerView = {
    protocol: 1,
    commentary: structuredClone(room.commentary?.published ?? []),
    reactions: structuredClone(
      (room.reactions ?? []).filter(
        (r) => r.round === g?.round && now - r.at < 2500 && phase === "REVEAL",
      ),
    ),
    roomId: room.id,
    code: room.code,
    revision: room.revision,
    serverNow: now,
    me,
    hostId: room.hostId,
    mode: room.mode,
    solo: room.solo,
    spectating: room.simulation ?? false,
    phase,
    gameId: g?.id ?? null,
    round: g?.round ?? 0,
    totalRounds: g?.totalRounds ?? 0,
    phaseStartedAt: g?.phaseStartedAt ?? 0,
    phaseEndsAt: g?.phaseEndsAt ?? 0,
    players: (g?.players ?? room.players).map((p) => ({
      id: p.id,
      name: p.name,
      bot: p.bot,
      connected: p.connected,
      coins: p.coins,
      trust: p.trust,
      trustHistory: [...p.trustHistory],
      record: [...p.record],
      allInUsed: p.allInUsed,
      submitted: phase === "GUESS" && Boolean(r?.guesses[p.id]),
    })),
    chat: structuredClone(g?.chat ?? []),
    history: structuredClone(g?.history ?? []),
    awards: g?.phase === "FINAL" ? awards(g) : [],
    winners: g?.phase === "FINAL" ? winners(g) : [],
    analystNote: Boolean(
      room.solo && g?.firstGame && g.round === 3 && phase === "REVEAL",
    ),
  };
  if (g && r) {
    view.news = structuredClone(r.news);
    view.insiderId = r.insiderId;
    if (r.tip) view.tip = { ...r.tip };
    if (r.guesses[me]) view.ownGuess = { ...r.guesses[me] };
    if (me === r.insiderId && (phase === "TIP" || phase === "GUESS"))
      view.secrets = {
        direction: r.direction,
        role: r.role,
        accurate: r.accurate,
      };
    if (phase === "REVEAL" || phase === "FINAL")
      view.result = structuredClone(g.history.at(-1));
    if (phase === "FINAL") view.closingReport = g.closingReport;
  }
  return view;
}

/** The sole doorway to the commentary engine. Never pass a GameState to it. */
export function buildCommentaryFrame(
  room: ProjectableRoom,
  now: number,
): import("@insider/shared").CommentaryFrame | null {
  const v = buildPlayerView(room, "__public_commentary__", now);
  if (!v.gameId || !v.insiderId || !v.news) return null;
  return {
    gameId: v.gameId,
    round: v.round,
    phase: v.phase,
    phaseStartedAt: v.phaseStartedAt,
    phaseEndsAt: v.phaseEndsAt,
    insiderId: v.insiderId,
    company: v.news.company,
    tip: v.tip
      ? { direction: v.tip.direction, strong: v.tip.strong }
      : undefined,
    players: v.players.map((p) => ({
      id: p.id,
      name: p.name,
      trust: p.trust,
      connected: p.connected,
      submitted: p.submitted,
    })),
    chat: v.chat.map((c) => ({
      id: c.id,
      playerId: c.playerId,
      text: c.text,
      phraseId: c.phraseId,
      at: c.at,
      round: c.round,
    })),
    history: v.history.filter(
      (r) => r.round < v.round || v.phase === "REVEAL" || v.phase === "FINAL",
    ),
    closingReport: v.closingReport,
  };
}
