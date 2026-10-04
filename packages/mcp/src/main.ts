import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadRegistry } from "../../core/src/node.js";
import { createServer } from "./server.js";

// Registry lookup: SPT_REGISTRY_DIR, else `registry/` next to the bundled server (plugin layout),
// else the repository's `registry/` (running from source).
const here = dirname(fileURLToPath(import.meta.url));
const registryDir = process.env.SPT_REGISTRY_DIR ??
  [resolve(here, "registry"), resolve(here, "../../../registry")].find(dir => existsSync(resolve(dir, "index.json")));
if (!registryDir) {
  console.error("standard-prompt: registry not found");
  process.exit(1);
}
await createServer(loadRegistry(registryDir)).connect(new StdioServerTransport());
