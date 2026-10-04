// Creates and removes two test seats on the explicitly supplied deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
const origin = new URL(process.argv[2]).origin;
assert.equal(new URL(origin).protocol, "https:");
const sockets = [],
  views = new Map();
const until = async (predicate) => {
  const end = Date.now() + 10000;
  while (!predicate() && Date.now() < end)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(predicate(), "Timed out waiting for public game state");
};
async function connect() {
  const s = io(origin, {
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
    reconnection: false,
    timeout: 15000,
    extraHeaders: { Origin: origin },
  });
  sockets.push(s);
  s.on("state", (v) => views.set(s, v));
  await new Promise((resolve, reject) => {
    s.once("ready", resolve);
    s.once("connect_error", reject);
    s.connect();
  });
  return s;
}
async function enter(s, input) {
  const ack = await s.timeout(10000).emitWithAck("entry", input);
  assert.equal(ack.ok, true, ack.message);
  return ack;
}
async function act(s, action) {
  const v = views.get(s);
  const ack = await s.timeout(10000).emitWithAck("command", {
    commandId: randomUUID(),
    gameId: v.gameId,
    roundId: v.round,
    action,
  });
  assert.equal(ack.ok, true, ack.message);
}
const watchdog = setTimeout(() => {
  console.error("Public smoke timed out");
  process.exit(1);
}, 90000);
try {
  const health = await fetch(`${origin}/health`, {
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "insider");
  const host = await connect(),
    guest = await connect();
  const seat = await enter(host, { type: "create", name: "Test Host" });
  const guestSeat = await enter(guest, {
    type: "join",
    code: seat.code,
    name: "Test Guest",
  });
  await until(
    () =>
      views.get(host)?.players.length === 2 &&
      views.get(guest)?.players.length === 2,
  );
  const page = await fetch(`${origin}/r/${seat.code}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root"><\/div>/);
  await act(host, { type: "start" });
  await until(() => views.get(guest)?.phase === "TIP");
  assert.equal(
    views.get(guest).phaseEndsAt - views.get(guest).phaseStartedAt,
    60000,
  );
  const insider =
    views.get(host).insiderId === views.get(host).me ? host : guest;
  const guesser = insider === host ? guest : host;
  assert.equal(views.get(guesser).secrets, undefined);
  await act(insider, {
    type: "tip",
    direction: views.get(insider).secrets.direction,
    strong: false,
  });
  await until(() => views.get(guesser)?.phase === "GUESS");
  assert.equal(
    views.get(guesser).phaseEndsAt - views.get(guesser).phaseStartedAt,
    120000,
  );
  await act(guesser, {
    type: "guess",
    direction: "UP",
    stake: 100,
    callShark: false,
  });
  await until(
    () =>
      views.get(host)?.phase === "REVEAL" &&
      views.get(guest)?.phase === "REVEAL",
  );
  await act(host, { type: "reaction", emoji: "tomato" });
  await until(() =>
    views.get(guest)?.reactions?.some((r) => r.emoji === "tomato"),
  );
  const guestId = views.get(guest).me;
  guest.disconnect();
  const restored = await connect();
  await enter(restored, {
    type: "rejoin",
    code: seat.code,
    token: guestSeat.token,
  });
  await until(
    () =>
      views.get(restored)?.me === guestId &&
      views.get(restored)?.history.length === 1,
  );
  await act(restored, { type: "leave" });
  await act(host, { type: "leave" });
  console.info(
    "Public smoke passed: HTTPS health, direct room link, two-player WebSockets, private roles, tip, guess, reveal, synced reaction, and authenticated reconnect. Test seats removed.",
  );
} finally {
  clearTimeout(watchdog);
  for (const s of sockets) s.disconnect();
}
