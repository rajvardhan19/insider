import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { Ack, Action, PlayerView } from "@insider/shared";
import { createApp } from "../src/app.js";
let app: ReturnType<typeof createApp>, url: string, now: number;
const clients: Socket[] = [];
const views = new Map<Socket, PlayerView>();
async function connect() {
  const s = io(url, {
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
  });
  clients.push(s);
  s.on("state", (v: PlayerView) => views.set(s, v));
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
    s.connect();
  });
  return s;
}
const enter = (s: Socket, input: unknown) =>
  s.timeout(2000).emitWithAck("entry", input) as Promise<Ack>;
const command = (s: Socket, action: Action, id = randomUUID()) =>
  s
    .timeout(2000)
    .emitWithAck("command", {
      commandId: id,
      gameId: null,
      roundId: 0,
      action,
    }) as Promise<Ack>;
async function until(predicate: () => boolean) {
  for (let i = 0; i < 60 && !predicate(); i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(predicate()).toBe(true);
}
async function room() {
  const host = await connect(),
    ack = await enter(host, { type: "create", name: "Maya" });
  if (!ack.ok) throw new Error(ack.message);
  return { host, code: ack.code!, token: ack.token! };
}
beforeEach(async () => {
  now = 1000;
  app = createApp({
    rooms: {
      now: () => now,
      hostGraceMs: 100,
      emptyGraceMs: 500,
      sweepMs: 60000,
    },
  });
  await new Promise<void>((resolve, reject) => {
    app.http.once("error", reject);
    app.http.listen(0, "127.0.0.1", resolve);
  });
  url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  views.clear();
  await app.close();
});

describe("rooms and authenticated seats", () => {
  it("creates, joins, projects distinct identities and hides credentials", async () => {
    const { host, code, token } = await room(),
      guest = await connect();
    expect(
      await enter(guest, { type: "join", name: "Leo", code }),
    ).toMatchObject({ ok: true });
    await until(() => views.get(host)?.players.length === 2);
    expect(views.get(host)!.me).not.toBe(views.get(guest)!.me);
    const snapshot = JSON.stringify(views.get(host));
    expect(snapshot).not.toContain(token);
    expect(snapshot).not.toContain("tokenHash");
    expect(snapshot).not.toContain("socketId");
  });
  it("rejects a sixth seat and duplicate names", async () => {
    const { host, code } = await room(),
      guest = await connect();
    expect(
      await enter(guest, { type: "join", name: "maya", code }),
    ).toMatchObject({ ok: false, code: "NAME_TAKEN" });
    for (const bot of ["lucy", "sam", "nina", "walt"] as const)
      expect(await command(host, { type: "addBot", bot })).toMatchObject({
        ok: true,
      });
    expect(
      await enter(guest, { type: "join", name: "Leo", code }),
    ).toMatchObject({ ok: false, code: "ROOM_FULL" });
  });
  it("requires host authority and protects human seats from removal", async () => {
    const { host, code } = await room(),
      guest = await connect();
    await enter(guest, { type: "join", name: "Leo", code });
    expect(await command(guest, { type: "mode", mode: "FULL" })).toMatchObject({
      ok: false,
      code: "NOT_HOST",
    });
    expect(
      await command(host, {
        type: "removeBot",
        playerId: views.get(guest)!.me,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await command(host, { type: "mode", mode: "FULL" })).toMatchObject({
      ok: true,
    });
    await until(() => views.get(guest)?.mode === "FULL");
  });
  it("retries the same mutation once and rejects conflicting command IDs", async () => {
    const { host } = await room(),
      id = randomUUID();
    const first = await command(host, { type: "addBot", bot: "lucy" }, id);
    expect(await command(host, { type: "addBot", bot: "lucy" }, id)).toEqual(
      first,
    );
    expect(views.get(host)!.players).toHaveLength(2);
    expect(
      await command(host, { type: "addBot", bot: "sam" }, id),
    ).toMatchObject({ ok: false, code: "COMMAND_CONFLICT" });
  });
  it("restores the same seat and replaces the old socket", async () => {
    const { host, code, token } = await room(),
      seat = views.get(host)!.me,
      replacement = await connect();
    expect(
      await enter(replacement, { type: "rejoin", code, token }),
    ).toMatchObject({ ok: true });
    await until(() => !host.connected);
    expect(views.get(replacement)!.me).toBe(seat);
    expect(
      views.get(replacement)!.players.find((p) => p.id === seat)?.connected,
    ).toBe(true);
    const intruder = await connect();
    expect(
      await enter(intruder, { type: "rejoin", code, token: "a".repeat(64) }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });
  it("transfers host after grace and cleans rooms even when bots remain", async () => {
    const { host, code } = await room(),
      guest = await connect();
    await enter(guest, { type: "join", name: "Leo", code });
    await command(host, { type: "addBot", bot: "lucy" });
    const oldHost = views.get(host)!.me;
    host.disconnect();
    await until(
      () =>
        views.get(guest)?.players.find((p) => p.id === oldHost)?.connected ===
        false,
    );
    now += 101;
    app.rooms.sweep();
    await until(() => views.get(guest)?.hostId === views.get(guest)?.me);
    guest.disconnect();
    await new Promise((r) => setTimeout(r, 10));
    now += 501;
    app.rooms.sweep();
    expect(app.rooms.roomCount).toBe(0);
  });
  it("leaves explicitly and prevents stale socket commands", async () => {
    const { host } = await room();
    expect(await command(host, { type: "leave" })).toMatchObject({ ok: true });
    expect(await command(host, { type: "mode", mode: "FULL" })).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
  it("rejects invalid input and does not expose a remote debug handler", async () => {
    const s = await connect();
    expect(
      await enter(s, { type: "join", name: "Leo", code: "ZZZZ" }),
    ).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
    expect(await enter(s, { type: "create", name: "<script>" })).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(await command(s, { type: "start" })).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    const handlers = [...app.io.sockets.sockets.values()][0].eventNames();
    expect(handlers).not.toContain("debug:force");
  });
});
