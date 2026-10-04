// Publishes a working template into the immutable registry: npm run publish-template -- templates/<file>.yaml
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, contentHash, normalizeText, snapshotPath, validateTemplate, type RegistryIndex } from "../packages/core/src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = join(root, "registry");
const file = process.argv[2];
if (!file || !/\.ya?ml$/.test(file)) throw new Error("Usage: publish-template <template.yaml>");
const content = readFileSync(resolve(file), "utf8");
const result = validateTemplate(content, "yaml");
if (!result.valid || !result.definition) {
  console.error(JSON.stringify(result.errors, null, 2));
  throw new Error("Template is invalid; fix errors before publishing");
}
const { id, version } = result.definition.template;
const indexPath = join(registry, "index.json");
const index: RegistryIndex = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : { registry_version: 1, templates: [] };
const target = join(registry, ...snapshotPath(id, version).split("/"));
if (existsSync(target) || index.templates.some(t => t.id === id && t.version === version)) {
  throw new Error(id + "@" + version + " is already published; bump template.version instead of overwriting");
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, normalizeText(content));
index.templates.push({ id, version, content_sha256: contentHash(result.definition) });
index.templates.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : compareVersions(a.version, b.version));
writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
console.log("Published " + id + "@" + version);
