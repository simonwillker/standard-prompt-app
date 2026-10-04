import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPrompt, validateTemplate } from "../../core/src/index.js";
import { loadRegistry } from "../../core/src/node.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const registryDir = process.env.SPT_REGISTRY_DIR ?? resolve(root, "registry");
const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const format = (path: string) => extname(path) === ".json" ? "json" as const : "yaml" as const;
const usage = "Commands: list [query], validate <file>, render <id> --version <version> --vars-file <json>, render --template <file> --vars-file <json>";
try {
  if (command === "list") {
    console.log(JSON.stringify(loadRegistry(registryDir).list(args[0]), null, 2));
  } else if (command === "validate") {
    if (!args[0]) throw new Error("Usage: validate <file>");
    const result = validateTemplate(await readFile(resolve(args[0]), "utf8"), format(args[0]));
    console.log(JSON.stringify({ valid: result.valid, errors: result.errors, warnings: result.warnings }, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else if (command === "render") {
    const file = flag("--template"), variablesFile = flag("--vars-file"), version = flag("--version");
    const id = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
    if (!variablesFile || (file ? id || version : !id || !version)) throw new Error(usage);
    const variables = JSON.parse(await readFile(resolve(variablesFile), "utf8"));
    const result = file
      ? renderPrompt({ variables, template_source: { format: format(file), content: await readFile(resolve(file), "utf8") } })
      : renderPrompt({ variables, template_ref: { id: id!, version: version! } }, loadRegistry(registryDir));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else throw new Error(usage);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
}
