import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const bundle = await readFile(
  new URL("../server/dist/index.js", import.meta.url),
  "utf8",
);
for (const marker of [
  "LOCAL_ENGINE_HARNESS_ONLY",
  "node:readline",
  "debug:force",
  "Appendix A:",
  "Appendix B:",
])
  assert.ok(
    !bundle.includes(marker),
    `Local debug code reached the production bundle: ${marker}`,
  );
const assets = new URL("../client/dist/assets/", import.meta.url);
for (const name of await readdir(assets)) {
  if (!name.endsWith(".js")) continue;
  const code = await readFile(new URL(name, assets), "utf8");
  for (const marker of [
    "OPENAI_API_KEY",
    "api.openai.com/v1/responses",
    "tokenHash",
    "botRng",
    "cosmeticRng",
  ])
    assert.ok(
      !code.includes(marker),
      `Server-only code reached a client asset: ${marker}`,
    );
}
console.info("Production bundle boundaries verified.");
