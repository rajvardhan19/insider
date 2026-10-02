# Insider

A multiplayer game of tips, trust, and betrayal. Development follows [the full implementation plan](IMPLEMENTATION_PLAN.md), in small verified commits. All original features remain in scope.

Verified implementation commits are pushed to [`rajvardhan19/insider`](https://github.com/rajvardhan19/insider) on `main`, as authorized by the project owner.

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

The backend includes rooms, authenticated reconnection, the original game engine, all eight bot policies, 150 news records, authoritative phase timers, quick-chat, solo startup, and private player snapshots. Both design-document games have exact replay tests. The interactive client includes solo onboarding, room controls, private tips, all stakes and Shark calls, staged reveals, scoring receipts, trust charts, awards, replay, themes, and sound. Optional live AI narration is integrated with bounded requests and template fallbacks; credentialed API and release verification remain outstanding. This is an intermediate build, not the finished game.

Public deployment needs a chosen hosting destination. No site has been published yet.

## Architecture

- Pure deterministic game rules, with explicit random state.
- Per-player snapshots; private state stays server-side.
- Server-owned deadlines.
- Ordered commands and retry-safe mutations per room.
- One server instance with in-memory rooms initially. A restart ends matches; ordinary reconnects preserve seats and accepted choices.

See [narration configuration and verification](docs/narration.md) for optional API setup and limits.

See [local debugging and replay commands](docs/debugging.md) for forced scenarios and multi-room verification.

See [deployment](docs/deployment.md), [the full release checklist](docs/release-checklist.md), and [actual playtest evidence](docs/playtest-log.md). Run `npm run check` before committing; it includes production artifact and server smoke checks.

## Ways to play

- **Play solo vs bots:** enter your own name, then face two randomly selected personalities.
- **Create a room / Join a room:** enter a name and play with friends or add bots. Matches still have 2–5 seats.
- **Watch bots play:** select 2–5 distinct bots and Quick or Full mode. Watch automatic decisions, public tips, chat, reveals, scores and awards without taking a seat. Refresh resumes your spectator session. Stop watching returns home; after the final, replay keeps the selected lineup.

The roster now includes Patient Penny (cautious), Opposite Ollie (headline contrarian), and Risky Rex (aggressive) alongside the original five. Observer sessions never receive unrevealed secrets and cannot submit gameplay actions.
