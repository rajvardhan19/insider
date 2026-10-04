import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";
import type { Ack, Action, PlayerView } from "@insider/shared";
import { entrySchema } from "@insider/shared";
import { RoomManager } from "../src/rooms/manager.js";

class LocalSocket extends EventEmitter {
  handshake = { address: "local-test" };
  views: PlayerView[] = [];
  constructor(public id: string) {
    super();
    this.on("state", (view: PlayerView) => this.views.push(view));
  }
  disconnect() {
    this.emit("disconnect");
  }
  get view() {
    return this.views.at(-1)!;
  }
  entry(value: unknown) {
    let result!: Ack;
    this.emit("entry", value, (ack: Ack) => {
      result = ack;
    });
    return result;
  }
  act(action: Action) {
    let result!: Ack;
    this.emit(
      "command",
      {
        commandId: crypto.randomUUID(),
        gameId: this.view.gameId,
        roundId: this.view.round,
        action,
      },
      (ack: Ack) => {
        result = ack;
      },
    );
    return result;
  }
}
afterEach(() => vi.useRealTimers());
it("validates distinct 2–5 bot simulations", () => {
  expect(
    entrySchema.safeParse({
      type: "watch",
      bots: ["penny", "rex"],
      mode: "QUICK",
    }).success,
  ).toBe(true);
  for (const bots of [
    ["rex"],
    ["rex", "rex"],
    ["unknown", "rex"],
    ["penny", "ollie", "rex", "sam", "sal", "lucy"],
  ])
    expect(
      entrySchema.safeParse({ type: "watch", bots, mode: "QUICK" }).success,
    ).toBe(false);
});
it("runs a real bot-only match, protects secrets from the observer, reconnects and replays", async () => {
  vi.useFakeTimers();
  const sockets = new Map<string, LocalSocket>();
  const manager = new RoomManager({
    sockets: { sockets },
  } as unknown as Server);
  const connect = (id: string) => {
    const socket = new LocalSocket(id);
    sockets.set(id, socket);
    manager.attach(socket as unknown as Socket);
    return socket;
  };
  try {
    const viewer = connect("watcher");
    const ack = viewer.entry({
      type: "watch",
      bots: ["penny", "ollie", "rex", "sam", "lucy"],
      mode: "QUICK",
    });
    if (!ack.ok) throw new Error(ack.message);
    expect(viewer.view.spectating).toBe(true);
    expect(viewer.view.players).toHaveLength(5);
    expect(viewer.view.players.every((p) => p.bot)).toBe(true);
    expect(viewer.view.players.some((p) => p.id === viewer.view.me)).toBe(
      false,
    );
    expect(
      viewer.act({ type: "tip", direction: "UP", strong: true }),
    ).toMatchObject({ ok: false, code: "SPECTATOR_ONLY" });
    expect(
      viewer.act({
        type: "guess",
        direction: "UP",
        stake: 300,
        callShark: true,
      }),
    ).toMatchObject({ ok: false, code: "SPECTATOR_ONLY" });
    expect(viewer.act({ type: "chat", phraseId: "trust" })).toMatchObject({
      ok: false,
      code: "SPECTATOR_ONLY",
    });
    await vi.advanceTimersByTimeAsync(5000);
    viewer.disconnect();
    const replacement = connect("replacement");
    expect(
      replacement.entry({ type: "rejoin", code: ack.code, token: ack.token }),
    ).toMatchObject({ ok: true });
    expect(replacement.view.me).toBe(viewer.view.me);
    await vi.advanceTimersByTimeAsync(5 * (60000 + 120000 + 8000));
    expect(replacement.view.phase).toBe("FINAL");
    expect(replacement.view.history).toHaveLength(5);
    expect(
      replacement.view.history.every(
        (r) => r.outcomes.filter((o) => o.guess).length === 4,
      ),
    ).toBe(true);
    for (const v of [...viewer.views, ...replacement.views]) {
      expect(v.secrets).toBeUndefined();
      expect(v.ownGuess).toBeUndefined();
    }
    expect(manager.diagnostics.scheduledTimers).toBe(0);
    const oldGame = replacement.view.gameId;
    expect(replacement.act({ type: "replay" })).toMatchObject({ ok: true });
    expect(replacement.view.phase).toBe("TIP");
    expect(replacement.view.gameId).not.toBe(oldGame);
    expect(
      replacement.view.players.every(
        (p) => p.coins === 1000 && p.trust === 100,
      ),
    ).toBe(true);
    expect(replacement.act({ type: "leave" })).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(121000);
    expect(manager.diagnostics).toEqual({
      rooms: 0,
      bindings: 0,
      scheduledTimers: 0,
      cachedCommands: 0,
    });
  } finally {
    manager.close();
  }
});
