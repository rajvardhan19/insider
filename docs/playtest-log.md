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
