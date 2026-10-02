import type { Guess, Direction, Role } from "@insider/shared";
export type Script = {
  direction: Direction;
  role: Role;
  tip: Direction;
  strong?: boolean;
  guesses: Record<string, Guess>;
  coins: number[];
  trust: number[];
};
const guess = (
  direction: Direction,
  stake: 100 | 200 | 300 = 100,
  callShark = false,
): Guess => ({ direction, stake, callShark });
export const demos: Record<"A" | "B", { names: string[]; rounds: Script[] }> = {
  A: {
    names: ["Maya", "Leo", "Priya", "Dev"],
    rounds: [
      {
        direction: "DOWN",
        role: "PARTNER",
        tip: "DOWN",
        guesses: {
          Leo: guess("DOWN"),
          Priya: guess("DOWN", 200),
          Dev: guess("UP", 100, true),
        },
        coins: [1100, 1100, 1200, 750],
        trust: [125, 100, 100, 100],
      },
      {
        direction: "DOWN",
        role: "SHARK",
        tip: "UP",
        strong: true,
        guesses: {
          Maya: guess("UP", 200, true),
          Priya: guess("DOWN", 100, true),
        },
        coins: [1000, 900, 1400, 750],
        trust: [125, 50, 100, 100],
      },
      {
        direction: "UP",
        role: "SHARK",
        tip: "UP",
        strong: true,
        guesses: {
          Maya: guess("DOWN", 200),
          Leo: guess("DOWN", 300),
          Dev: guess("UP"),
        },
        coins: [800, 600, 1500, 850],
        trust: [125, 50, 130, 100],
      },
      {
        direction: "UP",
        role: "SHARK",
        tip: "UP",
        guesses: {
          Maya: guess("UP", 300, true),
          Leo: guess("DOWN", 200),
          Priya: guess("UP"),
        },
        coins: [1200, 400, 1600, 800],
        trust: [125, 50, 130, 105],
      },
    ],
  },
  B: {
    names: ["Alex", "Lucy", "Sam"],
    rounds: [
      {
        direction: "UP",
        role: "PARTNER",
        tip: "UP",
        guesses: { Lucy: guess("UP"), Sam: guess("UP", 100, true) },
        coins: [1100, 1100, 950],
        trust: [125, 100, 100],
      },
      {
        direction: "UP",
        role: "SHARK",
        tip: "DOWN",
        guesses: { Alex: guess("DOWN"), Sam: guess("DOWN") },
        coins: [1000, 1200, 850],
        trust: [125, 80, 100],
      },
      {
        direction: "UP",
        role: "PARTNER",
        tip: "UP",
        guesses: { Alex: guess("UP"), Lucy: guess("UP") },
        coins: [1100, 1300, 950],
        trust: [125, 80, 115],
      },
      {
        direction: "DOWN",
        role: "SHARK",
        tip: "UP",
        guesses: { Lucy: guess("UP", 200), Sam: guess("UP") },
        coins: [1200, 1100, 850],
        trust: [105, 80, 115],
      },
      {
        direction: "DOWN",
        role: "PARTNER",
        tip: "DOWN",
        guesses: { Alex: guess("DOWN", 300), Sam: guess("DOWN") },
        coins: [1500, 1200, 950],
        trust: [105, 95, 115],
      },
      {
        direction: "DOWN",
        role: "SHARK",
        tip: "UP",
        strong: true,
        guesses: { Alex: guess("DOWN", 200, true), Lucy: guess("UP", 200) },
        coins: [1800, 1000, 850],
        trust: [105, 95, 65],
      },
    ],
  },
};
