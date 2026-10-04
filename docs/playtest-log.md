# Playtest and verification log

## October 2, 2026 — agent-operated local browser checks

These checks exercised the UI; they are not human playtests or real-device evidence.

- Completed a solo match, reached standings/awards/tell lessons, and replayed with reset coins/trust.
- Reloaded after a 200-coin lock-in and recovered the same accepted private choice.
- Created a room with two isolated browser origins, added a bot, switched mode, verified host-only controls, refreshed the guest, started play, used the Show Table decoy and a Strong tip, and submitted a guest guess.
- Checked 375×667 light/dark layouts. Ordinary TIP/GUESS screens fit without scrolling; primary controls meet 44px height. A fresh solo start shows 20 seconds.
- Browser console checks during the solo flow showed no warnings/errors.

Automated evidence: exact Appendix A/B replays, 61 passing tests, multi-room churn, production bundle boundaries, and built-server smoke. See the commit log for checkpoint-specific details.

## Human sessions still required

For each session record build SHA, actual people/device count, mode, duration, network, confusing decisions, ignored mechanics, suspected dominant strategy, and memorable moments. Ask each person to explain their role objective and why they trusted a tip. Record whether they want another game. Include at least one remote session and phone/mobile-data access.

Do not infer understanding, fun, strategic balance, or willingness to replay from automated success.

## October 3, 2026 — comedy update verification

- `npm run check`: 92 tests across 10 files pass, plus type checks, lint, production builds, client/server bundle boundaries, and built-server smoke. Original scoring and exact Appendix A/B replay assertions remain intact.
- New tests cover 300 news punchlines, 128 anchor templates, credit boundaries, cosmetic badge expiry, trust-phrase mapping, hidden-state differential privacy, trigger priority/expiry, all four client levels, between-tick caption arrival, and synchronized/idempotent/rate-limited reactions.
- Agent-operated browser: bot matches progress to FINAL; commentary OFF persists across refresh and keeps reveal/Closing Bell reports; NORMAL produces live captions; a tomato throw displays and disables reaction controls during cooldown; See the math opens full round receipts.
- Visually checked punchline-first reveal, Shark avatar, trust-crash chart, credit labels, BANKRUPT badge, award names, and settings. Saved current reveal and settings screenshots in `docs/screenshots/`.
- Settings checked at 375×667 with no horizontal overflow. Temporary viewport override reset afterward. Fixed generic input styling that had oversized radio controls.
- Found and fixed a fresh-caption arrival race: snapshots could arrive slightly ahead of the client's last display-clock tick. The queue now retains that line until the next tick; a regression test covers it.
- Audio behavior and reduced-motion styles are implemented; perceptual sound quality and real-device accessibility still need human checking. These browser checks do not establish whether the jokes land or the game feels lively.

### Suggested human playtest

Try a multiplayer game with mixed commentary levels, then a solo and bot-watch match. Include Strong tips, a lost All In, a trust crash, emoji reactions from two players, a reconnect, mute/unmute, and switching caption levels mid-round. Confirm the badge clears after the following round and the math remains understandable behind its disclosure. Record jokes that feel repetitive, captions arriving too late, and effects that obscure decisions. No scoring or timing rule changes were made for this update.

## October 4, 2026 — public deployment verification

- Render reported the `fe1c033` deployment live at https://insider-playtest.onrender.com; free compute, Virginia, automatic deploys Off.
- Public integration check passed: health over HTTPS, room deep link, two-player WebSockets, hidden role isolation, tip/guess/reveal, cross-player emoji reaction, and token-based reconnect. Test seats removed.
- Browser recovered after Reconnect, started a bot simulation, reached a punchline reveal with live commentary, then returned to the homepage. Saved `screenshots/public-playtest.jpg`.
- Human fun/clarity testing and actual phone/mobile-data access remain unverified.
