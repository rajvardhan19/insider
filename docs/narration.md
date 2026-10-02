# Optional AI narration

The engine always creates a template immediately. No API request belongs to a game transition, and narration never affects scores, RNG, deadlines, or actions.

The production entry point installs one OpenAI Responses provider. `OPENAI_API_KEY` stays on the server; without it the provider returns immediately and the complete game uses templates. Set variables in the process or hosting environment (`.env` is not automatically loaded). `OPENAI_MODEL` defaults to `gpt-4.1-mini`; check availability for your API project before enabling it.

The provider uses the [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), with instructions separate from JSON facts, `store: false`, and bounded output tokens. Only resolved outcomes and bounded display names are sent. Session identifiers, tokens, random seeds, chat, and future draws are excluded. Output is plain React text, never HTML. Prompt instructions reduce injection and invented claims; they cannot guarantee factual narration. The scoring receipts remain authoritative.

## Timing and publication

- A request starts once per reveal. An additional Closing Bell request starts during the last reveal, using final balances and awards.
- Requests time out after 2.5 seconds and support cancellation. There are no retries.
- Round text is accepted only before reveal +2.4 seconds, before its +2.8-second display stage. The client freezes text when it becomes visible, guarding against delayed delivery.
- Closing text is accepted only during the final reveal. The final screen receives the prepared report or its immediate template.
- Completions check room identity, game ID, round, phase, deadline, connected humans, and cancellation. Cleanup, replay, and phase changes abort obsolete work.

## Operating limits

- `AI_MAX_CALLS=500`: maximum requests per server process lifetime (0 disables). Failed requests consume budget. Restarting resets this counter; this is not a dollar budget. Set API project spending controls separately.
- `AI_MAX_CONCURRENT=3`: global in-flight limit (0 disables). Excess work falls back immediately, without a queue.
- Each room can attempt at most 100 reports over its lifetime, including replays.
- Input JSON is capped at 12,000 characters; the HTTP response body at 64 KiB; output at 300 characters/45 words for rounds or 700 characters/100 words for Closing Bell.
- Missing key, HTTP/network errors, refusals, malformed/truncated output, timeout, cancellation, and exhausted limits all retain templates.

## Verification

Deterministic fake-transport tests verify request shape, parsing, bounds, failure paths, and cancellation. Socket tests verify timely publication, scores remaining unchanged, visibility cutoff, old-round/game completion, cleanup, and final report preparation. Run `npm run check`.

A credentialed live-provider smoke test is still required before release. Enable the provider in a private local session, finish a game, and check latency and narration quality without logging credentials or raw requests. A slow valid response may intentionally fall back to the template.
