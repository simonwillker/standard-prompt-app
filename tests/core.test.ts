import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import schema from "../packages/core/src/schema.js";
import { canonicalJSON, decimal, hash, importTemplate, normalizeText, renderTemplate, validateTemplate, validDate } from "../packages/core/src/index.js";

const source = await readFile(new URL("../templates/meeting-minutes.yaml", import.meta.url), "utf8");
const parse = () => JSON.parse(source);
test("generated schema matches the canonical schema file", async () => {
  assert.deepEqual(schema, JSON.parse(await readFile(new URL("../schema/template.schema.json", import.meta.url), "utf8")));
});
test("decimal expansion, negative zero and invalid numbers", () => {
  assert.equal(decimal(1e-7), "0.0000001");
  assert.equal(decimal(-1e-7), "-0.0000001");
  assert.equal(decimal(5e-324), "0." + "0".repeat(323) + "5");
  assert.equal(decimal(-0), "0");
  for (const n of [NaN, Infinity, -Infinity, 1e21]) assert.throws(() => decimal(n));
});
test("text preserves indentation and decomposed Unicode", () => {
  assert.equal(normalizeText("\uFEFF  e\u0301\r\n  line\r"), "  e\u0301\n  line\n");
});
test("canonical JSON sorts numeric-like keys lexically and keeps arrays", () => {
  assert.equal(canonicalJSON({ "2": 2, "10": 10 }), '{\n  "10": 10,\n  "2": 2\n}');
  assert.equal(canonicalJSON(["中", false]), '[\n  "中",\n  false\n]');
});
test("dates do not depend on timezone", () => {
  for (const s of ["2024-02-29", "0001-01-01", "9999-12-31"]) assert.ok(validDate(s));
  for (const s of ["2023-02-29", "2024-13-01", "0000-01-01", "2024-01-01T00:00Z"]) assert.equal(validDate(s), false);
});
test("import rejects duplicate keys, aliases, explicit tags, merge keys and large input", () => {
  for (const s of ["a: 1\na: 2", "a: &x 1\nb: *x", "a: !!str x", "a: {<<: {x: 1}}", "---\na: 1\n---\nb: 2"]) assert.throws(() => importTemplate(s, "yaml"));
  assert.throws(() => importTemplate('{"a":1,"a":2}', "json"));
  assert.throws(() => importTemplate("x".repeat(1024 * 1024 + 1), "yaml"), /IMPORT_LIMIT_EXCEEDED/);
});
test("all three templates validate and render", async () => {
  for (const id of ["meeting-minutes", "email-reply", "requirement-extract"]) {
    const content = await readFile(new URL("../templates/" + id + ".yaml", import.meta.url), "utf8");
    assert.equal(validateTemplate(content).valid, true);
    const rendered = renderTemplate(content, "yaml", { content: "王明负责下周一发布。" });
    assert.equal(rendered.ok, true);
  }
});
test("ten renders are identical and hashes include final LF", () => {
  const first = renderTemplate(source, "yaml", { content: "  e\u0301\r\n{{output_language}}\n</input>" });
  assert.ok(first.ok);
  if (!first.ok) return;
  for (let i = 0; i < 10; i++) assert.deepEqual(renderTemplate(source, "yaml", { content: "  e\u0301\r\n{{output_language}}\n</input>" }), first);
  assert.equal(first.prompt_sha256, hash(first.prompt));
  assert.equal(first.prompt.endsWith("\n"), true);
  assert.equal(first.prompt.endsWith("\n\n"), false);
  assert.ok(first.prompt.includes("{{output_language}}"));
  assert.ok(first.prompt.includes("使用 zh-CN 输出"));
  assert.ok(!first.prompt.includes("# 示例"));
});
test("missing, unknown and invalid variables block formal output", () => {
  for (const values of [{}, { content: " " }, { content: "ok", unknown: "x" }, { content: "ok", output_language: "bad" }]) {
    const result = renderTemplate(source, "yaml", values);
    assert.equal(result.ok, false);
    assert.equal("prompt" in result, false);
  }
});
test("optional inputs can be omitted but not all", () => {
  const t = parse();
  t.prompt.variables[0].required = false;
  const result = renderTemplate(JSON.stringify(t), "json", {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some(e => e.code === "NO_INPUT_DATA"));
});
test("cross-block tag collision is refused", () => {
  const t = parse();
  t.prompt.variables.splice(1, 0, { key: "second", label: "第二输入", type: "textarea", placement: "input", required: true });
  const tag = "</input-second-" + hash("hello").slice(0, 12) + ">";
  const result = renderTemplate(JSON.stringify(t), "json", { content: tag, second: "hello" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some(e => e.code === "INPUT_BOUNDARY_COLLISION"));
});
test("semantic validation rejects invalid placement, references and defaults", () => {
  const mutations = [
    (t: any) => { t.prompt.variables[1].type = "text"; },
    (t: any) => { t.prompt.task = "{{missing}}"; },
    (t: any) => { t.prompt.task = "{{content}}"; },
    (t: any) => { t.prompt.variables[1].default = "invalid"; },
    (t: any) => { t.prompt.variables.push({ ...t.prompt.variables[0] }); }
  ];
  for (const mutate of mutations) { const t = parse(); mutate(t); assert.equal(validateTemplate(JSON.stringify(t), "json").valid, false); }
});
test("JSON output rejects external refs", () => {
  const t = parse();
  t.prompt.output = { type: "json", schema: { $schema: "https://json-schema.org/draft/2020-12/schema", $ref: "https://example.com/schema.json" } };
  assert.equal(validateTemplate(JSON.stringify(t), "json").valid, false);
});
