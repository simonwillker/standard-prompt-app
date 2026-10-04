import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TemplateRegistry } from "./registry.js";

/** Loads published snapshots from `<dir>/index.json` and `<dir>/<id>/<version>.yaml`. */
export function loadRegistry(dir: string): TemplateRegistry {
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  return new TemplateRegistry(index, path => readFileSync(join(dir, ...path.split("/")), "utf8"));
}
