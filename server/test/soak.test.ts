import { expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Ack, Action, PlayerView } from "@insider/shared";
import { createApp } from "../src/app.js";

it("runs three five-seat rooms through four matches with reconnect churn, retries, and API failures", async () => {
  let now = 1000,
    maxSnapshotBytes = 0;
  const heapBefore = process.memoryUsage().heapUsed;
  const app = createApp({
    rooms: {
      now: () => now,
      sweepMs: 600000,
      emptyGraceMs: 100,
      narrator: {
        async generate() {
          throw new Error("simulated API outage");
        },
      },
    },
  });
  const sockets: Socket[] = [];
  const views = new Map<Socket, PlayerView>();
  await new Promise<void>((done) => app.http.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
  async function connect() {
    const s = io(url, {
      autoConnect: false,
      forceNew: true,
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(s);
    s.on("state", (v: PlayerView) => {
      views.set(s, v);
      maxSnapshotBytes = Math.max(
        maxSnapshotBytes,
        Buffer.byteLength(JSON.stringify(v)),
      );
    });
    await new Promise<void>((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", reject);
      s.connect();
    });
    return s;
  }
  async function until(predicate: () => boolean) {
    for (let i = 0; i < 100 && !predicate(); i++)
      await new Promise((done) => setTimeout(done, 2));
    expect(predicate()).toBe(true);
  }
  async function entry(s: Socket, input: object) {
    const ack = (await s.timeout(2000).emitWithAck("entry", input)) as Ack;
    if (!ack.ok) throw new Error(ack.message);
    return ack;
  }
  async function act(s: Socket, action: Action, commandId = randomUUID()) {
    const v = views.get(s)!;
    const envelope = { commandId, gameId: v.gameId, roundId: v.round, action };
    const ack = (await s.timeout(2000).emitWithAck("command", envelope)) as Ack;
    expect(ack).toMatchObject({ ok: true });
    return { ack, envelope };
  }
  const rooms: {
    code: string;
    seats: { socket: Socket; token: string; id: string }[];
  }[] = [];
  try {
    for (let r = 0; r < 3; r++) {
      const host = await connect();
      const created = await entry(host, { type: "create", name: `R${r} P0` });
      const seats = [
        { socket: host, token: created.token!, id: views.get(host)!.me },
      ];
      for (let p = 1; p < 5; p++) {
        const socket = await connect();
        const joined = await entry(socket, {
          type: "join",
          code: created.code,
          name: `R${r} P${p}`,
        });
        seats.push({ socket, token: joined.token!, id: views.get(socket)!.me });
      }
      rooms.push({ code: created.code!, seats });
    }
    for (let match = 0; match < 4; match++) {
      for (const room of rooms) {
        if (match) {
          await act(room.seats[0].socket, { type: "replay" });
          await until(() => views.get(room.seats[0].socket)?.phase === "LOBBY");
        }
        await act(room.seats[0].socket, { type: "start" });
      }
      for (let round = 1; round <= 5; round++) {
        await until(() =>
          rooms.every((r) => views.get(r.seats[0].socket)?.phase === "TIP"),
        );
        for (const [index, room] of rooms.entries()) {
          const current = views.get(room.seats[0].socket)!;
          expect(
            current.players.every((p) => p.name.startsWith(`R${index} `)),
          ).toBe(true);
          expect(current.round).toBe(round);
          expect(current.history.length).toBe(round - 1);
          const insider = room.seats.find((s) => s.id === current.insiderId)!;
          await act(insider.socket, {
            type: "tip",
            direction: "UP",
            strong: round % 2 === 0,
          });
          await until(() =>
            room.seats.every((s) => views.get(s.socket)?.phase === "GUESS"),
          );
          const reconnecting = room.seats[(round % 4) + 1];
          reconnecting.socket.disconnect();
          reconnecting.socket = await connect();
          await entry(reconnecting.socket, {
            type: "rejoin",
            code: room.code,
            token: reconnecting.token,
          });
          expect(views.get(reconnecting.socket)!.me).toBe(reconnecting.id);
          for (const seat of room.seats.filter((s) => s.id !== insider.id)) {
            const { ack, envelope } = await act(seat.socket, {
              type: "guess",
              direction: round % 2 ? "UP" : "DOWN",
              stake: round === 1 ? 300 : 100,
              callShark: round % 2 === 0,
            });
            expect(
              await seat.socket.timeout(2000).emitWithAck("command", envelope),
            ).toEqual(ack);
          }
          await until(
            () => views.get(room.seats[0].socket)?.phase === "REVEAL",
          );
          const revealed = views.get(room.seats[0].socket)!;
          expect(revealed.history.length).toBe(round);
          for (const player of revealed.players) {
            const delta = revealed.history
              .flatMap((r) => r.outcomes)
              .filter((o) => o.playerId === player.id)
              .reduce((sum, o) => sum + o.delta, 0);
            expect(player.coins).toBe(1000 + delta);
            expect(player.trustHistory.length).toBe(round + 1);
          }
        }
        now = Math.max(
          ...rooms.map((r) => views.get(r.seats[0].socket)!.phaseEndsAt),
        );
        app.rooms.sweep();
      }
      await until(() =>
        rooms.every((r) => views.get(r.seats[0].socket)?.phase === "FINAL"),
      );
      expect(app.rooms.diagnostics.scheduledTimers).toBe(0);
    }
    expect(maxSnapshotBytes).toBeLessThan(65536);
    expect(app.rooms.diagnostics.bindings).toBe(15);
    for (const room of rooms)
      for (const seat of room.seats) seat.socket.disconnect();
    await until(() => app.rooms.diagnostics.bindings === 0);
    now += 101;
    app.rooms.sweep();
    expect(app.rooms.diagnostics).toEqual({
      rooms: 0,
      bindings: 0,
      scheduledTimers: 0,
      cachedCommands: 0,
    });
    console.info(
      JSON.stringify({
        event: "local_soak_result",
        rooms: 3,
        seats: 15,
        matches: 12,
        rounds: 60,
        reconnects: 60,
        maxSnapshotBytes,
        heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      }),
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  }
});
