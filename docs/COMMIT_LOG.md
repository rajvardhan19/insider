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
