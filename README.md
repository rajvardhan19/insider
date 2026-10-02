# Insider

A multiplayer game of tips, trust, and betrayal. Development follows [the full implementation plan](IMPLEMENTATION_PLAN.md), in small verified commits. All original features remain in scope.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The server runs on port 3001; Vite proxies socket requests.

```sh
npm run check
npm run build
npm start
```

Production start serves the built client and backend together at http://localhost:3001. Build requires development dependencies. Set `HOST=0.0.0.0` for a hosting container and configure `PUBLIC_ORIGIN` to the public HTTPS origin. See `.env.example`; supply variables through the shell or hosting environment.

## Delivery status

The initial foundation includes workspace tooling, a server health endpoint, a live Socket.IO connection, and a responsive home screen. Game controls remain disabled until the room and game commits. A working foundation is not the finished game.

Public deployment needs a chosen hosting destination. No site has been published yet.

## Architecture

- Pure deterministic game rules, with explicit random state.
- Per-player snapshots; private state stays server-side.
- Server-owned deadlines.
- Ordered commands and retry-safe mutations per room.
- One server instance with in-memory rooms initially. A restart ends matches; ordinary reconnects preserve seats once room support is implemented.
