// Golden tests: each tests/fixtures/golden/<case>.json render request must reproduce
// tests/snapshots/<case>.prompt.txt (byte for byte) and tests/snapshots/<case>.result.json.
// Regenerate after an intended change with: npm run golden:update
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hash, renderPrompt, type RenderRequest } from "../packages/core/src/index.js";
import { loadRegistry } from "../packages/core/src/node.js";

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const fixtures = dir("./fixtures/golden/"), snapshots = dir("./snapshots/");
const registry = loadRegistry(dir("../registry/"));
const update = process.env.UPDATE_GOLDEN === "1";

function goldenCases() {
  return readdirSync(fixtures).filter(n => n.endsWith(".json")).sort().map(file => {
    const fixture = JSON.parse(readFileSync(fixtures + file, "utf8")) as { template_file?: string; request: RenderRequest };
    const request = { ...fixture.request };
    if (fixture.template_file) {
      request.template_source = { format: "yaml", content: readFileSync(dir("./fixtures/templates/" + fixture.template_file), "utf8") };
    }
    return { name: file.replace(/\.json$/, ""), request };
  });
}

for (const { name, request } of goldenCases()) {
  test("golden: " + name, () => {
    const result = renderPrompt(request, registry);
    const { prompt, ...rest } = result as typeof result & { prompt?: string };
    const promptFile = snapshots + name + ".prompt.txt", resultFile = snapshots + name + ".result.json";
    const resultText = JSON.stringify(rest, null, 2) + "\n";
    if (update) {
      if (prompt === undefined) rmSync(promptFile, { force: true });
      else writeFileSync(promptFile, prompt);
      writeFileSync(resultFile, resultText);
    }
    assert.equal(resultText, readFileSync(resultFile, "utf8"));
    if (prompt === undefined) assert.equal(existsSync(promptFile), false);
    else {
      const expected = readFileSync(promptFile, "utf8");
      assert.equal(prompt, expected);
      assert.equal(hash(expected), (rest as { prompt_sha256: string }).prompt_sha256);
    }
    // Ten renders of the same request are identical.
    for (let i = 0; i < 10; i++) assert.deepEqual(renderPrompt(request, registry), result);
  });
}
