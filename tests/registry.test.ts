import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTemplate, renderPrompt, snapshotPath, TemplateRegistry, type RegistryIndex } from "../packages/core/src/index.js";
import { loadRegistry } from "../packages/core/src/node.js";

const registryDir = fileURLToPath(new URL("../registry/", import.meta.url));
const index: RegistryIndex = JSON.parse(readFileSync(registryDir + "index.json", "utf8"));
const read = (path: string) => readFileSync(registryDir + path, "utf8");
const registry = loadRegistry(registryDir);

test("registry lists every published version and filters by keyword", () => {
  assert.deepEqual(registry.list().map(t => t.id + "@" + t.version), ["email-reply@1.0.0", "meeting-minutes@1.0.0", "requirement-extract@1.0.0"]);
  assert.deepEqual(registry.list("会议纪要").map(t => t.id), ["meeting-minutes"]);
  assert.deepEqual(registry.list("EMAIL").map(t => t.id), ["email-reply"]);
  assert.deepEqual(registry.list("nothing-matches"), []);
});

test("registry rejects tampered, mismatched, duplicate and path-like entries", () => {
  const clone = () => JSON.parse(JSON.stringify(index)) as RegistryIndex;
  const tampered = clone(); tampered.templates[0].content_sha256 = "0".repeat(64);
  assert.throws(() => new TemplateRegistry(tampered, read), /hash mismatch/);
  const edited = (path: string) => read(path).replace("严谨的业务文书助手", "改过的助手");
  assert.throws(() => new TemplateRegistry(index, edited), /hash mismatch/);
  const duplicate = clone(); duplicate.templates.push(duplicate.templates[0]);
  assert.throws(() => new TemplateRegistry(duplicate, read), /duplicate/);
  const wrongVersion = clone(); wrongVersion.templates[0].version = "1.0.1";
  assert.throws(() => new TemplateRegistry(wrongVersion, path => read(path.replace("1.0.1", "1.0.0"))), /id\/version mismatch/);
  for (const [id, version] of [["../etc", "1.0.0"], ["a", "../1.0.0"], ["A", "1.0.0"], ["a", "1.0"], ["a", "01.0.0"]]) {
    assert.throws(() => snapshotPath(id, version), /REGISTRY_INVALID/);
  }
  assert.throws(() => new TemplateRegistry({ registry_version: 2, templates: [] }, read), /index format/);
});

test("render_prompt reads exact published versions and reports source", () => {
  const variables = { content: "王明负责下周一发布。" };
  const fromRegistry = renderPrompt({ template_ref: { id: "meeting-minutes", version: "1.0.0" }, variables }, registry);
  assert.ok(fromRegistry.ok);
  if (!fromRegistry.ok) return;
  assert.equal(fromRegistry.template.source, "registry");
  assert.equal(fromRegistry.template.content_sha256, index.templates.find(t => t.id === "meeting-minutes")!.content_sha256);
  const provided = renderPrompt({ template_source: { format: "yaml", content: read(snapshotPath("meeting-minutes", "1.0.0")) }, variables });
  assert.ok(provided.ok);
  if (!provided.ok) return;
  assert.equal(provided.template.source, "provided");
  assert.equal(provided.prompt_sha256, fromRegistry.prompt_sha256);
  assert.equal(provided.template.content_sha256, fromRegistry.template.content_sha256);
});

test("render_prompt source and lookup errors", () => {
  const codes = (r: { ok: boolean; errors?: { code: string }[] }) => r.ok ? [] : r.errors!.map(e => e.code);
  assert.deepEqual(codes(renderPrompt({ variables: {} }, registry)), ["INVALID_TEMPLATE_SOURCE"]);
  assert.deepEqual(codes(renderPrompt({ template_source: { format: "toml" as "yaml", content: "" } })), ["INVALID_TEMPLATE_SOURCE"]);
  assert.deepEqual(codes(renderPrompt({ template_ref: { id: "meeting-minutes", version: "1.0.0" } })), ["TEMPLATE_NOT_FOUND"]);
  assert.deepEqual(codes(renderPrompt({ template_ref: { id: "meeting-minutes", version: "1.0" } }, registry)), ["TEMPLATE_NOT_FOUND"]);
  assert.deepEqual(codes(renderPrompt({ template_source: { format: "yaml", content: "a: [" } })), ["PARSE_ERROR"]);
  assert.deepEqual([...new Set(codes(renderPrompt({ template_source: { format: "json", content: "{}" } })))], ["SCHEMA_INVALID"]);
});

test("get_template returns definition, variables and content hash", () => {
  const found = getTemplate(registry, "email-reply", "1.0.0");
  assert.ok(found.ok);
  if (found.ok) {
    assert.deepEqual(found.variables.map(v => v.key), ["content", "output_language"]);
    assert.equal(found.definition.template.id, "email-reply");
    assert.match(found.content_sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(getTemplate(registry, "email-reply", "9.9.9"), { ok: false, errors: [{ code: "TEMPLATE_NOT_FOUND", path: "", message: "未找到已发布的模板版本" }] });
});
