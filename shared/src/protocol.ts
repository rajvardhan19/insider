export type Direction = "UP" | "DOWN";
export type Role = "PARTNER" | "SHARK";
export type Phase = "LOBBY" | "TIP" | "GUESS" | "REVEAL" | "FINAL";
export type Mode = "QUICK" | "FULL";
export type Personality =
  "lucy" | "sam" | "nina" | "walt" | "sal" | "penny" | "ollie" | "rex";
export type Stake = 100 | 200 | 300;
export interface News {
  id: string;
  company: string;
  description: string;
  headline: string;
  sentiment: Direction;
}
export interface Tip {
  direction: Direction;
  strong: boolean;
}
export interface Guess {
  direction: Direction;
  stake: Stake;
  callShark: boolean;
}
export interface Outcome {
  playerId: string;
  guess?: Guess;
  correct: boolean;
  directionDelta: number;
  callDelta: number;
  insiderDelta: number;
  delta: number;
  satOut: boolean;
}
export interface RoundResult {
  round: number;
  insiderId: string;
  news: News;
  direction: Direction;
  role: Role;
  accurate: boolean;
  tip: Tip;
  outcomes: Outcome[];
  trustDelta: number;
  narration: string;
  revealedAt: number;
}
export interface PublicPlayer {
  id: string;
  name: string;
  bot?: Personality;
  connected: boolean;
  coins: number;
  trust: number;
  trustHistory: number[];
  record: string[];
  allInUsed: boolean;
  submitted: boolean;
}
export interface Chat {
  id: string;
  playerId: string;
  text: string;
  phraseId?: string;
  at: number;
  round: number;
}
export interface Award {
  title: string;
  playerIds: string[];
  description: string;
}
export interface PlayerView {
  protocol: 1;
  roomId: string;
  code: string;
  revision: number;
  serverNow: number;
  me: string;
  hostId: string;
  mode: Mode;
  solo: boolean;
  spectating?: boolean;
  phase: Phase;
  gameId: string | null;
  round: number;
  totalRounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  players: PublicPlayer[];
  chat: Chat[];
  news?: News;
  insiderId?: string;
  tip?: Tip;
  ownGuess?: Guess;
  secrets?: { direction: Direction; role: Role; accurate: boolean };
  result?: RoundResult;
  history: RoundResult[];
  awards: Award[];
  winners: string[];
  closingReport?: string;
  analystNote: boolean;
}

export type Ack =
  | { ok: true; code?: string; token?: string }
  | { ok: false; code: string; message: string };
