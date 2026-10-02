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
