import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  BOTS,
  commandSchema,
  entrySchema,
  type Ack,
  type Command,
  type PlayerView,
  type PublicPlayer,
  type Mode,
} from "@insider/shared";

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
};
type Binding = { code: string; playerId: string };
export interface RoomOptions {
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
  close() {
    clearInterval(this.sweepTimer);
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
      if (entry.type === "solo") {
        reply(
          fail(
            "NOT_READY",
            "Solo play is coming in the game-engine checkpoint.",
          ),
        );
        return;
      }
      let room: Room | undefined;
      if (entry.type === "create") {
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
          mode: "QUICK",
          players: [],
          cache: new Map(),
        };
        this.rooms.set(code, room);
      } else room = this.rooms.get(entry.code);
      if (!room) {
        reply(fail("ROOM_NOT_FOUND", "No room matches that code."));
        return;
      }
      if (room.players.length >= 5) {
        reply(fail("ROOM_FULL", "This room already has five players."));
        return;
      }
      if (
        room.players.some(
          (p) => p.name.toLowerCase() === entry.name.toLowerCase(),
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
        name: entry.name,
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
      const ack = this.execute(room, player, c);
      room.cache.set(key, { fingerprint, ack });
      while (room.cache.size > 1280)
        room.cache.delete(room.cache.keys().next().value!);
      reply(ack);
      if (ack.ok) {
        room.revision++;
        this.broadcast(room);
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
    });
  }
  private allowAdmission(address: string) {
    const now = this.now();
    let rate = this.admission.get(address);
    if (!rate || now - rate.since >= 60000) {
      rate = { count: 0, since: now };
      this.admission.set(address, rate);
    }
    return ++rate.count <= 60;
  }
  private bind(socket: Socket, room: Room, player: Seat) {
    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = undefined;
    room.emptySince = undefined;
    this.bindings.set(socket.id, { code: room.code, playerId: player.id });
    room.revision++;
    this.broadcast(room);
  }
  private execute(room: Room, player: Seat, c: Command): Ack {
    if (c.gameId !== null)
      return fail("STALE_GAME", "This game is no longer active.");
    if (c.roundId !== 0)
      return fail("STALE_ROUND", "This round is no longer active.");
    const a = c.action;
    if (a.type === "leave") {
      if (player.socketId) this.bindings.delete(player.socketId);
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.hostId === player.id)
        room.hostId =
          room.players.find((p) => !p.bot && p.connected)?.id ??
          room.players.find((p) => !p.bot)?.id ??
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
    return fail("NOT_READY", "Gameplay arrives in the next checkpoint.");
  }
  private send(room: Room, player: Seat) {
    if (!player.socketId) return;
    const view: PlayerView = {
      protocol: 1,
      roomId: room.id,
      code: room.code,
      revision: room.revision,
      serverNow: this.now(),
      me: player.id,
      hostId: room.hostId,
      mode: room.mode,
      solo: false,
      phase: "LOBBY",
      gameId: null,
      round: 0,
      totalRounds: 0,
      phaseStartedAt: 0,
      phaseEndsAt: 0,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        connected: p.connected,
        coins: p.coins,
        trust: p.trust,
        trustHistory: [...p.trustHistory],
        record: [...p.record],
        allInUsed: p.allInUsed,
        submitted: false,
      })),
      chat: [],
      history: [],
      awards: [],
      winners: [],
      analystNote: false,
    };
    this.io.sockets.sockets.get(player.socketId)?.emit("state", view);
  }
  private broadcast(room: Room) {
    for (const p of room.players) this.send(room, p);
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
        this.rooms.delete(room.code);
        continue;
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
