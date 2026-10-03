import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate, validateTemplate } from "../../core/src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const directory = resolve(root, "templates");
const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const format = (path: string) => extname(path) === ".json" ? "json" as const : "yaml" as const;
try {
  if (command === "list") {
    const templates = [];
    for (const name of (await readdir(directory)).filter(n => /\.ya?ml$/.test(n)).sort()) {
      const result = validateTemplate(await readFile(resolve(directory, name), "utf8"));
      if (!result.valid) throw new Error("Invalid bundled template: " + name);
      templates.push(result.definition!.template);
    }
    console.log(JSON.stringify(templates, null, 2));
  } else if (command === "validate") {
    if (!args[0]) throw new Error("Usage: validate <file>");
    const result = validateTemplate(await readFile(resolve(args[0]), "utf8"), format(args[0]));
    console.log(JSON.stringify({ valid: result.valid, errors: result.errors, warnings: result.warnings }, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else if (command === "render") {
    const file = flag("--template"), variables = flag("--vars-file");
    if (!file || !variables) throw new Error("Usage: render --template <file> --vars-file <json>");
    const result = renderTemplate(await readFile(resolve(file), "utf8"), format(file), JSON.parse(await readFile(resolve(variables), "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else throw new Error("Commands: list, validate <file>, render --template <file> --vars-file <json>");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
}
