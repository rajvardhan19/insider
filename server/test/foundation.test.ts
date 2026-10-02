import { afterEach, describe, expect, it } from "vitest";
import { io as client } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
const servers: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
describe("server foundation", () => {
  it("serves health and accepts a realtime connection", async () => {
    const server = createApp();
    servers.push(server);
    await new Promise<void>((done) => server.http.listen(0, "127.0.0.1", done));
    const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
    expect(await (await fetch(`${url}/health`)).json()).toEqual({
      status: "ok",
      service: "insider",
    });
    const socket = client(url, { autoConnect: false, forceNew: true });
    try {
      const ready = new Promise<unknown>((done) => socket.once("ready", done));
      socket.connect();
      expect(await ready).toEqual({ protocol: 1 });
    } finally {
      socket.disconnect();
    }
  });
});

it("checks WebSocket origins and notifies clients before idempotent shutdown", async () => {
  const server = createApp({ origin: "https://insider.example" });
  servers.push(server);
  await new Promise<void>((done) => server.http.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const blocked = client(url, {
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Origin: "https://other.example" },
  });
  const allowed = client(url, {
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Origin: "https://insider.example" },
  });
  try {
    const denied = new Promise<Error>((done) =>
      blocked.once("connect_error", done),
    );
    blocked.connect();
    expect(await denied).toBeInstanceOf(Error);
    const ready = new Promise<void>((done) => allowed.once("ready", done));
    allowed.connect();
    await ready;
    const shutdown = new Promise<void>((done) =>
      allowed.once("shutdown", done),
    );
    const closing = server.close();
    expect(server.close()).toBe(closing);
    await shutdown;
    await closing;
    expect(server.rooms.roomCount).toBe(0);
  } finally {
    blocked.disconnect();
    allowed.disconnect();
  }
});
it("rejects invalid origins rather than silently enabling broad access", () => {
  for (const origin of [
    "*",
    "https://site.example/",
    "file:///tmp/game",
    "https://user:password@site.example",
  ])
    expect(() => createApp({ origin })).toThrow();
});
