import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { io } from "socket.io-client";

const reservation = createServer();
await new Promise((done) => reservation.listen(0, "127.0.0.1", done));
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/dist/index.js"], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "production",
    PUBLIC_ORIGIN: origin,
    OPENAI_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(child, "exit");
let socket;
const watchdog = setTimeout(() => {
  child.kill("SIGKILL");
}, 15000);
try {
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      reject(new Error(`Production server exited before startup (${code}).`)),
    );
    child.stdout.on("data", (data) => {
      if (data.toString().includes('"event":"listening"')) resolve();
    });
  });
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await health.json()).status, "ok");
  for (const path of ["/", "/r/ABCD"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  socket = io(origin, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Origin: origin },
  });
  const ready = once(socket, "ready");
  socket.connect();
  await ready;
  const state = once(socket, "state");
  const ack = await socket
    .timeout(3000)
    .emitWithAck("entry", {
      type: "solo",
      name: "Smoke Test",
      firstGame: false,
    });
  assert.equal(ack.ok, true);
  const [view] = await state;
  assert.equal(view.phase, "TIP");
  assert.equal(view.players.length, 3);
  const shutdown = once(socket, "shutdown");
  child.kill("SIGTERM");
  await shutdown;
  const [exitCode] = await exited;
  assert.equal(exitCode, 0);
  console.info(
    "Production smoke passed: health, room-link HTML, WebSocket solo startup, and graceful shutdown.",
  );
} finally {
  clearTimeout(watchdog);
  socket?.disconnect();
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}
