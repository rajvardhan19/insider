/** LOCAL_ENGINE_HARNESS_ONLY: never import this module from the server entry point. */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import assert from "node:assert/strict";
import type { News, Direction, Stake } from "@insider/shared";
import {
  freshPlayer,
  startGame,
  submitTip,
  submitGuess,
  expire,
} from "../game/engine.js";
import { buildPlayerView } from "../game/projection.js";
import { demos } from "./scenarios.js";
import news from "../content/news.json";

if (process.env.NODE_ENV === "production")
  throw new Error("The harness is local development only.");
const pool = news as News[];
const demoArg = process.argv.indexOf("--demo");
const demo =
  demoArg >= 0 ? process.argv[demoArg + 1]?.toUpperCase() : undefined;
if (demo !== undefined && demo !== "A" && demo !== "B")
  throw new Error("Use --demo A or --demo B.");
const names = demo ? demos[demo].names : ["Maya", "Leo", "Priya", "Dev"];
let game = startGame(
  names.map((name) => freshPlayer(name, name)),
  "QUICK",
  "local-debug",
  12345,
  0,
  pool,
);
function show() {
  console.table(
    game.players.map(({ name, coins, trust, allInUsed }) => ({
      name,
      coins,
      trust,
      allInUsed,
    })),
  );
  console.info(
    `${game.phase} | round ${game.round}/${game.totalRounds} | Insider ${game.current.insiderId}`,
  );
}
if (demo) {
  for (const script of demos[demo].rounds) {
    game.current.direction = script.direction;
    game.current.role = script.role;
    game.current.accurate = script.direction === game.current.news.sentiment;
    game = submitTip(
      game,
      game.current.insiderId,
      { direction: script.tip, strong: script.strong ?? false },
      game.phaseStartedAt + 1,
    );
    for (const [id, guess] of Object.entries(script.guesses))
      game = submitGuess(game, id, guess, game.phaseStartedAt + 1);
    if (game.phase === "GUESS") game = expire(game, game.phaseEndsAt, pool);
    assert.deepEqual(
      game.players.map((p) => p.coins),
      script.coins,
    );
    assert.deepEqual(
      game.players.map((p) => p.trust),
      script.trust,
    );
    show();
    game = expire(game, game.phaseEndsAt, pool);
  }
  assert.equal(game.phase, "FINAL");
  console.info(
    `Appendix ${demo}: every coin and trust checkpoint matched.\n${game.closingReport}`,
  );
} else {
  const terminal = createInterface({ input: stdin, output: stdout });
  console.info(
    "Local-only engine harness. No server, sockets, API calls, or real timers.\nCommands: peek | force UP|DOWN PARTNER|SHARK | tip UP|DOWN [strong] | guess NAME UP|DOWN 100|200|300 [shark] | expire | view NAME | reset | quit",
  );
  show();
  try {
    for (;;) {
      const [command, a, b, c, d] = (await terminal.question("insider> "))
        .trim()
        .split(/\s+/);
      if (command === "quit") break;
      try {
        if (command === "peek") console.info(game.current);
        else if (command === "force") {
          assert.equal(game.phase, "TIP");
          assert.ok(a === "UP" || a === "DOWN");
          assert.ok(b === "PARTNER" || b === "SHARK");
          game.current.direction = a;
          game.current.role = b;
          game.current.accurate = a === game.current.news.sentiment;
        } else if (command === "tip")
          game = submitTip(
            game,
            game.current.insiderId,
            { direction: a as Direction, strong: b === "strong" },
            game.phaseStartedAt + 1,
          );
        else if (command === "guess")
          game = submitGuess(
            game,
            a,
            {
              direction: b as Direction,
              stake: Number(c) as Stake,
              callShark: d === "shark",
            },
            game.phaseStartedAt + 1,
          );
        else if (command === "expire")
          game = expire(game, game.phaseEndsAt, pool);
        else if (command === "reset")
          game = startGame(
            names.map((name) => freshPlayer(name, name)),
            "QUICK",
            "local-debug",
            12345,
            0,
            pool,
          );
        else if (command === "view") {
          assert.ok(names.includes(a));
          console.info(
            JSON.stringify(
              buildPlayerView(
                {
                  id: "local",
                  code: "TEST",
                  revision: 0,
                  hostId: names[0],
                  mode: "QUICK",
                  solo: false,
                  players: game.players,
                  game,
                },
                a,
                game.phaseStartedAt,
              ),
              null,
              2,
            ),
          );
        } else console.info("Unknown command.");
        show();
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : "Invalid action.",
        );
      }
    }
  } finally {
    terminal.close();
  }
}
