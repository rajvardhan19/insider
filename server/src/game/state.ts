import type {
  Chat,
  Guess,
  Mode,
  News,
  Personality,
  Phase,
  Role,
  Direction,
  RoundResult,
  Tip,
} from "@insider/shared";
export interface Player {
  id: string;
  name: string;
  bot?: Personality;
  connected: boolean;
  coins: number;
  trust: number;
  trustHistory: number[];
  record: string[];
  allInUsed: boolean;
}
export interface Round {
  insiderId: string;
  news: News;
  direction: Direction;
  role: Role;
  accurate: boolean;
  tip?: Tip;
  guesses: Record<string, Guess>;
}
export interface GameState {
  id: string;
  rulesVersion: string;
  mode: Mode;
  players: Player[];
  phase: Phase;
  round: number;
  totalRounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  current: Round;
  history: RoundResult[];
  usedNews: string[];
  rng: number;
  botRng: number;
  cosmeticRng: number;
  chat: Chat[];
  firstGame: boolean;
  closingReport?: string;
}
export class GameError extends Error {
  constructor(
    public code: string,
    message = code.replaceAll("_", " ").toLowerCase(),
  ) {
    super(message);
  }
}
export function requireRule(
  condition: unknown,
  code: string,
  message?: string,
): asserts condition {
  if (!condition) throw new GameError(code, message);
}
