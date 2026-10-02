# Single-server deployment

The release uses one continuously running Node process holding rooms in memory. Do not horizontally scale it or use request-only/serverless hosting. A restart ends existing matches; reconnecting preserves a seat only while its room exists.

## Build and launch without Docker

Requires Node 22.12 or later. From the repository root:

```sh
npm ci
npm run check
NODE_ENV=production HOST=0.0.0.0 PORT=3001 PUBLIC_ORIGIN=https://your-game.example npm start
```

Replace the example with the actual public origin, without a trailing slash. The public reverse proxy must forward WebSocket upgrades and ordinary HTTP traffic to port 3001. Terminate HTTPS at that proxy. `/health` is the health-check route. The built server serves the frontend and direct `/r/CODE` links on the same origin. Socket connections with a different browser Origin are rejected.

Supply variables through the host's environment/secrets settings. `.env` files are not automatically loaded. Optional narration configuration is in [narration.md](narration.md). Never prefix an API key with `VITE_`, commit it, or put it in a URL.

## Portable container

```sh
docker build -t insider .
docker run --rm -p 3001:3001 -e PUBLIC_ORIGIN=http://localhost:3001 insider
```

For public hosting, use the HTTPS origin and one instance. The multi-stage Dockerfile verifies the project, removes development dependencies, and runs the server as the unprivileged `node` user. Environment files, Git history, existing build output, and local dependencies are excluded from the build context.

The local Docker daemon was unavailable during preparation, so the container build is not yet verified. The equivalent built Node server passed the production smoke test. Do not mark container deployment as verified until the image is built and tested.

## Verification and operations

`npm run check` runs types, lint, 61 tests, production builds, bundle boundaries, and a built-server smoke test. `npm run smoke:production` can be repeated after a build. CI runs the same checks plus both document demos on Node 22.

The automated smoke test disables paid narration and verifies health, root/direct-link HTML, WebSocket solo creation, and shutdown notification. Bundle checks verify that local harness code is absent from the server artifact and selected private/server markers are absent from client JavaScript.

Before publishing, verify the container or chosen host configuration, HTTPS, a live room link, two isolated players, phone/mobile-data access, and reconnect behavior. Keep one instance available through judging. Monitor process memory, request failures, and restarts without logging tokens, private draws, or API payloads. Admission is limited by the direct socket address; behind a proxy this may group visitors under one address. Configure and test an appropriate per-client edge limit before broad launch rather than trusting arbitrary forwarded headers.

On SIGTERM/SIGINT the server announces shutdown, clears rooms/timers, and closes sockets. Use a host with a shutdown grace period. Sessions are deliberately not durable across restarts. A graceful restart still ends games.

No public host, account, domain, or live URL has been configured yet. This is a deployment-ready source workflow, not a claim of public deployment or verified container hosting.
