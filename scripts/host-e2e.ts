// Installs both plugins into real hosts (Claude Code and Codex CLI) from this repository's marketplaces,
// then has a scripted mock model call render_prompt and checks the prompt_sha256 each host received.
// No real model or account is used; host config lives in throwaway directories.
//
//   CLAUDE_BIN=<path to claude> CODEX_BIN=<path to codex or @openai/codex/bin/codex.js> npm run host-e2e
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/golden/meeting-minutes-basic.json"), "utf8")).request;
const expected = JSON.parse(readFileSync(join(root, "tests/snapshots/meeting-minutes-basic.result.json"), "utf8")).prompt_sha256 as string;
const toolArgs = JSON.stringify(fixture);
const work = mkdtempSync(join(tmpdir(), "spt-host-e2e-"));

type Mock = { url: string; bodies: string[]; close: () => void };
async function mock(handler: (body: any, res: http.ServerResponse) => void): Promise<Mock> {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      bodies.push(body);
      if (req.method !== "POST" || req.url?.includes("count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ input_tokens: 1 }));
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      handler(JSON.parse(body), res);
      res.end();
    });
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  return { url: "http://127.0.0.1:" + (server.address() as AddressInfo).port, bodies, close: () => server.close() };
}
const sse = (res: http.ServerResponse, type: string, data: object) => res.write("event: " + type + "\ndata: " + JSON.stringify({ type, ...data }) + "\n\n");
const answered = (body: unknown) => JSON.stringify(body).includes("prompt_sha256");
const receivedSha = (m: Mock) => m.bodies.join("\n").match(/prompt_sha256\\*":\s*\\*"([0-9a-f]{64})/)?.[1];
const env = (extra: Record<string, string>) => ({ ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", ...extra });
// Async so the in-process mock server keeps answering while the host runs.
const run = (bin: string, args: string[], extra: Record<string, string>) => {
  // npm-installed Codex ships a JavaScript launcher; run it with this Node so it also works on Windows.
  const [file, argv] = /\.[cm]?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
  const pending = promisify(execFile)(file, argv, { cwd: work, env: env(extra), encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  pending.child.stdin?.end(); // codex exec otherwise waits for more input on stdin
  return pending;
};

// Anthropic Messages API: call whichever tool name the host gave render_prompt.
async function claude(bin: string): Promise<string | undefined> {
  const m = await mock((body, res) => {
    const tool = (body.tools ?? []).find((t: { name?: string }) => t.name?.endsWith("render_prompt"));
    const call = tool && !answered(body.messages);
    sse(res, "message_start", { message: { id: "msg", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
    sse(res, "content_block_start", { index: 0, content_block: call ? { type: "tool_use", id: "toolu_1", name: tool.name, input: {} } : { type: "text", text: "" } });
    sse(res, "content_block_delta", { index: 0, delta: call ? { type: "input_json_delta", partial_json: toolArgs } : { type: "text_delta", text: "done" } });
    sse(res, "content_block_stop", { index: 0 });
    sse(res, "message_delta", { delta: { stop_reason: call ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
    sse(res, "message_stop", {});
  });
  try {
    const host = { CLAUDE_CONFIG_DIR: join(work, "claude") };
    await run(bin, ["plugin", "marketplace", "add", root], host);
    await run(bin, ["plugin", "install", "standard-prompt@standard-prompt-app"], host);
    const model = { ...host, ANTHROPIC_BASE_URL: m.url, ANTHROPIC_API_KEY: "sk-ant-mock", CLAUDE_CODE_OAUTH_TOKEN: "", ANTHROPIC_AUTH_TOKEN: "" };
    await run(bin, ["-p", "生成会议纪要 Prompt", "--allowedTools", "mcp__plugin_standard-prompt_standard-prompt__render_prompt"], model);
    return receivedSha(m);
  } finally { m.close(); }
}

// OpenAI Responses API: Codex exposes plugin MCP tools in a namespace.
async function codex(bin: string): Promise<string | undefined> {
  const m = await mock((body, res) => {
    const namespace = (body.tools ?? []).find((t: { type: string; tools?: { name: string }[] }) => t.type === "namespace" && t.tools?.some(x => x.name === "render_prompt"));
    const item = namespace && !answered(body.input)
      ? { type: "function_call", id: "fc_1", call_id: "call_1", namespace: namespace.name, name: "render_prompt", arguments: toolArgs }
      : { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: "done" }] };
    const usage = { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 };
    sse(res, "response.created", { response: { id: "resp" } });
    sse(res, "response.output_item.done", { output_index: 0, item });
    sse(res, "response.completed", { response: { id: "resp", usage } });
  });
  try {
    const home = join(work, "codex");
    mkdirSync(home);
    const host = { CODEX_HOME: home, OPENAI_API_KEY: "sk-mock" };
    await run(bin, ["plugin", "marketplace", "add", root], host);
    await run(bin, ["plugin", "add", "standard-prompt@standard-prompt-app"], host);
    const config = readFileSync(join(home, "config.toml"), "utf8");
    writeFileSync(join(home, "config.toml"), 'model = "mock-model"\nmodel_provider = "mock"\n\n' + config +
      '\n[model_providers.mock]\nname = "mock"\nbase_url = "' + m.url + '/v1"\nwire_api = "responses"\nsupports_websockets = false\n');
    await run(bin, ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "生成会议纪要 Prompt"], host);
    return receivedSha(m);
  } finally { m.close(); }
}

const results: Record<string, string | undefined> = {};
try {
  if (process.env.CLAUDE_BIN) results.claude = await claude(process.env.CLAUDE_BIN);
  if (process.env.CODEX_BIN) results.codex = await codex(process.env.CODEX_BIN);
} finally { rmSync(work, { recursive: true, force: true }); }
if (!Object.keys(results).length) throw new Error("Set CLAUDE_BIN and/or CODEX_BIN");
for (const [host, sha] of Object.entries(results)) console.log(host + ": " + (sha ?? "render_prompt was not called") + (sha === expected ? " (matches golden)" : ""));
if (Object.values(results).some(sha => sha !== expected)) process.exitCode = 1;
