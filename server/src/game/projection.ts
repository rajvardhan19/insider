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
    roomId: room.id,
    code: room.code,
    revision: room.revision,
    serverNow: now,
    me,
    hostId: room.hostId,
    mode: room.mode,
    solo: room.solo,
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
