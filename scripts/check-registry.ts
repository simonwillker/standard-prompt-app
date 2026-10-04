// Verifies published versions are immutable: npm run check-registry [-- <base-git-ref>]
// 1. Every snapshot validates and matches its recorded hash (enforced by loadRegistry).
// 2. A working template whose id/version is already published must be identical to the snapshot.
// 3. With a base ref, every entry published there still exists here with the same hash and snapshot bytes.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash, snapshotPath, validateTemplate, type RegistryIndex } from "../packages/core/src/index.js";
import { loadRegistry } from "../packages/core/src/node.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = loadRegistry(join(root, "registry"));
const problems: string[] = [];

for (const name of readdirSync(join(root, "templates")).filter(n => /\.ya?ml$/.test(n)).sort()) {
  const result = validateTemplate(readFileSync(join(root, "templates", name), "utf8"));
  if (!result.valid || !result.definition) { problems.push("templates/" + name + " is invalid"); continue; }
  const { id, version } = result.definition.template;
  const published = registry.get(id, version);
  if (published && published.content_sha256 !== contentHash(result.definition)) {
    problems.push("templates/" + name + " changed but " + id + "@" + version + " is already published; bump template.version");
  }
}

const base = process.argv[2];
if (base) {
  const show = (path: string) => {
    try { return execFileSync("git", ["show", base + ":" + path], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch { return undefined; }
  };
  const baseIndex = show("registry/index.json");
  for (const entry of baseIndex ? (JSON.parse(baseIndex) as RegistryIndex).templates : []) {
    const current = registry.get(entry.id, entry.version);
    const path = snapshotPath(entry.id, entry.version);
    if (!current) problems.push(entry.id + "@" + entry.version + " was removed from the registry");
    else if (current.content_sha256 !== entry.content_sha256 || show("registry/" + path)?.replace(/\r\n?/g, "\n") !== current.content.replace(/\r\n?/g, "\n")) {
      problems.push("registry/" + path + " was modified after publication");
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exitCode = 1;
} else console.log("Registry OK: " + registry.list().length + " published versions" + (base ? ", unchanged since " + base : ""));
