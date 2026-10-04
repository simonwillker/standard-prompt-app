// Starts each plugin's bundled MCP server over stdio (as the hosts do) and checks the tool contracts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const golden = JSON.parse(readFileSync(root + "tests/snapshots/meeting-minutes-basic.result.json", "utf8"));
const goldenPrompt = readFileSync(root + "tests/snapshots/meeting-minutes-basic.prompt.txt", "utf8");
const goldenRequest = JSON.parse(readFileSync(root + "tests/fixtures/golden/meeting-minutes-basic.json", "utf8")).request;

async function connect(adapter: string) {
  const client = new Client({ name: "spt-test", version: "0.0.0" });
  // Run from an unrelated directory without SPT_REGISTRY_DIR, like an installed plugin.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== "SPT_REGISTRY_DIR" && v !== undefined)) as Record<string, string>;
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [root + "adapters/" + adapter + "/server/standard-prompt-mcp.mjs"], cwd: tmpdir(), env, stderr: "pipe"
  }));
  return client;
}
const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  assert.deepEqual(JSON.parse(text), result.structuredContent);
  return { value: result.structuredContent as any, isError: result.isError === true };
};

test("plugin manifests point at the bundled server", () => {
  const claude = JSON.parse(readFileSync(root + "adapters/claude/.mcp.json", "utf8")).mcpServers["standard-prompt"];
  assert.deepEqual(claude.args, ["${CLAUDE_PLUGIN_ROOT}/server/standard-prompt-mcp.mjs"]);
  const codex = JSON.parse(readFileSync(root + "adapters/chatgpt/.mcp.json", "utf8")).mcpServers["standard-prompt"];
  assert.deepEqual([codex.cwd, codex.args], [".", ["./server/standard-prompt-mcp.mjs"]]);
  const claudeMarket = JSON.parse(readFileSync(root + ".claude-plugin/marketplace.json", "utf8"));
  const codexMarket = JSON.parse(readFileSync(root + ".agents/plugins/marketplace.json", "utf8"));
  assert.equal(claudeMarket.plugins[0].source, "./adapters/claude");
  assert.equal(codexMarket.plugins[0].source.path, "./adapters/chatgpt");
  const versions = [
    JSON.parse(readFileSync(root + "adapters/claude/.claude-plugin/plugin.json", "utf8")).version,
    JSON.parse(readFileSync(root + "adapters/chatgpt/.codex-plugin/plugin.json", "utf8")).version,
    claudeMarket.plugins[0].version
  ];
  assert.deepEqual(new Set(versions).size, 1);
});

for (const adapter of ["claude", "chatgpt"]) {
  test("MCP server contract: " + adapter, async () => {
    const client = await connect(adapter);
    try {
      const tools = (await client.listTools()).tools.map(t => t.name).sort();
      assert.deepEqual(tools, ["get_template", "list_templates", "render_prompt", "validate_template"]);

      const list = await call(client, "list_templates", {});
      assert.deepEqual(list.value.templates.map((t: { id: string }) => t.id), ["email-reply", "meeting-minutes", "requirement-extract"]);
      assert.deepEqual((await call(client, "list_templates", { query: "需求" })).value.templates.map((t: { id: string }) => t.id), ["requirement-extract"]);

      const got = await call(client, "get_template", { id: "meeting-minutes", version: "1.0.0" });
      assert.equal(got.value.ok, true);
      assert.equal(got.value.content_sha256, golden.template.content_sha256);
      const missing = await call(client, "get_template", { id: "meeting-minutes", version: "0.0.1" });
      assert.deepEqual([missing.isError, missing.value.errors[0].code], [true, "TEMPLATE_NOT_FOUND"]);

      const source = readFileSync(root + "templates/email-reply.yaml", "utf8");
      const valid = await call(client, "validate_template", { format: "yaml", content: source });
      assert.equal(valid.value.valid, true);
      const invalid = await call(client, "validate_template", { format: "yaml", content: "a: 1\na: 2" });
      assert.deepEqual([invalid.value.valid, invalid.value.errors[0].code], [false, "PARSE_ERROR"]);

      const rendered = await call(client, "render_prompt", goldenRequest);
      assert.equal(rendered.isError, false);
      assert.equal(rendered.value.prompt, goldenPrompt);
      const { prompt, ...rest } = rendered.value;
      assert.deepEqual(rest, golden);

      const both = await call(client, "render_prompt", { ...goldenRequest, template_source: { format: "yaml", content: source } });
      assert.deepEqual([both.isError, both.value.errors[0].code, "prompt" in both.value], [true, "INVALID_TEMPLATE_SOURCE", false]);
      const required = await call(client, "render_prompt", { template_ref: goldenRequest.template_ref, variables: {} });
      assert.deepEqual([required.value.ok, required.value.errors[0].code], [false, "VARIABLE_REQUIRED"]);
    } finally {
      await client.close();
    }
  });
}
