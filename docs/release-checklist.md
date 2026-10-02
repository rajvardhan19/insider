# Full-scope release checklist

Updated October 2, 2026. All items from `IMPLEMENTATION_PLAN.md` remain required. “Implemented” below does not mean release acceptance is complete. No public deployment or human playtest is claimed.

| Plan tasks | Current evidence | Remaining acceptance work |
| --- | --- | --- |
| 1–4: foundation, schema, server, shell | Types/lint/build, protocol tests, interactive client | Verify configured CI run |
| 5: public deployment | Portable Dockerfile, built-server smoke | Build container, choose/configure host, HTTPS, mobile data |
| 6–11: rooms and identity | Socket auth, roster, host transfer, reconnect, limits, cleanup tests; two browser identities checked | More browser recovery tests, especially acknowledgement loss and reconnect during pending commands |
| 12–18: pure core and playable loop | Deterministic engine, private projections, deadlines, bots, full solo browser match and replay | Refresh/background recovery in every phase on devices; full remote human match |
| 19–20: fixtures and incentives | Both exact Appendix replays; scoring/debt/call/floor boundary tests | Broader incentive simulations and documented balance review |
| 21–22: playtest and rule freeze | Original-v1 preserved | Human sessions, remote session, record feedback; user approval for any changes |
| 23–25: strategic actions, chat, trust | Original stakes, Strong, Shark calls, once-per-game All In, chat, charts and receipts | Human comprehension checks; phone chat usability |
| 26–30: five bots, tells, reactions | All policies, bounded modifiers, deterministic tell and honesty tests | Multi-game learning/playtest review |
| 31: solo discovery | First-game tell boost, Analyst Note, final tell lessons | Contextual first-round hints and discovery review |
| 32–33: content and templates | 150 structurally unique headlines, bot lines, 40 template leads, fact-based reports | Full editorial review and more varied news; verify all role/tell coverage against PDF |
| 34–38: reveal/final/tutorial/privacy UI | Staged market/motive/outcomes/news, awards, charts, tutorial, hold-to-peek and decoy | Human decoy clarity and timing; cancellation/keyboard/background tests |
| 39–40: accessibility and polish | Light/dark, sounds/mute, reduced-motion CSS, 375×667 layout and touch targets | Large text, contrast audit, keyboard/screen reader, real phones |
| 41–45: live narration/fallbacks | Responses adapter, bounds/budgets, fake-provider and stale-result tests, frozen published text | Credentialed API latency/quality smoke; no paid calls made yet |
| 46–47: production boundaries/debug | Origin checks, shutdown, local-only harness, artifact checks | Deployment-specific edge limits and final security review |
| 48: load/soak | Accelerated 3-room/15-seat/12-match run, reconnects/retries/API failures; cleanup asserted | Long-duration production-like soak and memory trend |
| 49: real devices | Local emulated mobile/browser evidence only | Real-device interruption/refresh/background/deadline matrix |
| 50: documentation | Setup, narration, debug and deployment docs | Content-editing guide, final operational limits and live host instructions |
| 51–52: submission | Project title and design established | Cover asset, final description, live URL, signed-in mission/eligibility review, final verification; user submits unless separately authorized |

Release blockers include public hosting, credentialed API verification, content review, contextual hint completion, human/device testing, long soak, and submission assets. They remain in scope.

## Approved additions — October 2, 2026

The user requested explicit name entry, more bot personalities (not more seats), and a watch-only simulation. The roster is now eight personalities. Bot-only matches are permitted only through the separate spectator flow; normal multiplayer remains 2–5 seats with a human. Verification is recorded in checkpoints 11–12.
