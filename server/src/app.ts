import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Server } from "socket.io";
import { RoomManager, type RoomOptions } from "./rooms/manager.js";

export function createApp(
  options: { origin?: string; clientDir?: string; rooms?: RoomOptions } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const http = createServer(app);
  const io = new Server(http, {
    maxHttpBufferSize: 16_384,
    cors: {
      origin: options.origin ?? "http://localhost:5173",
      methods: ["GET", "POST"],
    },
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
      rooms.close();
      return new Promise<void>((done) => io.close(() => done()));
    },
  };
}
