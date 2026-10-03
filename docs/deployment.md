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

`npm run check` runs types, lint, the full test suite, production builds, bundle boundaries, and a built-server smoke test. `npm run smoke:production` can be repeated after a build. CI runs the same checks plus both document demos on Node 22.

The automated smoke test disables paid narration and verifies health, root/direct-link HTML, WebSocket solo creation, and shutdown notification. Bundle checks verify that local harness code is absent from the server artifact and selected private/server markers are absent from client JavaScript.

Before publishing, verify the container or chosen host configuration, HTTPS, a live room link, two isolated players, phone/mobile-data access, and reconnect behavior. Keep one instance available through judging. Monitor process memory, request failures, and restarts without logging tokens, private draws, or API payloads. Admission is limited by the direct socket address; behind a proxy this may group visitors under one address. Configure and test an appropriate per-client edge limit before broad launch rather than trusting arbitrary forwarded headers.

On SIGTERM/SIGINT the server announces shutdown, clears rooms/timers, and closes sockets. Use a host with a shutdown grace period. Sessions are deliberately not durable across restarts. A graceful restart still ends games.

## Free Render playtest

The repository includes `render.yaml` for a free Node web service using `feature-branch`. Import that branch as a Render Blueprint, review the **Free** plan, and deploy. This is a web service, not a static site.

- Build: `npm ci --include=dev && npm run check`
- Start: `PUBLIC_ORIGIN="$RENDER_EXTERNAL_URL" node server/dist/index.js`
- Health check: `/health`
- Node: 22; `NODE_ENV=production`; `HOST=0.0.0.0`
- Render supplies `PORT` and the HTTPS `RENDER_EXTERNAL_URL`; the start command uses that exact URL for the existing WebSocket origin check.
- One instance, no database required. `AI_MAX_CALLS=0` keeps the friends-only test on prewritten narration without API charges.
- Automatic deploys are disabled so commits do not interrupt friends mid-match. Deploy the latest commit manually between playtests.

Render's free service sleeps after 15 minutes without inbound HTTP/WebSocket traffic; the next request can take about a minute to wake it. Sleep, maintenance, and deploys clear rooms. Create a fresh room after a restart. Do not use artificial keep-alive traffic to circumvent free-tier limits.

After deployment, verify the actual HTTPS URL, `/health`, direct room links, two-player joining, reactions, and reconnect before sharing it. The Blueprint is deployment preparation; a live URL is only confirmed after those checks. If you add a custom domain later, update the start command's `PUBLIC_ORIGIN` to that domain.

References: [Render free services](https://render.com/docs/free), [WebSockets](https://render.com/docs/websocket), [Blueprint specification](https://render.com/docs/blueprint-spec), [platform environment variables](https://render.com/docs/environment-variables).
