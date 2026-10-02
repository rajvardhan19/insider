# Insider — Detailed Implementation Plan

Status: full-scope implementation in progress. See `docs/COMMIT_LOG.md` for delivered checkpoints and `docs/release-checklist.md` for remaining acceptance work. All features in the original design and repository plan are required; milestones describe implementation order, not a reduced release.

Prepared October 1, 2026. Target submission: October 28–29, ahead of the official-rules deadline of October 30, 2026, 11:59 p.m. Pacific. The competition landing page states October 31; use the earlier official deadline.

## 1. Product objective and scope

Build a fast browser party game of tips, trust, and betrayal. One player knows whether a fictional stock will rise or fall. Their hidden motive determines whether they benefit from accurate guesses or mistakes. Everyone else decides whether to believe them.

The finished entry must provide:

- A public URL, room-code joining, and direct room links without accounts or installs.
- Two to five total players per room, including bots, with at least one human.
- One-tap solo play against two bots.
- Synchronized rounds, private information, reliable scoring, and reconnection.
- A short explanation, readable mobile screens, satisfying reveals, and immediate replay.
- A usable experience when optional AI narration is unavailable.

Use the original design document and repository plan as the full baseline specification. No feature may be removed, made conditional on available time, or deferred beyond the planned release without the user's explicit approval. The gameplay changes discussed below are proposals only; implement the original rules unless the user approves a change. Its example games remain fixtures for those rules.

### Required release feature inventory

- Multiplayer rooms, direct room links, no accounts, two to five seats, host controls, reconnecting, host transfer, cleanup, and all documented edge cases.
- Quick and Full modes, equal Insider turns, complete original scoring, debt without elimination, Partner/Shark roles, headlines, tips, Strong tips, all three stakes, once-per-game All In, and Shark calls.
- Trust Ticker charts, visible trust values, track records, all four awards and tiebreakers, standings, and replay.
- All five bots: Loyal Lucy, Skeptic Sam, Newsy Nina, Wildcard Walt, and Sneaky Sal; their personalities, randomness, tells, timing, chat reactions, replies, and first-game discovery.
- One-tap solo mode, preset quick-chat, emojis, speech bubbles, and chat history.
- At least 150 reviewed news entries; at least 10 lines per bot per role, with tell and non-tell coverage; at least 40 narration fallback templates.
- Live AI Breaking News and Closing Bell narration, with tested timeouts and template fallbacks. API availability is optional at runtime; implementing the integration is required.
- Every specified screen, hold-to-peek, Show the Table decoy, tutorial, contextual hints, Analyst Note, scoreboard drawer, reveal animations, and final charts/reports.
- Light and dark themes, sound effects, mute preference, reduced-motion support, and mobile/accessibility checks.
- Local test mode, both complete demo replays, automated verification, real-device playtesting, production hardening, documentation, deployment, and submission materials.

An intermediate playable build is a development checkpoint, not the release deliverable. Completion requires the entire inventory above.

Competition references:

- Brief: https://joinhandshake.com/learn/create-a-multiplayer-game-8d7d59b5/
- Official rules: https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0

The published brief specifies ChatGPT Work. Preserve the requested requirements → plan → build → test workflow and check the signed-in mission's submission instructions before delivery.

## 2. Architecture decisions

### 2.1 Pure engine, explicit inputs

All game rules live in plain TypeScript functions. The engine must not read the clock, environment variables, sockets, filesystem, or external APIs, and must not schedule timers or mutate its input.

Conceptual interface:

```ts
type TransitionResult = {
  nextState: GameState;
  effects: Effect[];
  result: CommandResult;
};

function transition(
  state: GameState,
  command: EngineCommand,
  context: { nowMs: number; rules: Ruleset },
): TransitionResult;
```

Random-generator states are explicit fields in server-only game state. Drawing randomness returns a value and the next generator state. Replaying the same initial state, ruleset, commands, and supplied timestamps must reproduce the same game.

Separate random streams for:

- Market draws and roles.
- Bot decisions and tells.
- Cosmetic line selection.

Do not use gameplay RNG for room codes or authentication tokens. Those require cryptographically secure randomness and must never be derivable from replay seeds.

### 2.2 Per-player snapshots

After every accepted state change, construct a fresh `PlayerView` for each connected seat. This projection is the sole path by which game state reaches clients.

- Include the current state needed to render the screen without applying patches.
- Include the player's own accepted action so a reconnect restores their selection.
- Use explicit allowlists; never spread private game objects into a view.
- Do not send seeds, future draws, session credentials, unrevealed opponent choices, or bot internal decisions.
- Historical revealed information is public; current unrevealed information is protected.
- Cap chat and other growing collections.

Full snapshots are appropriate for these small rooms. Measure their size before considering deltas.

### 2.3 Server-owned time

Each timed phase has `phaseStartedAt` and `phaseEndsAt`. The server decides whether a command is late and when a phase advances. The client only renders time remaining.

- A delayed timer callback cannot extend the action deadline.
- Before processing an action, reconcile any expired phase using the server clock.
- An action processed at or after its deadline is late; document this boundary.
- Production uses a server clock; tests supply a fake clock.
- Estimate client clock offset with request/response timing, including round-trip time. Resample on reconnect and periodically while playing.
- At zero, show that the client is waiting for the server. Do not reveal, score, or advance locally.

### 2.4 Ordered commands per room

All room mutations pass through a per-room runtime: human commands, bot actions, disconnects, host transfer, timeouts, replay, and narration completions.

The runtime processes one transition at a time. State transitions remain synchronous. External work starts after a transition and returns later as another command.

Every delayed effect carries identifiers for the game, round, and expected phase or phase generation. Ignore stale callbacks even if cancellation failed. Resolving a round twice must be impossible.

### 2.5 Identity and retry safety

Authenticate the socket to a seat using an opaque resume token. Derive player identity from that binding, never from a submitted player ID.

Mutating game commands include:

```ts
type CommandEnvelope<T> = {
  commandId: string;
  gameId: string;
  roundId: number;
  payload: T;
};
```

Lobby commands use a separate envelope without fictitious game or round IDs. Scope duplicate tracking to the authenticated session and command ID. A repeated ID with the same payload returns the original result; an ID reused with different content returns an error. A different ID cannot overwrite a locked action.

Bound the duplicate-result cache, retaining active-game actions long enough for reconnect retries. Return a current snapshot alongside rejoin or when recovery is needed.

### 2.6 Explicit deployment boundary

Start with one always-running Node server instance holding rooms in memory and serving the built client. Do not deploy multiple independent instances behind a load balancer: they would not share authoritative room state.

For the initial release, a server restart ends active matches. Show a clear expired-room message and offer to create another room. Ordinary connection loss must preserve a seat while its room exists.

Durable recovery is a separate extension, not an implied property of snapshots. If required before release, persist private state, RNG states, rules versions, deadlines, resume-token hashes, and duplicate-command results atomically; define how elapsed phases recover after downtime. Do not add this extension without testing it end to end.

## 3. Repository layout

Use npm workspaces with TypeScript, a React/Vite client, an Express/Socket.IO server, and Vitest. Select supported package versions and verify their documentation when implementing; this plan does not prescribe version-specific APIs.

```text
insider/
  package.json
  package-lock.json
  tsconfig.base.json
  .env.example
  .gitignore
  README.md
  IMPLEMENTATION_PLAN.md
  docs/
    rules-decisions.md
    protocol.md
    playtest-log.md
    release-checklist.md
  shared/
    package.json
    src/
      protocol.ts          # Commands, acknowledgements, public views
      schemas.ts           # Runtime validation, limits, enums
      publicConfig.ts      # Public UI constants only
      phrases.ts           # Allowed phrase IDs and displayed text
  server/
    package.json
    src/
      index.ts
      config.ts            # Validated environment and operating limits
      rooms/
        manager.ts         # Room creation, lookup, cleanup
        runtime.ts         # Ordered commands, state, effects
        sessions.ts        # Tokens, socket binding, seat recovery
        handlers.ts        # Socket boundary and acknowledgements
        scheduler.ts       # Timers and delayed effects
      game/
        state.ts           # Private state and phase variants
        commands.ts
        engine.ts
        rng.ts
        rulesets.ts
        turns.ts
        news.ts
        scoring.ts
        trust.ts
        awards.ts
        projection.ts
      bots/
        observations.ts
        decisions.ts
        personalities.ts
        tells.ts
        lines.json
      chat/quickChat.ts
      narration/
        narrator.ts
        templates.ts
      content/news.json
      util/names.ts
      debug/localHarness.ts
    test/
      fixtures/
      engine/
      projection/
      integration/
  client/
    package.json
    src/
      main.tsx
      App.tsx
      net/socket.ts
      net/session.ts
      net/clock.ts
      state/store.ts
      screens/
      components/
      styles/
    test/
  e2e/
```

Full `GameState`, bot probabilities, and engine rules remain server-side. The shared package exports the public contract. The server sends public rule explanations and stake options needed by the UI, avoiding separately maintained client scoring formulas.

Build shared declarations/artifacts before their consumers, according to the chosen workspace configuration. Run type checking, tests, and production build in CI.

## 4. State, phases, and protocol

### 4.1 State model

Keep room/session state distinct from game state.

Room state: room ID/code, roster, host, connections, bounded chat, monotonic revision, cleanup metadata, active game.

Game state: unique game ID, rules version, mode, stable turn order, round index, player coins/trust/consumables, revealed records, RNG states, and a discriminated phase state.

Use phase-specific types:

- `LOBBY`: roster and host-selected settings.
- `TIP`: public headline; private direction/role; Insider identity; deadline.
- `GUESS`: committed public tip; private per-player submissions; deadline.
- `REVEAL`: immutable scored result, reveal timestamp, narration, deadline.
- `FINAL`: final standings, qualifying awards, public records, replay controls.

Only valid phase transitions are allowed. Keep a unique round ID within each game and an immutable resolved result so scores are applied once.

### 4.2 Phase transitions

1. Host starts a game with a valid roster.
2. Server freezes the roster and draws the first round.
3. Insider submits one tip, or a timeout supplies a random non-Strong tip.
4. Commit the tip and open GUESS immediately. Document that the Tip timer is a maximum, not a mandatory delay.
5. Each eligible guesser submits once. Resolve when all submissions arrive or time expires.
6. Apply scores, trust, consumables, and history atomically.
7. Start REVEAL with a template narration available immediately.
8. At the reveal deadline, start the next round or FINAL.
9. Host can return the group to the lobby for another game. Solo replay can start immediately with the same bots.

Disconnected humans keep their seat and remain eligible until the deadline; they follow the chosen timeout policy. Never change the roster mid-game. New arrivals get a game-in-progress response; spectators are outside initial scope.

### 4.3 Public snapshot envelope

Every snapshot includes protocol version, room ID, room revision, game ID if active, `serverNow`, and the phase-specific view. Increment the room revision on authoritative changes; ignore older snapshots on the client. Clear prior-room state on navigation or a new room binding.

Public player entries contain name, avatar, connection state, coins, visible trust, revealed track record, and previously revealed All In usage. During GUESS, expose submitted status but not other players' selections. Current-round All In consumption becomes public only at reveal.

Private view fields contain only the viewer's own submission and, when they are the Insider, the current secrets during TIP/GUESS.

### 4.4 Commands and errors

Implement create, join, rejoin, settings, start, tip, guess, chat, add/remove bot, replay, leave, and time-sync operations. Validate payloads before dispatching them to the runtime; independently enforce game legality in the engine.

Use stable error codes such as `INVALID_INPUT`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `UNAUTHORIZED`, `NOT_HOST`, `WRONG_PHASE`, `STALE_GAME`, `STALE_ROUND`, `ALREADY_SUBMITTED`, `DEADLINE_PASSED`, and `RATE_LIMITED`.

Never return internal exceptions or private state in errors. Acknowledgements report accepted/rejected status; snapshots remain authoritative for rendering.

## 5. Rules baseline and decisions before feature expansion

### 5.1 Preserve the original rules as a versioned fixture

Implement `original-v1` for the two document replays:

- Start with 1,000 coins; debt is allowed; no elimination.
- News direction follows headline sentiment with probability 0.6.
- Partner/Shark is independently drawn with probability 0.5 each round.
- Stakes: 100, 200, or 300; the 300 option is usable once per player per game.
- Correct/wrong direction: plus/minus stake.
- Correct Shark call: +100 to caller, −100 to Insider.
- Wrong Shark call: −150 to caller, paid to the bank.
- Normal Insider: +50 for each role-success; no failure penalty.
- Strong Insider: +100 per role-success, −100 per failure.
- Trust: truth +15, lie −20; Strong doubles that component; caught Shark −10 once per round; falsely accused Partner +10 once per round; floor 10.
- Original timeout: guesser sits out with zero delta and is excluded from Insider success/failure counts.
- Winner: coins, then correct Shark calls, then shared.
- Awards follow the original document; omit awards with no qualifying player.

Only after explicit user approval, store gameplay changes in a new version and create new fixtures. Do not silently rewrite the original fixtures or ship several selectable scoring systems just to preserve them.

### 5.2 Partner incentives — unresolved, must playtest

The original payout can reward sabotage in relative standings. With two players and a 100 stake, a correct guess gives the Partner +50 and the rival +100. A wrong guess gives the Partner zero and the rival −100.

Candidate for testing: Partner earns twice each correct guesser's stake, while Shark scoring initially stays unchanged. This makes helping that guesser preferable in their pairwise score gap, but may excessively favor Partner draws or larger rooms. It is an experiment, not an approved final rule.

Compare original and candidate rules using two-, three-, and five-player scripted scenarios plus human games. Examine relative standings, leader sabotage, role luck, and the effects of stake size. Present the findings and any proposed payout changes to the user; retain the original scoring unless a change is approved. Equal turns do not eliminate luck from unequal role draws.

### 5.3 Round length — proposed revision

Implement the original Quick turns: one each for four to five players, two each for three players, and three each for two players; Full mode doubles them. Proposed experiment, requiring user approval before changing the release rules: two Insider turns each for three to five players, retaining three each for two players.

At 20 seconds TIP + 20 seconds GUESS + 8 seconds REVEAL, eight rounds have a 6 minute 24 second phase budget; ten have 8 minutes. Early submissions shorten that; onboarding and transitions add time. Measure real sessions before advertising a duration.

Two rotations let players build a reputation and later use it. Keep the original round-count tests for original-v1 only.

### 5.4 Timeouts — proposed revision

Retain the original sit-out timeout behavior unless a change is approved. Proposed experiment: an automatic 100-coin guess in the headline direction, without a Shark call, for a missed guess deadline. It counts as an ordinary guess and does not consume All In. Mark it as automatic in the reveal.

This removes deliberate zero-risk sitting out, but it also penalizes disconnections. Explain the rule before play and measure whether it feels fair. If explicit passing is desired later, make it a limited, intentional mechanic rather than a hidden timeout benefit.

### 5.5 Terminology and trust

Use one consistent direction language. For example, UP/BUY and DOWN/SELL paired on the initial learning screens, then a consistent primary label throughout play.

Consider renaming the fixed 300 option to “Big Bet — once per game”; “All In” normally implies the whole balance. Use onboarding tests to inform a proposal; retain All In unless the user approves renaming it.

Show compact trust values beside player avatars; put detailed charts in the drawer. Explain trust as past behavior, not a probability of the current role.

## 6. Implementation milestones and acceptance gates

Treat each numbered task as a reviewable work item, not a mandatory separate commit. Commit coherent working changes. Do not commit failing intermediate application states merely to match this list.

### Milestone 0 — Foundation and first public deployment

1. Create the three workspaces, TypeScript configuration, lint/format configuration, Vitest, and root scripts for dev, typecheck, test, build, and start. Commit the lockfile.
2. Define public protocol types and runtime schemas, including bounded names, IDs, payloads, and enum values. Separate deployment limits from game rules.
3. Build the Express/Socket.IO entry point, health endpoint, validated environment loading, structured logging, and static production client serving. Support direct `/r/CODE` navigation.
4. Build the React shell with Home, loading, connection, and recoverable error states. Add a minimum keyboard-accessible layout.
5. Configure a single-instance production host and deploy immediately. Record build/start commands and verify HTTPS and persistent socket connections from a phone on mobile data.

Acceptance: clean install, typecheck, meaningful initial schema tests, and production build succeed; public URL and room-link fallback load. No secrets are bundled into the client.

### Milestone 1 — Rooms, identity, and runtime

6. Implement room creation/join, collision-checked four-letter codes, bounded room capacity, name validation, and host settings. Set room/global creation limits to prevent unbounded in-memory allocation.
7. Issue opaque resume tokens, store only token hashes server-side, and bind authenticated sockets to seats. Store the token client-side per room. Never put it in the room URL or logs.
8. Define one active socket per seat: a successful rejoin replaces the previous binding. A replaced socket cannot submit actions or mark the new connection disconnected.
9. Build the ordered room runtime, duplicate-command handling, monotonic revisions, common error acknowledgements, scheduler, and stale-effect checks.
10. Implement lobby projections and broadcasts. Build Create/Join, copy-link, player list, mode choice, host-only Start, and clear join errors.
11. Add reconnection, host-transfer grace periods, explicit leave behavior, and inactivity cleanup. With no connected humans, stop optional work and delete the room after a configured grace period; bot activity must not keep it alive indefinitely.

Acceptance: socket integration tests cover create/join/full room, spoofed identity, unauthorized settings/start, rejoin, replaced sockets, duplicate commands, host transfer, and cleanup. Two isolated browser contexts can refresh without losing seats. Two tabs in one browser profile intentionally share a seat if they share its token; use separate contexts to simulate different people.

### Milestone 2 — First complete playable loop

12. Define private phase state, command types, rules versions, explicit RNG streams, turn order, and news draws without repeats. Detect a content pool too small for the configured match.
13. Implement start, tip submission, guess submission, deadline defaults, resolve, next round, final, and reset transitions. Illegal commands cannot mutate state.
14. Implement scoring breakdowns, basic standings, and trust calculation as pure functions. First playable UI uses fixed 100 stakes; full original scoring remains available for fixture tests.
15. Build the scheduler integration and early resolution. Test final-guess versus timeout ordering, delayed callbacks, duplicate resolution, and actions against an old game after replay.
16. Implement phase projections and privacy tests before adding secret UI. Keep all unrevealed selections server-side except the viewer's own.
17. Build functional TIP, GUESS, static REVEAL, and FINAL screens. Include role objectives, confirmation/lock state, reconnect feedback, a short explanation, and replay.
18. Add two basic bots through the same engine commands and a solo-start flow. Bots receive restricted observations and use fake-clock-testable delays. Begin with a small reviewed headline pool.

Acceptance: a new visitor can finish a solo game and a group can finish a multiplayer game on the deployed site. A refresh in every phase restores the correct view. No private fields leak. This gate comes before elaborate bot personalities, live AI, or large content packs.

### Milestone 3 — Balance, replays, and rule freeze

19. Encode Appendix A and B as scripted fixtures with explicit draws and actions. Assert every round's deltas, balances, trust, records, and final awards under original-v1. These fixtures validate arithmetic, not stochastic bot behavior.
20. Run targeted incentive scenarios: honest Partner versus sabotage, Shark call thresholds, Strong versus normal, two-player play, leader behavior, stake choices, and unequal role draws.
21. Play several real sessions, including at least one remote session, and record misunderstandings and moments of engagement. Compare candidate Partner scoring, revised timeouts, and two rotations.
22. Document playtest findings and present any proposed rule changes for user approval. Retain original-v1 unless a change is approved; update public explanations, bot strategy assumptions, and fixtures together for approved changes. Continue independent feature work while decisions are pending.

Acceptance: the selected rules have no identified trivial strategy that defeats the intended core interaction; unresolved balance concerns are documented honestly. Players can explain their objective after one round. Record actual game duration and whether reputation affected later decisions. Simulations support this review but cannot prove strategic balance.

### Milestone 4 — Strategic actions, chat, and personality bots

23. Add Strong tips, variable stakes, the once-per-game large bet, and Shark calls against the frozen release rules. Rejected/retried actions must never consume resources twice.
24. Add quick-chat with phase/seat-based eligibility, phrase IDs, per-seat rate limits, bounded history, and bubble expiry. “Insider phrase” eligibility must depend on being the current Insider, not the secret Partner/Shark motive.
25. Add visible trust values, drawer charts, and structured track records. Verify sympathy/caught changes apply once regardless of accusation count.
26. Implement and test all five required bot personalities, starting with two as an intermediate checkpoint. Define the 80% personality/20% random mixture mathematically; do not confuse branch probabilities with final observed rates.
27. Resolve specification conflicts explicitly: Partner bots always tell the truth; Nina's headline preference applies when it does not violate that rule. Any always/never rule must have clear precedence over random mixing and probability clamps.
28. Implement tell lines and timing. Test active tell and false-tell cases with controlled RNG inputs. Walt's timing overrides the general tip-delay range. Keep all bot actions before the applicable phase deadline.
29. Evaluate bot guesses at execution time using chat received up to that point. Define modifiers as once per distinct relevant phrase category per round, avoiding unlimited probability changes from repeated messages.
30. For “chat changed the decision” replies, compare baseline and modified decisions using identical sampled values, or explicitly label replies as reactions rather than causal claims. Never claim a changed decision based on independent rerolls.
31. Add first-solo-game hints and end-screen bot tell explanations. Keep learning notes non-blocking so local reading cannot silently pause an authoritative match.

Acceptance: bots cannot inspect opponent secrets; role/phase restrictions are enforced server-side; tells are learnable but imperfect; chat has bounded, testable effects; quick-chat does not disclose hidden selections. Play multiple solo games and evaluate whether learning improves decisions.

### Milestone 5 — Content and presentation

32. Complete a pool of at least 150 reviewed fictional-company news entries. Validate unique IDs/headlines, required fields, sentiment labels, and sufficient content for every supported mode. A deny-list assists review but does not prove all references are fictional.
33. Add immediate template narration based on immutable resolved results. Describe actual outcomes without inventing player intentions. Include correct double-bluff, caught-Shark, automatic-guess, and shared-win cases.
34. Animate reveal stages: market direction, motive, outcomes, narration. Calculate animation position from the server reveal timestamp so reconnecting midway does not replay an obsolete sequence.
35. Finish final standings, qualifying awards, charts, bot lessons, and replay. Provide textual alternatives to charts and non-color indicators for direction and outcomes.
36. Build a concise tutorial and contextual hints. Keep the core objective visible at the moment of choice. Offer enough reveal detail to explain every balance change.
37. Implement hold-to-peek with pointer cancellation, release, blur, visibility changes, and a keyboard-accessible alternative. Treat it as shoulder-surfing friction, not security against the owning player sharing their secrets.
38. Implement the required Show Table decoy and test its clarity with players. It must never prove a role; explain the mechanic. It cannot prevent someone from showing their real secret screen.
39. Audit small phones, large text, keyboards, focus, reduced motion, touch targets, and contrast. Aim for no ordinary scrolling during TIP/GUESS at 375×667, while allowing scrolling under accessibility zoom rather than clipping controls.
40. Implement both light and dark themes and the required lock-in, reveal, and win sound effects after the core screens are clear. Persist mute preference and respect browser audio interaction requirements.

Acceptance: the reveal is understandable at normal speed; small-phone controls remain usable; timing works when tabs are backgrounded; charts and sounds are enhancements rather than requirements for understanding.

### Milestone 6 — AI narration and reliable fallbacks

41. Wrap the narrator behind an interface with template-only and API-backed implementations. Keep API credentials on the server. Verify current provider documentation during implementation.
42. Start narration after resolution, using only a bounded structured round summary. Enforce timeout, output-length limits, per-room limits, global concurrency limits, and an operating budget. Abort work where supported; do not retry indefinitely.
43. Apply returned text through a command containing game and round IDs. Accept it only for the intended still-relevant reveal/final report; ignore late results after replay or room cleanup.
44. Avoid replacing text the player has already started reading. Use an AI result only before the narration portion of the reveal begins; otherwise retain the template for that reveal.
45. Test success, missing credentials, malformed output, refusal/error, timeout, stale completion, and budget exhaustion with a fake provider. Keep live-provider checks separate from deterministic tests.

Acceptance: unavailable AI never delays a phase or prevents play. Prompt instructions and input limits reduce injection risk but do not guarantee it; templates remain a fully supported release path. Test names that actually pass the name validator rather than an impossible over-length test string.

### Milestone 7 — Production verification and submission

46. Review event validation, authorization, room creation limits, session replacement, room-code enumeration limits, payload size limits, and logs. Do not log tokens or current secrets. Verify production origin configuration.
47. Keep forced draws in direct test fixtures and a local development harness. Exclude any remotely accessible force-draw handler from the production server; verify it cannot be called in the production build.
48. Run focused multi-room load and soak tests. Include at least three rooms of five simulated seats, repeated matches, reconnect churn, cleanup, and API failures. Measure memory, timer counts, duplicate scoring, and cross-room contamination.
49. Test real devices: solo on a phone, a group across phones/laptops, Wi-Fi interruption, refresh in every phase, host disconnect, background/resume, expired room, and simultaneous lock-in near a deadline.
50. Document setup, environment, build/start, rules configuration, content editing, tests, debug workflow, deployment limitations, and restart behavior. Graceful shutdown stops accepting new rooms and reports closure; it must not pretend in-memory games will survive.
51. Prepare a title, cover image, description, and working project URL. Verify the signed-in mission's requirements and eligibility. User submits the reviewed entry unless they separately authorize submission assistance.
52. Freeze changes, deploy the tested build, verify the live URL again, and submit by October 28–29. Keep hosting available through the judging period and avoid unnecessary disruptive redeploys.

Acceptance: production artifact passes typecheck, test suites, build, browser smoke tests, privacy checks, and real-device checks. Document actual results; a planned test is not a passed test.

## 7. Testing specification

### Deterministic engine tests

- Each legal phase transition and illegal action.
- Both original demo replays, plus release-rules fixtures.
- Stakes, payouts, transfers, trust floor, awards, and shared winners.
- Equal turn counts, depleted content handling, independent role draws.
- Exact RNG threshold boundaries and reproducible RNG-state advancement.
- Input immutability and identical outputs for identical explicit inputs.
- Score breakdown components sum to each final delta; do not assume total coins are conserved because bank payouts exist.

### Privacy tests

Use fixtures differing only in hidden state. A non-Insider's view must remain unchanged when current role/direction changes before reveal. A viewer's snapshot must remain unchanged when another locked player's pick/stake/call changes. Keep public submitted status equal in comparisons.

Assert no seeds, session credentials, unrevealed internal state, or future data appear. Verify the permitted Insider and own-submission fields. Test current All In visibility separately from previous revealed usage. Run projections for every seat and phase.

### Runtime and socket tests

- Authentication and host authority on every relevant command.
- Same-command retries and conflicting duplicate IDs.
- Submission committed but acknowledgement lost, followed by rejoin/retry.
- Old socket events after replacement.
- Last guess and timeout arriving in either order.
- Timer fires late; action is still rejected after the deadline.
- Old-game bot, timer, and narrator callbacks after replay.
- Disconnect/reconnect, host grace, room cleanup, and restart-expired room response.
- Oversized/malformed payloads and bounded collections.

### Bot tests

Test deterministic branches first. Add seeded distribution checks only where useful, with tolerances reflecting the actual mixture formula. Verify no access to hidden state and no change in game draws when cosmetic RNG consumption changes.

### Browser tests

Use isolated browser contexts for multiple players. Cover solo completion, multiplayer completion, refresh recovery, own-action restoration, mobile viewport, keyboard navigation, and reveal progression after reconnect.

### Human playtests

Record player count, mode, version, duration, confusing decisions, ignored mechanics, suspected dominant strategies, and memorable moments. Ask players to describe why they trusted someone and whether they wanted another round. Fix repeated friction before adding content volume.

## 8. Schedule and full-scope delivery

| Dates         | Intended outcome                                                    |
| ------------- | ------------------------------------------------------------------- |
| October 1–4   | Foundation, initial deployment, rooms, sessions, runtime            |
| October 5–10  | Complete core game, basic bots, privacy and race tests              |
| October 11–15 | Demo fixtures, balance playtests, release-rule decision             |
| October 16–21 | Strategic actions, chat, trust, personality bots, content           |
| October 22–25 | Presentation, AI narration and fallbacks, hardening, device testing |
| October 26–29 | Buffer, fixes, submission assets, final verification and submission |

These are targets, not guaranteed effort estimates. All original features remain required regardless of milestone order. Do not respond to schedule pressure by silently reducing functionality, content counts, modes, bot coverage, or polish.

If progress slips:

1. Report the actual remaining work and its effect on the submission date.
2. Reorder independent tasks, reuse shared components, and resolve blockers without changing the promised behavior.
3. Keep automated verification close to implementation so defects do not accumulate until the final week.
4. Preserve real-device testing and the submission buffer as planning priorities.
5. If the full scope and deadline genuinely conflict, explain that conflict to the user and obtain an explicit decision. Do not assume authorization to ship a reduced entry.

Maintain a release checklist mapped to the required feature inventory. Every feature must be implemented and verified before the release is described as complete. Templates used during an API outage, temporary placeholder content during development, or two bots used in an early checkpoint do not substitute for implementing the full planned feature set.

## 9. Definition of done

- Every item in the required release feature inventory is implemented and verified; there are no unapproved feature cuts or post-release deferrals.

- A first-time visitor can start solo immediately or join a friend's room without an account.
- Players understand their objective and can finish a game without developer guidance.
- The selected scoring rules have been played with humans, not only verified against examples.
- The same accepted command cannot charge, score, or advance twice.
- Unrevealed private information is absent from unauthorized clients and guessing bots.
- Brief connection loss restores the seat and action; restart limitations are explained accurately.
- Timers, bots, and narration cannot mutate the wrong round or a replacement game.
- The game is usable on phones and has clear keyboard/focus and reduced-motion behavior.
- Optional external services can fail while the entire game remains playable.
- The public deployment and submission materials have been reviewed, and actual verification results recorded.

## 10. Immediate next implementation step

Continue from the verified checkpoints with content review, remaining contextual hints and recovery checks, deployment, human/device playtests, and release verification. Implement original-v1 as the baseline, record balance proposals separately, and seek user approval before changing gameplay rules. Then complete every remaining milestone, including all content, all five bots, all modes and strategic actions, live narration and fallbacks, both themes, sound, and the full polish and verification requirements. Sequencing does not change scope.
