# Implementation checkpoints

Each commit must be independently buildable. Relevant checks run before committing; later features do not enter a commit until their own verification passes. All features in the implementation plan remain required.

## 01 — Workspace and application foundation

- npm workspaces for shared contracts, server, and client.
- TypeScript, ESLint, Prettier, Vitest, and repeatable production builds.
- Express health endpoint, Socket.IO connection, time-sync endpoint, and static client serving.
- Responsive home shell with deliberately disabled game controls.
- Runtime signal handling and initial setup documentation.

Verified:

- `npm run check`: typecheck, lint, one HTTP/socket integration test, and all workspace builds pass.
- npm dependency installation reports zero known vulnerabilities after upgrading the test runner.
- Browser inspection: home page renders and reports an active exchange connection.

Limitations at this checkpoint: rooms and gameplay are not implemented; no public deployment exists. The next commit adds the validated public protocol and original rule configuration.

## 02 — Public protocol and original rule constants

- Public view, result, player, chat, and award contracts are separate from server state.
- Strict runtime schemas reject malformed actions, unexpected identity fields, unsupported stakes, unknown phrases, and invalid room/name inputs.
- All five bot identities and all 18 preset chat phrases are defined.
- Original-v1 scoring constants, timers, and Quick/Full turn counts are preserved.

Verified: `npm run check` passes, including 10 tests. No gameplay rule changes were introduced.

## 03 — Rooms, authenticated seats, and lobby commands

- Room creation/joining, five-seat limits, distinct names, host-only settings and bot management.
- Cryptographic resume tokens; only hashes are retained server-side and no credentials enter snapshots.
- Same-seat reconnection replaces the old socket; old disconnects cannot invalidate the replacement.
- Ordered synchronous lobby mutations, duplicate-command acknowledgements, conflict detection, revisions, request limits, host-transfer grace, and idle cleanup.
- Production server bundles the shared protocol rather than trying to execute workspace TypeScript at runtime.

Verified: `npm run check` passes with 18 tests, including eight socket integration cases for rooms and identity. Game start and solo remain explicitly unavailable until the engine is connected.

## 04 — Deterministic original-v1 engine and private projections

- Pure seeded round draws, turn rotation, tip/guess validation, scoring, trust, awards, and final results.
- Original timeout behavior, debt, Strong tips, Shark calls, and once-per-game All In.
- Separate market, bot, and cosmetic RNG state; template narration from resolved facts.
- Allowlisted player projection exposes only authorized secrets and delays public All In consumption until reveal.
- Exact Appendix A and B fixtures verify every round's coins/trust and final awards; privacy tests compare views across secret-only changes.

Verified: `npm run check` passes with 29 tests. The engine is not yet connected to live room actions; that is the next isolated checkpoint.

## 05 — Five bot policies and full content inventory

- All five personalities, bounded chat reactions, tell/non-tell lines, false tells, first-game tell boost, and Walt's timing tell.
- Partner honesty takes precedence over personality/random branches; guessing policies accept only public observations.
- 150 unique headline records across 30 fictional companies, balanced sentiment, and 40 narration leads.

Verified: `npm run check` passes with 37 tests. Content meets structural coverage; human playtesting and editorial refinement remain on the release checklist.

## 06 — Live game runtime, solo startup, and authoritative scheduling

- Room commands now start and play the original engine; only the server advances phases and resolves scores.
- Delayed actions check room identity, game, round, and phase before running. Cleanup cancels timers; deadlines are reconciled before accepting an action.
- Solo starts with two distinct bots. Bot guesses use public observations and current Insider chat, with delayed tips and reactions.
- All snapshots use the allowlisted projection. Rejoining restores the viewer's locked choice while other players' choices and current All In consumption remain hidden.
- Mid-game joining and roster/settings changes are rejected; replay resets balances, trust, and consumables and rejects old-game commands.
- Game input normalization copies only defined tip/guess fields into engine state.

Verified: `npm run check` passes with 41 tests, including exact document replays, privacy checks, live deadlines, scoring retries, active-game reconnection, replay, and chat eligibility/cooldown. Interactive client screens, live AI narration, polish, and release verification remain required.

Repository delivery: verified commits are pushed to `origin/main` at `https://github.com/rajvardhan19/insider.git` under the user's standing authorization.

## 07 — Interactive game client

- Complete Home, tutorial, Create/Join, host lobby controls, bot selection, and direct room links.
- Private hold-to-peek, Show Table decoy, tips/Strong, all stakes, Shark calls, locked choices, and quick-chat.
- Server-timed countdowns and staged reveals, score receipts, trust charts, track records, awards, bot lessons, and replay.
- Light/dark themes, saved mute preference, sound effects, reduced motion, focus-managed dialogs, and mobile controls.
- Token-based recovery, monotonic snapshot acceptance, and same-ID command retries.

Verified: `npm run check` passes with 43 tests. Browser checks completed a solo match and replay, restored a locked 200-coin choice after refresh, exercised a two-human lobby with bots and host-only controls, and checked 375×667 layouts. A fresh-build solo start shows a 20-second countdown. These are local browser checks; real-device and human playtests remain outstanding.

## 08 — Optional live narration with guarded publication

- OpenAI Responses adapter with validated configuration, bounded facts/output, no response storage, timeout/cancellation, and global/room request limits.
- Immediate template reports remain available for every failure path; narration never blocks game transitions.
- Round text publishes before the narration stage and freezes on screen. Closing Bell is prepared during the final reveal.
- Room/game/round/phase checks reject stale completions after deadline, disconnect, cleanup, or replay.

Verified: `npm run check` passes with 58 tests, including fake-provider success/failures, bounds, timeout, budgets, publication races, and final/replay handling. No paid API calls were made; credentialed provider verification remains a release requirement.

## 09 — Local replay harness and runtime hardening

- Local-only interactive engine commands and executable Appendix A/B scenarios, sharing fixtures with the exact replay tests.
- WebSocket origin checks in addition to CORS, validated production origin configuration, basic HTTP headers, and shutdown notification with idempotent cleanup.
- Completed timers are removed from runtime bookkeeping; diagnostics expose aggregate counts to local tests only.
- Accelerated multi-room soak verifies 15 seats, 12 matches, 60 rounds/reconnects, duplicate commands, API failures, isolation, arithmetic, bounded snapshots, and complete room cleanup.

Verified: `npm run check` passes with 61 tests. Both `npm run debug:game -- --demo A` and `--demo B` match all coin/trust checkpoints. This accelerated soak does not replace real-device, human, or long-duration testing.
