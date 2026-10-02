import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Server } from "socket.io";
import { RoomManager, type RoomOptions } from "./rooms/manager.js";

export function createApp(
  options: { origin?: string; clientDir?: string; rooms?: RoomOptions } = {},
) {
  const allowedOrigins = options.origin
    ? [options.origin]
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      throw new Error(
        "PUBLIC_ORIGIN must be an HTTP(S) origin without a path or trailing slash.",
      );
  }
  let closing: Promise<void> | undefined;
  const app = express();
  app.disable("x-powered-by");
  const http = createServer(app);
  const io = new Server(http, {
    maxHttpBufferSize: 16_384,
    allowRequest: (req, done) =>
      done(
        null,
        !closing &&
          (!req.headers.origin || allowedOrigins.includes(req.headers.origin)),
      ),
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  });
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "insider" }),
  );
  const rooms = new RoomManager(io, options.rooms);
  io.on("connection", (socket) => {
    rooms.attach(socket);
    socket.emit("ready", { protocol: 1 });
    socket.on("clock", (reply: unknown) => {
      if (typeof reply === "function") reply({ serverNow: Date.now() });
    });
  });
  const clientDir =
    options.clientDir ??
    resolve(
      process.cwd(),
      process.cwd().endsWith("/server") ? "../client/dist" : "client/dist",
    );
  if (existsSync(resolve(clientDir, "index.html"))) {
    app.use(express.static(clientDir));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(clientDir, "index.html")),
    );
  }
  return {
    app,
    http,
    io,
    rooms,
    close: () => {
      if (closing) return closing;
      io.emit("shutdown");
      rooms.close();
      closing = new Promise<void>((done) => io.close(() => done()));
      return closing;
    },
  };
}
