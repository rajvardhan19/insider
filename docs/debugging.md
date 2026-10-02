# Local engine harness

Run `npm run debug:game` for an interactive, deterministic four-player game in the terminal. This harness never starts a server, listens on a port, calls an API, or advances a real timer.

Commands:

- `peek`: inspect the private current round locally.
- `force DOWN SHARK`: choose a market direction and role during TIP.
- `tip UP strong`: submit the current Insider's tip (`strong` is optional).
- `guess Leo DOWN 200 shark`: submit a named guesser's read (`shark` is optional).
- `expire`: advance to the exact current deadline, including sit-outs.
- `view Leo`: inspect the allowlisted snapshot for that seat.
- `reset`: restart from seed 12345.
- `quit`: exit.

Use uppercase directions and roles and the displayed case-sensitive seat names. Illegal actions are rejected by the same pure engine used by live rooms.

## Exact document replays

```sh
npm run debug:game -- --demo A
npm run debug:game -- --demo B
```

Both commands assert every documented coin and trust checkpoint and print the closing result. The test suite imports these same scenario fixtures. Scripted bot choices validate the examples' arithmetic, not stochastic bot policy behavior.

The harness rejects `NODE_ENV=production` and is not imported by the production entry point. There is no remotely accessible force-draw event. Never connect debug commands to socket handlers.

## Multi-room verification

`npm run check` includes a bounded accelerated soak: three rooms, five seats each, four matches per room, 60 reconnects, retried actions, failed narration, and cleanup. It checks balances against the complete receipts, room isolation, bounded snapshots, empty timer queues at FINAL, and empty room/binding/cache state after cleanup. Heap change is sampled diagnostically; GC noise means it is not proof against leaks. A long-running production-like soak remains on the release checklist.
