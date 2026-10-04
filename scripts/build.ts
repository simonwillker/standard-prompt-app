// Builds the single-file MCP server and copies it, with the published registry, into both plugin adapters.
// Usage: npm run build            (writes adapters/*/server)
//        npm run build -- --check (fails if the committed build output is stale)
import { build } from "esbuild";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapters = ["claude", "chatgpt"].map(name => join(root, "adapters", name, "server"));
const check = process.argv.includes("--check");
const staging = mkdtempSync(join(tmpdir(), "spt-build-"));

await build({
  entryPoints: [join(root, "packages/mcp/src/main.ts")],
  outfile: join(staging, "standard-prompt-mcp.mjs"),
  absWorkingDir: root,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none",
  minify: true,
  charset: "utf8",
  logLevel: "warning",
  // Bundled CommonJS dependencies (ajv) call require() for Node built-ins.
  banner: { js: 'import { createRequire as __sptCreateRequire } from "node:module";\nconst require = __sptCreateRequire(import.meta.url);' }
});
cpSync(join(root, "registry"), join(staging, "registry"), { recursive: true });

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});
const snapshot = (dir: string) => new Map(files(dir).map(f => [relative(dir, f).split("\\").join("/"), readFileSync(f, "utf8").replace(/\r\n/g, "\n")]));

if (check) {
  const expected = snapshot(staging);
  const stale = adapters.filter(dir => {
    let actual: Map<string, string>;
    try { actual = snapshot(dir); } catch { return true; }
    return actual.size !== expected.size || [...expected].some(([path, text]) => actual.get(path) !== text);
  });
  rmSync(staging, { recursive: true, force: true });
  if (stale.length) {
    console.error("Stale build output in " + stale.map(d => relative(root, d)).join(", ") + "; run npm run build and commit the result");
    process.exit(1);
  }
  console.log("Build output is up to date");
} else {
  for (const dir of adapters) {
    rmSync(dir, { recursive: true, force: true });
    cpSync(staging, dir, { recursive: true });
  }
  rmSync(staging, { recursive: true, force: true });
  console.log("Built " + adapters.map(d => relative(root, d)).join(", "));
}
