import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  BOTS,
  COMEDY,
  commandSchema,
  entrySchema,
  type Ack,
  type Command,
  type PublicPlayer,
  type Mode,
  type News,
  type Personality,
  PHRASES,
} from "@insider/shared";

import {
  advanceCommentary,
  emptyCommentary,
  type CommentaryState,
} from "../commentary/engine.js";
import { buildPlayerView, buildCommentaryFrame } from "../game/projection.js";
import {
  expire,
  freshPlayer,
  startGame,
  submitGuess,
  submitTip,
} from "../game/engine.js";
import { type GameState, GameError } from "../game/state.js";
import { samples } from "../game/rng.js";
import { decideGuess, decideTip, tellPlan } from "../bots/decisions.js";
import { RULES } from "../game/rules.js";
import { narrationFacts } from "../narration/facts.js";
import {
  templateOnly,
  validNarration,
  type NarrationProvider,
} from "../narration/narrator.js";
import { NARRATION_VISIBLE_MS } from "@insider/shared";
import newsData from "../content/news.json";
const newsPool = newsData as News[];

type Seat = Omit<PublicPlayer, "submitted"> & {
  tokenHash: string;
  socketId?: string;
  disconnectedAt?: number;
};
type Room = {
  id: string;
  code: string;
  revision: number;
  hostId: string;
  mode: Mode;
  players: Seat[];
  emptySince?: number;
  cache: Map<string, { fingerprint: string; ack: Ack }>;
  game?: GameState;
  solo: boolean;
  simulation: boolean;
  commentary: CommentaryState;
  reactions: import("@insider/shared").Reaction[];
  lastReaction: Map<string, number>;
  firstGame: boolean;
  timers: ReturnType<typeof setTimeout>[];
  scheduleKey?: string;
  lastChat: Map<string, number>;
  narrationKey?: string;
  narrationCalls: number;
  narrationControllers: Set<AbortController>;
};
type Binding = { code: string; playerId: string };
export interface RoomOptions {
  narrator?: NarrationProvider;
  now?: () => number;
  hostGraceMs?: number;
  emptyGraceMs?: number;
  maxRooms?: number;
  sweepMs?: number;
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const fail = (code: string, message: string): Ack => ({
  ok: false,
  code,
  message,
});
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export class RoomManager {
  private rooms = new Map<string, Room>();
  private bindings = new Map<string, Binding>();
  private admission = new Map<string, { count: number; since: number }>();
  private now: () => number;
  private sweepTimer: ReturnType<typeof setInterval>;
  constructor(
    private io: Server,
    private options: RoomOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.sweepTimer = setInterval(() => this.sweep(), options.sweepMs ?? 1000);
    this.sweepTimer.unref();
  }
  get roomCount() {
    return this.rooms.size;
  }
  get diagnostics() {
    return {
      rooms: this.rooms.size,
      bindings: this.bindings.size,
      scheduledTimers: [...this.rooms.values()].reduce(
        (n, room) => n + room.timers.length,
        0,
      ),
      cachedCommands: [...this.rooms.values()].reduce(
        (n, room) => n + room.cache.size,
        0,
      ),
    };
  }
  close() {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
    this.bindings.clear();
    this.admission.clear();
  }

  attach(socket: Socket) {
    let windowAt = this.now(),
      count = 0;
    const limited = () => {
      if (this.now() - windowAt >= 10000) {
        windowAt = this.now();
        count = 0;
      }
      return ++count > 60;
    };
    socket.on("entry", (input: unknown, reply: unknown) => {
      if (typeof reply !== "function") return;
      if (limited()) {
        reply(fail("RATE_LIMITED", "Too many requests. Please wait a moment."));
        return;
      }
      const parsed = entrySchema.safeParse(input);
      if (!parsed.success) {
        reply(
          fail(
            "INVALID_INPUT",
            parsed.error.issues[0]?.message ?? "Invalid entry.",
          ),
        );
        return;
      }
      const entry = parsed.data;
      if (this.bindings.has(socket.id)) {
        reply(fail("ALREADY_JOINED", "Leave your current room first."));
        return;
      }
      if (entry.type === "rejoin") {
        const room = this.rooms.get(entry.code);
        if (!room) {
          reply(
            fail(
              "ROOM_NOT_FOUND",
              "This room has expired. Create another room.",
            ),
          );
          return;
        }
        const player = room.players.find(
          (p) => !p.bot && p.tokenHash === hash(entry.token),
        );
        if (!player) {
          reply(
            fail("UNAUTHORIZED", "This saved seat could not be recovered."),
          );
          return;
        }
        if (player.socketId) {
          const old = this.io.sockets.sockets.get(player.socketId);
          this.bindings.delete(player.socketId);
          old?.emit("replaced");
          old?.disconnect(true);
        }
        this.bind(socket, room, player);
        reply({ ok: true, code: room.code });
        return;
      }
      if (!this.allowAdmission(socket.handshake.address)) {
        reply(
          fail(
            "RATE_LIMITED",
            "Too many room entries. Please try again later.",
          ),
        );
        return;
      }
      const entrantName = entry.type === "watch" ? "Observer" : entry.name;
      let room: Room | undefined;
      if (
        entry.type === "create" ||
        entry.type === "solo" ||
        entry.type === "watch"
      ) {
        if (this.rooms.size >= (this.options.maxRooms ?? 100)) {
          reply(fail("CAPACITY", "The exchange is full. Try again shortly."));
          return;
        }
        let code = "";
        do {
          code = Array.from(
            { length: 4 },
            () => alphabet[randomInt(alphabet.length)],
          ).join("");
        } while (this.rooms.has(code));
        room = {
          id: randomUUID(),
          code,
          revision: 0,
          hostId: "",
          mode: entry.type === "watch" ? entry.mode : "QUICK",
          players: [],
          cache: new Map(),
          solo: entry.type === "solo",
          simulation: entry.type === "watch",
          commentary: emptyCommentary(),
          reactions: [],
          lastReaction: new Map(),
          firstGame: entry.type === "solo" && entry.firstGame,
          timers: [],
          lastChat: new Map(),
          narrationCalls: 0,
          narrationControllers: new Set(),
        };
        this.rooms.set(code, room);
      } else room = this.rooms.get(entry.code);
      if (!room) {
        reply(fail("ROOM_NOT_FOUND", "No room matches that code."));
        return;
      }
      if (room.game) {
        reply(
          fail(
            "GAME_IN_PROGRESS",
            "This game is underway. Join the next game.",
          ),
        );
        return;
      }
      if (room.players.length >= 5) {
        reply(fail("ROOM_FULL", "This room already has five players."));
        return;
      }
      if (
        room.players.some(
          (p) => p.name.toLowerCase() === entrantName.toLowerCase(),
        )
      ) {
        reply(
          fail("NAME_TAKEN", "Someone in this room already uses that name."),
        );
        return;
      }
      const token = randomBytes(32).toString("hex");
      const player: Seat = {
        id: randomUUID(),
        name: entrantName,
        coins: 1000,
        trust: 100,
        trustHistory: [100],
        record: [],
        allInUsed: false,
        connected: true,
        tokenHash: hash(token),
      };
      room.players.push(player);
      if (!room.hostId) room.hostId = player.id;
      if (entry.type === "watch") {
        for (const bot of entry.bots)
          room.players.push({
            ...freshPlayer(randomUUID(), BOTS[bot].name, bot),
            tokenHash: "",
          });
        room.game = startGame(
          room.players.filter((p) => p.bot),
          room.mode,
          randomUUID(),
          randomInt(0x100000000),
          this.now(),
          newsPool,
          false,
          true,
        );
      }
      if (room.solo) {
        const available = (Object.keys(BOTS) as Personality[]).filter(
          (b) => BOTS[b].name.toLowerCase() !== player.name.toLowerCase(),
        );
        for (let i = 0; i < 2; i++) {
          const bot = available.splice(randomInt(available.length), 1)[0];
          room.players.push({
            ...freshPlayer(randomUUID(), BOTS[bot].name, bot),
            tokenHash: "",
          });
        }
        room.game = startGame(
          room.players,
          room.mode,
          randomUUID(),
          randomInt(0x100000000),
          this.now(),
          newsPool,
          room.firstGame,
        );
      }
      this.bind(socket, room, player);
      reply({ ok: true, code: room.code, token });
    });
    socket.on("command", (input: unknown, reply: unknown) => {
      if (typeof reply !== "function") return;
      if (limited()) {
        reply(fail("RATE_LIMITED", "Too many requests. Please wait a moment."));
        return;
      }
      const parsed = commandSchema.safeParse(input);
      if (!parsed.success) {
        reply(fail("INVALID_INPUT", "Invalid game command."));
        return;
      }
      const binding = this.bindings.get(socket.id),
        room = binding && this.rooms.get(binding.code),
        player = room?.players.find((p) => p.id === binding?.playerId);
      if (!room || !player || player.socketId !== socket.id) {
        reply(
          fail("UNAUTHORIZED", "Reconnect to your seat before continuing."),
        );
        return;
      }
      const c = parsed.data,
        key = `${player.id}:${c.commandId}`,
        fingerprint = JSON.stringify(c),
        existing = room.cache.get(key);
      if (existing) {
        reply(
          existing.fingerprint === fingerprint
            ? existing.ack
            : fail("COMMAND_CONFLICT", "This command ID was already used."),
        );
        this.send(room, player);
        return;
      }
      this.advance(room);
      let ack: Ack;
      try {
        ack = this.execute(room, player, c);
      } catch (error) {
        ack =
          error instanceof GameError
            ? fail(error.code, error.message)
            : fail("INTERNAL_ERROR", "The action could not be completed.");
        if (!(error instanceof GameError))
          console.error(
            JSON.stringify({ event: "command_error", roomId: room.id }),
          );
      }
      room.cache.set(key, { fingerprint, ack });
      while (room.cache.size > 1280)
        room.cache.delete(room.cache.keys().next().value!);
      reply(ack);
      if (ack.ok) {
        room.revision++;
        this.broadcast(room);
        this.schedule(room);
      }
    });
    socket.on("disconnect", () => {
      const binding = this.bindings.get(socket.id);
      this.bindings.delete(socket.id);
      const room = binding && this.rooms.get(binding.code),
        player = room?.players.find((p) => p.id === binding?.playerId);
      if (!room || !player || player.socketId !== socket.id) return;
      player.connected = false;
      player.socketId = undefined;
      player.disconnectedAt = this.now();
      room.revision++;
      if (!room.players.some((p) => !p.bot && p.connected))
        room.emptySince = this.now();
      this.broadcast(room);
      if (room.emptySince !== undefined) this.clearTimers(room);
    });
  }
  private allowAdmission(address: string) {
    const now = this.now();
    let rate = this.admission.get(address);
    if (!rate || now - rate.since >= 60000) {
      rate = { count: 0, since: now };
      this.admission.set(address, rate);
    }
    if (this.admission.size > 10000)
      this.admission.delete(this.admission.keys().next().value!);
    return ++rate.count <= 60;
  }
  private bind(socket: Socket, room: Room, player: Seat) {
    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = undefined;
    room.emptySince = undefined;
    this.bindings.set(socket.id, { code: room.code, playerId: player.id });
    room.revision++;
    this.advance(room);
    this.broadcast(room);
    this.schedule(room);
  }
  private execute(room: Room, player: Seat, c: Command): Ack {
    if (c.gameId !== (room.game?.id ?? null))
      return fail("STALE_GAME", "This game is no longer active.");
    if (c.roundId !== (room.game?.round ?? 0))
      return fail("STALE_ROUND", "This round is no longer active.");
    const a = c.action;
    if (
      room.simulation &&
      a.type !== "leave" &&
      a.type !== "replay" &&
      a.type !== "reaction"
    )
      return fail(
        "SPECTATOR_ONLY",
        "You are watching. Only the bots can play in this simulation.",
      );
    if (a.type === "reaction") {
      if (room.game?.phase !== "REVEAL")
        return fail("WRONG_PHASE", COMEDY.messages.reactionPhase);
      if (this.now() - (room.lastReaction.get(player.id) ?? -Infinity) < 1500)
        return fail("RATE_LIMITED", COMEDY.messages.reactionLimit);
      room.lastReaction.set(player.id, this.now());
      room.reactions = room.reactions
        .filter((r) => this.now() - r.at < 2500)
        .slice(-23);
      room.reactions.push({
        id: randomUUID(),
        playerId: player.id,
        emoji: a.emoji,
        at: this.now(),
        round: room.game.round,
      });
      return { ok: true };
    }
    if (a.type === "leave") {
      if (player.socketId) this.bindings.delete(player.socketId);
      if (room.game) {
        player.connected = false;
        player.socketId = undefined;
        player.tokenHash = "";
        player.disconnectedAt = this.now();
      } else room.players = room.players.filter((p) => p.id !== player.id);
      if (room.hostId === player.id)
        room.hostId =
          room.players.find((p) => !p.bot && p.connected)?.id ??
          room.players.find((p) => !p.bot && p.tokenHash)?.id ??
          "";
      if (!room.players.some((p) => !p.bot && p.connected))
        room.emptySince = this.now();
      return { ok: true };
    }
    if (
      ["mode", "addBot", "removeBot", "start", "replay"].includes(a.type) &&
      player.id !== room.hostId
    )
      return fail("NOT_HOST", "Only the host can do that.");
    if (a.type === "replay") {
      if (room.game?.phase !== "FINAL")
        return fail("WRONG_PHASE", "Finish this game first.");
      room.players = room.players
        .filter((p) => p.bot || p.tokenHash)
        .map((p) => ({
          ...p,
          ...freshPlayer(p.id, p.name, p.bot),
          connected: p.connected,
        }));
      room.game = undefined;
      room.firstGame = false;
      room.lastChat.clear();
      room.lastReaction.clear();
      room.reactions = [];
      room.commentary = emptyCommentary();
      this.clearTimers(room);
      if (room.solo || room.simulation)
        room.game = startGame(
          room.simulation ? room.players.filter((p) => p.bot) : room.players,
          room.mode,
          randomUUID(),
          randomInt(0x100000000),
          this.now(),
          newsPool,
          false,
          room.simulation,
        );
      return { ok: true };
    }
    if (a.type === "start") {
      if (room.game) return fail("WRONG_PHASE", "A game is already active.");
      if (room.players.length < 2)
        return fail("INVALID_ROSTER", "Add another player or a bot.");
      room.game = startGame(
        room.players,
        room.mode,
        randomUUID(),
        randomInt(0x100000000),
        this.now(),
        newsPool,
        room.firstGame,
      );
      return { ok: true };
    }
    if (a.type === "tip" || a.type === "guess") {
      if (!room.game) return fail("WRONG_PHASE", "Start a game first.");
      room.game =
        a.type === "tip"
          ? submitTip(room.game, player.id, a, this.now())
          : submitGuess(room.game, player.id, a, this.now());
      return { ok: true };
    }
    if (a.type === "chat") {
      const g = room.game;
      if (!g) return fail("WRONG_PHASE", "Chat opens when the game starts.");
      const phrase = PHRASES[a.phraseId];
      const isInsider = g.current.insiderId === player.id;
      if (
        phrase.audience !== "all" &&
        (phrase.audience === "insider") !== isInsider
      )
        return fail("UNAUTHORIZED", "Choose a phrase for your current seat.");
      if (
        this.now() - (room.lastChat.get(player.id) ?? -Infinity) <
        RULES.chatMs
      )
        return fail("RATE_LIMITED", "Wait two seconds between messages.");
      room.lastChat.set(player.id, this.now());
      this.addChat(room, player.id, phrase.text, a.phraseId);
      return { ok: true };
    }
    if (room.game)
      return fail("WRONG_PHASE", "Roster and mode are locked during a game.");
    if (a.type === "mode") {
      room.mode = a.mode;
      return { ok: true };
    }
    if (a.type === "addBot") {
      if (room.players.length >= 5)
        return fail("ROOM_FULL", "This room already has five players.");
      if (room.players.some((p) => p.bot === a.bot))
        return fail("BOT_EXISTS", "This bot already has a seat.");
      if (
        room.players.some(
          (p) => p.name.toLowerCase() === BOTS[a.bot].name.toLowerCase(),
        )
      )
        return fail("NAME_TAKEN", "A player is already using this bot’s name.");
      room.players.push({
        id: randomUUID(),
        name: BOTS[a.bot].name,
        bot: a.bot,
        connected: true,
        coins: 1000,
        trust: 100,
        trustHistory: [100],
        record: [],
        allInUsed: false,
        tokenHash: "",
      });
      return { ok: true };
    }
    if (a.type === "removeBot") {
      if (!room.players.some((p) => p.id === a.playerId && p.bot))
        return fail("INVALID_INPUT", "That seat is not a bot.");
      room.players = room.players.filter((p) => p.id !== a.playerId);
      return { ok: true };
    }
    return fail("INVALID_INPUT", "Unsupported action.");
  }
  private send(room: Room, player: Seat) {
    if (!player.socketId) return;
    if (room.game)
      for (const p of room.game.players)
        p.connected =
          room.players.find((seat) => seat.id === p.id)?.connected ?? false;
    const view = buildPlayerView(room, player.id, this.now());
    this.io.sockets.sockets.get(player.socketId)?.emit("state", view);
  }
  private broadcast(room: Room) {
    if (room.emptySince === undefined) {
      const frame = buildCommentaryFrame(room, this.now());
      if (frame)
        room.commentary = advanceCommentary(room.commentary, frame, this.now());
    }
    for (const p of room.players) this.send(room, p);
  }
  private addChat(
    room: Room,
    playerId: string,
    text: string,
    phraseId?: string,
  ) {
    const g = room.game;
    if (!g) return;
    g.chat.push({
      id: randomUUID(),
      playerId,
      text,
      phraseId,
      at: this.now(),
      round: g.round,
    });
    g.chat = g.chat.slice(-60);
  }
  private phaseKey(room: Room) {
    return room.game
      ? `${room.game.id}:${room.game.round}:${room.game.phase}`
      : "lobby";
  }
  private clearTimers(room: Room) {
    for (const controller of room.narrationControllers) controller.abort();
    room.narrationControllers.clear();
    room.timers.forEach(clearTimeout);
    room.timers = [];
    room.scheduleKey = undefined;
  }
  private advance(room: Room) {
    const g = room.game;
    if (!g || g.phase === "FINAL" || this.now() < g.phaseEndsAt) return;
    room.game = expire(g, this.now(), newsPool);
    room.revision++;
    this.broadcast(room);
    this.schedule(room);
  }
  private schedule(room: Room) {
    if (!room.game || room.emptySince !== undefined) {
      this.clearTimers(room);
      return;
    }
    const key = this.phaseKey(room);
    if (room.scheduleKey === key) return;
    this.clearTimers(room);
    room.scheduleKey = key;
    const g = room.game;
    if (g.phase === "FINAL") return;
    const later = (delay: number, run: () => void) => {
      const timer = setTimeout(
        () => {
          room.timers = room.timers.filter((pending) => pending !== timer);
          if (
            this.rooms.get(room.code) !== room ||
            this.phaseKey(room) !== key ||
            room.emptySince !== undefined
          )
            return;
          this.advance(room);
          if (this.phaseKey(room) !== key) return;
          try {
            run();
            room.revision++;
            this.broadcast(room);
            this.schedule(room);
          } catch (error) {
            if (!(error instanceof GameError))
              console.error(
                JSON.stringify({
                  event: "scheduled_action_error",
                  roomId: room.id,
                }),
              );
          }
        },
        Math.max(1, delay),
      );
      timer.unref();
      room.timers.push(timer);
    };
    later(g.phaseEndsAt - this.now(), () => this.advance(room));
    if (g.phase === "TIP") {
      const insider = g.players.find((p) => p.id === g.current.insiderId)!;
      if (insider.bot) {
        const [r, next] = samples(g.botRng, 6);
        g.botRng = next;
        const plan = tellPlan(insider.bot, g.current.role, g.firstGame, r);
        later(Math.min(plan.delay, g.phaseEndsAt - this.now() - 1), () => {
          const current = room.game!;
          const [values, next] = samples(current.botRng, 6);
          current.botRng = next;
          const tip = decideTip(
            insider.bot!,
            {
              direction: current.current.direction,
              role: current.current.role,
              sentiment: current.current.news.sentiment,
            },
            values,
          );
          room.game = submitTip(current, insider.id, tip, this.now());
          this.addChat(
            room,
            insider.id,
            plan.line.replace("{tip}", tip.direction === "UP" ? "BUY" : "SELL"),
          );
        });
      }
    }
    if (g.phase === "GUESS")
      for (const bot of g.players.filter(
        (p) =>
          p.bot && p.id !== g.current.insiderId && !g.current.guesses[p.id],
      )) {
        const [r, next] = samples(g.botRng, 1);
        g.botRng = next;
        later(
          g.phaseStartedAt +
            (g.phaseEndsAt - g.phaseStartedAt) * (0.4 + r[0] * 0.35) -
            this.now(),
          () => {
            const current = room.game!;
            const [values, next] = samples(current.botRng, 6);
            current.botRng = next;
            const decision = decideGuess(
              bot.bot!,
              {
                tip: current.current.tip!,
                sentiment: current.current.news.sentiment,
                trust: current.players.find(
                  (p) => p.id === current.current.insiderId,
                )!.trust,
                round: current.round,
                allInUsed: bot.allInUsed,
                chat: current.chat.filter(
                  (c) =>
                    c.round === current.round &&
                    c.playerId === current.current.insiderId,
                ),
              },
              values,
            );
            room.game = submitGuess(
              current,
              bot.id,
              decision.guess,
              this.now(),
            );
            if (decision.reply) this.addChat(room, bot.id, decision.reply);
          },
        );
      }
    if (g.phase === "REVEAL") {
      this.narrate(room);
      const result = g.history.at(-1)!;
      later(500, () => {
        for (const out of result.outcomes)
          if (
            out.guess &&
            !out.correct &&
            result.role === "SHARK" &&
            g.players.find((p) => p.id === out.playerId)?.bot
          )
            this.addChat(room, out.playerId, "You LIED to me??");
      });
    }
  }
  private narrate(room: Room) {
    const g = room.game!;
    const key = `${g.id}:${g.round}`;
    if (room.narrationKey === key) return;
    room.narrationKey = key;
    const provider = this.options.narrator ?? templateOnly;
    const kinds =
      g.round === g.totalRounds
        ? (["round", "closing"] as const)
        : (["round"] as const);
    for (const kind of kinds) {
      // A persistent room cannot bypass its budget by replaying repeatedly.
      if (room.narrationCalls >= 100) break;
      room.narrationCalls++;
      const controller = new AbortController();
      room.narrationControllers.add(controller);
      const deadline =
        kind === "round"
          ? g.phaseStartedAt + NARRATION_VISIBLE_MS - 400
          : g.phaseEndsAt;
      if (this.now() >= deadline) {
        room.narrationControllers.delete(controller);
        continue;
      }
      void Promise.resolve()
        .then(() =>
          provider.generate(narrationFacts(g, kind), controller.signal),
        )
        .then((text) => {
          const current = room.game;
          if (
            controller.signal.aborted ||
            this.rooms.get(room.code) !== room ||
            room.emptySince !== undefined ||
            !current ||
            current.id !== g.id ||
            current.round !== g.round ||
            current.phase !== "REVEAL" ||
            this.now() >= deadline ||
            !validNarration(text, kind)
          )
            return;
          if (kind === "round") current.history.at(-1)!.narration = text;
          else current.closingReport = text;
          room.revision++;
          this.broadcast(room);
        })
        .catch(() => {
          /* Templates remain authoritative on any provider failure. */
        })
        .finally(() => room.narrationControllers.delete(controller));
    }
  }
  sweep() {
    const now = this.now();
    for (const [ip, rate] of this.admission)
      if (now - rate.since >= 60000) this.admission.delete(ip);
    for (const room of this.rooms.values()) {
      if (
        room.emptySince !== undefined &&
        now - room.emptySince >= (this.options.emptyGraceMs ?? 120000)
      ) {
        for (const p of room.players)
          if (p.socketId) this.bindings.delete(p.socketId);
        this.clearTimers(room);
        this.rooms.delete(room.code);
        continue;
      }
      if (room.emptySince === undefined) {
        this.advance(room);
        if (
          room.commentary.queue.length &&
          now - room.commentary.lastAt >= 2500
        ) {
          room.revision++;
          this.broadcast(room);
        }
      }
      const host = room.players.find((p) => p.id === room.hostId);
      if (
        host &&
        !host.connected &&
        host.disconnectedAt !== undefined &&
        now - host.disconnectedAt >= (this.options.hostGraceMs ?? 10000)
      ) {
        const next = room.players.find((p) => !p.bot && p.connected);
        if (next) {
          room.hostId = next.id;
          room.revision++;
          this.broadcast(room);
        }
      }
    }
  }
}
