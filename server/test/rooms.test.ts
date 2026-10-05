import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { Ack, Action, PlayerView } from "@insider/shared";
import { createApp } from "../src/app.js";
let app: ReturnType<typeof createApp>, url: string, now: number;
const narrator = {
  generate:
    vi.fn<
      import("../src/narration/narrator.js").NarrationProvider["generate"]
    >(),
};
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
  s.timeout(2000).emitWithAck("command", {
    commandId: id,
    gameId: views.get(s)?.gameId ?? null,
    roundId: views.get(s)?.round ?? 0,
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
  narrator.generate.mockReset().mockResolvedValue(null);
  app = createApp({
    rooms: {
      narrator,
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
  it("runs live tip/guess/reveal rounds, rejects late actions, and retries scoring only once", async () => {
    const { host, code } = await room(),
      guest = await connect();
    await enter(guest, { type: "join", name: "Leo", code });
    expect(await command(host, { type: "start" })).toMatchObject({ ok: true });
    await until(() => views.get(guest)?.phase === "TIP");
    expect(views.get(host)!.secrets).toBeDefined();
    expect(views.get(guest)!.secrets).toBeUndefined();
    const direction = views.get(host)!.secrets!.direction;
    await command(host, { type: "tip", direction, strong: false });
    await until(() => views.get(guest)?.phase === "GUESS");
    const id = randomUUID();
    const payload = {
      commandId: id,
      gameId: views.get(guest)!.gameId,
      roundId: 1,
      action: { type: "guess", direction, stake: 300, callShark: false },
    };
    const first = await guest.timeout(2000).emitWithAck("command", payload);
    await until(() => views.get(host)?.phase === "REVEAL");
    const balances = views.get(host)!.players.map((p) => p.coins);
    expect(await guest.timeout(2000).emitWithAck("command", payload)).toEqual(
      first,
    );
    expect(views.get(host)!.players.map((p) => p.coins)).toEqual(balances);
    now = views.get(host)!.phaseEndsAt;
    app.rooms.sweep();
    await until(() => views.get(guest)?.phase === "TIP");
    const deadline = views.get(guest)!.phaseEndsAt;
    now = deadline;
    expect(
      await command(guest, { type: "tip", direction: "UP", strong: true }),
    ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
    await until(() => views.get(host)?.phase === "GUESS");
    expect(views.get(host)!.tip?.strong).toBe(false);
  });
  it("restores a locked private choice during a live game and blocks mid-game join/settings", async () => {
    const { host, code } = await room(),
      guest = await connect();
    const joined = await enter(guest, { type: "join", name: "Leo", code });
    if (!joined.ok) throw new Error("join");
    await command(host, { type: "addBot", bot: "lucy" });
    await command(host, { type: "start" });
    await until(() => views.get(guest)?.phase === "TIP");
    await command(host, { type: "tip", direction: "UP", strong: false });
    await until(() => views.get(guest)?.phase === "GUESS");
    await command(guest, {
      type: "guess",
      direction: "DOWN",
      stake: 300,
      callShark: true,
    });
    await until(() => Boolean(views.get(guest)?.ownGuess));
    const other = await connect();
    expect(
      await enter(other, { type: "join", name: "Dev", code }),
    ).toMatchObject({ ok: false, code: "GAME_IN_PROGRESS" });
    expect(await command(host, { type: "mode", mode: "FULL" })).toMatchObject({
      ok: false,
      code: "WRONG_PHASE",
    });
    const reconnect = await connect();
    await enter(reconnect, { type: "rejoin", code, token: joined.token });
    expect(views.get(reconnect)!.ownGuess).toEqual({
      direction: "DOWN",
      stake: 300,
      callShark: true,
    });
    expect(views.get(host)!.ownGuess).toBeUndefined();
    expect(
      views.get(host)!.players.find((p) => p.name === "Leo")!.allInUsed,
    ).toBe(false);
  });
  it("finishes through authoritative deadlines and rejects old-game actions after replay", async () => {
    const { host, code } = await room(),
      guest = await connect();
    await enter(guest, { type: "join", name: "Leo", code });
    await command(host, { type: "start" });
    await until(() => views.get(host)?.phase === "TIP");
    const old = views.get(host)!.gameId;
    for (let i = 0; i < 18; i++) {
      const v = views.get(host)!;
      now = v.phaseEndsAt;
      app.rooms.sweep();
      await until(() => views.get(host)!.revision > v.revision);
    }
    expect(views.get(host)!.phase).toBe("FINAL");
    expect(views.get(host)!.history).toHaveLength(6);
    await command(host, { type: "replay" });
    await until(() => views.get(host)?.phase === "LOBBY");
    const stale = await host.timeout(2000).emitWithAck("command", {
      commandId: randomUUID(),
      gameId: old,
      roundId: 6,
      action: { type: "tip", direction: "UP", strong: true },
    });
    expect(stale).toMatchObject({ ok: false, code: "STALE_GAME" });
    expect(
      views.get(host)!.players.every((p) => p.coins === 1000 && !p.allInUsed),
    ).toBe(true);
  });
  it("starts solo with two distinct bots and enforces quick-chat eligibility and cooldown", async () => {
    const solo = await connect();
    expect(
      await enter(solo, { type: "solo", name: "Alex", firstGame: true }),
    ).toMatchObject({ ok: true });
    const v = views.get(solo)!;
    expect(v.solo).toBe(true);
    expect(v.phase).toBe("TIP");
    expect(new Set(v.players.filter((p) => p.bot).map((p) => p.bot)).size).toBe(
      2,
    );
    expect(
      await command(solo, { type: "chat", phraseId: "doubt" }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(
      await command(solo, { type: "chat", phraseId: "trust" }),
    ).toMatchObject({ ok: true });
    expect(
      await command(solo, { type: "chat", phraseId: "never" }),
    ).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
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
  it("accepts twenty seats and rejects the twenty-first and duplicate names", async () => {
    const { host, code } = await room(),
      guest = await connect();
    expect(
      await enter(guest, { type: "join", name: "maya", code }),
    ).toMatchObject({ ok: false, code: "NAME_TAKEN" });
    for (let i = 1; i < 20; i++) {
      const seat = await connect();
      expect(
        await enter(seat, { type: "join", name: `Trader ${i}`, code }),
      ).toMatchObject({ ok: true });
    }
    await until(() => views.get(host)?.players.length === 20);
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

describe("narration completion guards", () => {
  async function reveal() {
    const { host, code } = await room();
    const guest = await connect();
    await enter(guest, { type: "join", name: "Leo", code });
    await command(host, { type: "start" });
    await until(() => views.get(guest)?.phase === "TIP");
    await command(host, { type: "tip", direction: "UP", strong: false });
    await until(() => views.get(guest)?.phase === "GUESS");
    await command(guest, {
      type: "guess",
      direction: "UP",
      stake: 100,
      callShark: false,
    });
    await until(() => views.get(host)?.phase === "REVEAL");
    return { host, guest };
  }
  it("publishes a timely report without changing scores or phase", async () => {
    let complete!: (text: string) => void;
    narrator.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { host } = await reveal();
    const before = views.get(host)!;
    complete("The market has receipts.");
    await until(
      () => views.get(host)?.result?.narration === "The market has receipts.",
    );
    expect(views.get(host)!.players).toEqual(before.players);
    expect(views.get(host)!.phaseEndsAt).toBe(before.phaseEndsAt);
    expect(narrator.generate).toHaveBeenCalledTimes(1);
  });
  it.each(["visible", "next round", "cleanup"])(
    "ignores completion after %s",
    async (reason) => {
      let complete!: (text: string) => void;
      narrator.generate.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const { host, guest } = await reveal();
      const before = views.get(host)!;
      if (reason === "visible") now = before.phaseStartedAt + 2400;
      if (reason === "next round") {
        now = before.phaseEndsAt;
        app.rooms.sweep();
        await until(() => views.get(host)?.phase === "TIP");
      }
      if (reason === "cleanup") {
        await command(host, { type: "leave" });
        await command(guest, { type: "leave" });
        now += 501;
        app.rooms.sweep();
        expect(app.rooms.roomCount).toBe(0);
      }
      complete("This must never be shown.");
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(JSON.stringify(views.get(host))).not.toContain(
        "This must never be shown.",
      );
      if (reason === "visible")
        expect(views.get(host)!.result!.narration).toBe(
          before.result!.narration,
        );
      else expect(narrator.generate.mock.calls[0][1].aborted).toBe(true);
    },
  );
});

it("prepares Closing Bell before FINAL and ignores an old-game completion after replay", async () => {
  const pending: {
    request: import("../src/narration/narrator.js").NarrationRequest;
    finish: (text: string | null) => void;
  }[] = [];
  narrator.generate.mockImplementation(
    (request) =>
      new Promise((finish) => {
        pending.push({ request, finish });
      }),
  );
  const { host, code } = await room(),
    guest = await connect();
  await enter(guest, { type: "join", name: "Leo", code });
  await command(host, { type: "start" });
  await until(() => views.get(host)?.phase === "TIP");
  const oldGame = views.get(host)!.gameId;
  for (let round = 1; round <= 6; round++) {
    now = views.get(host)!.phaseEndsAt;
    app.rooms.sweep();
    await until(() => views.get(host)?.phase === "GUESS");
    now = views.get(host)!.phaseEndsAt;
    app.rooms.sweep();
    await until(() => views.get(host)?.phase === "REVEAL");
    if (round === 6) {
      await until(() => pending.some((p) => p.request.kind === "closing"));
      pending
        .find((p) => p.request.kind === "closing")!
        .finish("The closing report is ready.");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    now = views.get(host)!.phaseEndsAt;
    app.rooms.sweep();
    await until(
      () => views.get(host)?.phase === (round === 6 ? "FINAL" : "TIP"),
    );
  }
  expect(views.get(host)!.closingReport).toBe("The closing report is ready.");
  await command(host, { type: "replay" });
  await until(() => views.get(host)?.phase === "LOBBY");
  await command(host, { type: "start" });
  await until(() => views.get(host)?.phase === "TIP");
  pending
    .filter((p) => p.request.kind === "round")
    .forEach((p) => p.finish("Stale old-game report."));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(views.get(host)!.gameId).not.toBe(oldGame);
  expect(views.get(host)!.history).toEqual([]);
  expect(views.get(host)!.closingReport).toBeUndefined();
});

it("syncs reveal reactions to both players, rate-limits them, and never changes scores", async () => {
  const { host, code } = await room(),
    guest = await connect();
  await enter(guest, { type: "join", code, name: "Leo" });
  await command(host, { type: "start" });
  await until(() => views.get(guest)?.phase === "TIP");
  expect(
    await command(host, { type: "reaction", emoji: "tomato" }),
  ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
  await command(host, { type: "tip", direction: "UP", strong: true });
  await until(() => views.get(guest)?.phase === "GUESS");
  expect(
    await command(guest, { type: "chat", phraseId: "suit" }),
  ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  expect(await command(host, { type: "chat", phraseId: "sec" })).toMatchObject({
    ok: false,
    code: "UNAUTHORIZED",
  });
  await command(guest, {
    type: "guess",
    direction: "UP",
    stake: 300,
    callShark: true,
  });
  await until(() => views.get(host)?.phase === "REVEAL");
  const before = views.get(host)!;
  const id = randomUUID();
  expect(
    await command(host, { type: "reaction", emoji: "tomato" }, id),
  ).toMatchObject({ ok: true });
  expect(
    await command(host, { type: "reaction", emoji: "tomato" }, id),
  ).toMatchObject({ ok: true });
  await until(() => views.get(guest)?.reactions?.length === 1);
  expect(views.get(host)!.reactions).toEqual(views.get(guest)!.reactions);
  expect(
    await command(host, { type: "reaction", emoji: "shark" }),
  ).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  expect(
    await command(guest, { type: "reaction", emoji: "laugh" }),
  ).toMatchObject({ ok: true });
  await until(() => views.get(host)?.reactions?.length === 2);
  expect(views.get(host)!.players).toEqual(before.players);
  expect(views.get(host)!.phaseEndsAt).toBe(before.phaseEndsAt);
  now += 1500;
  expect(
    await command(host, { type: "reaction", emoji: "shark" }),
  ).toMatchObject({ ok: true });
  now = before.phaseEndsAt;
  app.rooms.sweep();
  await until(() => views.get(host)?.phase === "TIP");
  expect(views.get(host)!.reactions).toEqual([]);
});

it("shares custom turns, protects host settings, and keeps twenty players in a synchronized round", async () => {
  const { host, code } = await room();
  const guests: Socket[] = [];
  for (let i = 1; i < 20; i++) {
    const s = await connect();
    guests.push(s);
    await enter(s, { type: "join", name: `Player ${i}`, code });
  }
  expect(
    await command(guests[0], { type: "rounds", insiderTurns: 8 }),
  ).toMatchObject({ ok: false, code: "NOT_HOST" });
  expect(
    await command(host, { type: "rounds", insiderTurns: 8 }),
  ).toMatchObject({ ok: true });
  await until(() => views.get(guests[18])?.insiderTurns === 8);
  await command(host, { type: "start" });
  await until(() => views.get(guests[18])?.phase === "TIP");
  expect(views.get(host)?.totalRounds).toBe(160);
  expect(
    await command(host, { type: "rounds", insiderTurns: 1 }),
  ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
  await command(host, { type: "tip", direction: "UP", strong: false });
  await until(() => views.get(guests[18])?.phase === "GUESS");
  for (const g of guests)
    await command(g, {
      type: "guess",
      direction: "UP",
      stake: 100,
      callShark: false,
    });
  await until(() => guests.every((g) => views.get(g)?.phase === "REVEAL"));
  const result = views.get(host)!.result;
  expect(result?.outcomes).toHaveLength(20);
  for (const g of guests) expect(views.get(g)!.result).toEqual(result);
});
it("preserves custom turns through reconnect and replay, and presets clear the override", async () => {
  const { host, code, token } = await room();
  const guest = await connect();
  await enter(guest, { type: "join", name: "Bex", code });
  await command(host, { type: "rounds", insiderTurns: 1 });
  const replacement = await connect();
  await enter(replacement, { type: "rejoin", code, token });
  expect(views.get(replacement)?.insiderTurns).toBe(1);
  await command(replacement, { type: "start" });
  for (let i = 0; i < 6; i++) {
    const v = views.get(replacement)!;
    now = v.phaseEndsAt;
    app.rooms.sweep();
    await until(() => views.get(replacement)!.phase !== v.phase);
  }
  expect(views.get(replacement)?.phase).toBe("FINAL");
  await command(replacement, { type: "replay" });
  expect(views.get(replacement)?.insiderTurns).toBe(1);
  await command(replacement, { type: "mode", mode: "FULL" });
  expect(views.get(replacement)?.insiderTurns).toBeUndefined();
});
