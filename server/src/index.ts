import { createApp } from "./app.js";
import { createNarrator } from "./narration/narrator.js";
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const server = createApp({
  origin: process.env.PUBLIC_ORIGIN,
  rooms: { narrator: createNarrator() },
});
server.http.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  console.info(JSON.stringify({ event: "listening", port }));
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
