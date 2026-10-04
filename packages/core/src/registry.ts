import { canonicalJSON, hash } from "./serialize.js";
import { renderTemplate, validateTemplate } from "./index.js";
import type { Issue, Template } from "./types.js";

// Published versions are immutable snapshots; ids and versions never become free-form file paths.
export const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export type RegistryIndexEntry = { id: string; version: string; content_sha256: string };
export type RegistryIndex = { registry_version: 1; templates: RegistryIndexEntry[] };
export type RegistryEntry = RegistryIndexEntry & { content: string; definition: Template };
export type TemplateSummary = Pick<Template["template"], "id" | "version" | "name" | "category" | "tags" | "description">;

const issue = (code: string, path = "", message = code): Issue => ({ code, path, message });
const fail = (message: string): never => { throw new Error("REGISTRY_INVALID: " + message); };

/** Relative snapshot path for a published version, e.g. `meeting-minutes/1.0.0.yaml`. */
export function snapshotPath(id: string, version: string): string {
  if (!ID_PATTERN.test(id) || !VERSION_PATTERN.test(version)) fail("invalid id or version");
  return id + "/" + version + ".yaml";
}

/** Content hash of a parsed template, per spec 6.1. */
export const contentHash = (definition: Template): string => hash(canonicalJSON(definition));

export function compareVersions(a: string, b: string): number {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export class TemplateRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /** Builds a registry from the index and a reader; every snapshot must validate and match its recorded hash. */
  constructor(index: unknown, read: (relativePath: string) => string) {
    const parsed = index as RegistryIndex;
    if (!parsed || parsed.registry_version !== 1 || !Array.isArray(parsed.templates)) fail("index format");
    for (const record of parsed.templates) {
      const { id, version, content_sha256 } = record ?? {};
      if (typeof id !== "string" || typeof version !== "string" || typeof content_sha256 !== "string") fail("index entry");
      const key = id + "@" + version;
      if (this.entries.has(key)) fail("duplicate entry " + key);
      const content = read(snapshotPath(id, version));
      const result = validateTemplate(content, "yaml");
      if (!result.valid || !result.definition) fail("snapshot does not validate: " + key);
      const definition = result.definition!;
      if (definition.template.id !== id || definition.template.version !== version) fail("snapshot id/version mismatch: " + key);
      if (contentHash(definition) !== content_sha256) fail("snapshot hash mismatch: " + key);
      this.entries.set(key, { id, version, content_sha256, content, definition });
    }
  }

  get(id: string, version: string): RegistryEntry | undefined {
    return this.entries.get(id + "@" + version);
  }

  /** All published id/version pairs, sorted by id then ascending version. Query matches id, name, category, tags or description. */
  list(query?: string): TemplateSummary[] {
    const needle = query?.trim().toLowerCase();
    return [...this.entries.values()]
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : compareVersions(a.version, b.version))
      .map(({ definition: { template: t } }) => ({ id: t.id, version: t.version, name: t.name, category: t.category, tags: t.tags, description: t.description }))
      .filter(t => !needle || [t.id, t.name, t.category, t.description, ...t.tags].some(s => s.toLowerCase().includes(needle)));
  }
}

export type TemplateRef = { id: string; version: string };
export type TemplateSource = { format: "yaml" | "json"; content: string };
export type RenderRequest = { variables?: Record<string, unknown>; template_ref?: TemplateRef; template_source?: TemplateSource };

/** render_prompt contract (spec 7.2): exactly one of template_ref / template_source. */
export function renderPrompt(request: RenderRequest, registry?: TemplateRegistry) {
  const variables = request.variables ?? {};
  const hasRef = request.template_ref !== undefined, hasSource = request.template_source !== undefined;
  if (hasRef === hasSource) return { ok: false as const, errors: [issue("INVALID_TEMPLATE_SOURCE", "", "必须且只能提供 template_ref 或 template_source 之一")], warnings: [] as Issue[] };
  if (hasRef) {
    const { id, version } = request.template_ref!;
    const entry = registry?.get(id, version);
    if (!entry) return { ok: false as const, errors: [issue("TEMPLATE_NOT_FOUND", "/template_ref", "未找到已发布的模板版本")], warnings: [] as Issue[] };
    return renderTemplate(entry.content, "yaml", variables, "registry");
  }
  const { format, content } = request.template_source!;
  if ((format !== "yaml" && format !== "json") || typeof content !== "string") {
    return { ok: false as const, errors: [issue("INVALID_TEMPLATE_SOURCE", "/template_source", "format 必须为 yaml 或 json，content 必须为字符串")], warnings: [] as Issue[] };
  }
  return renderTemplate(content, format, variables, "provided");
}

/** get_template contract (spec 7.2). */
export function getTemplate(registry: TemplateRegistry, id: string, version: string) {
  const entry = registry.get(id, version);
  if (!entry) return { ok: false as const, errors: [issue("TEMPLATE_NOT_FOUND", "", "未找到已发布的模板版本")] };
  return { ok: true as const, id, version, content_sha256: entry.content_sha256, variables: entry.definition.prompt.variables, definition: entry.definition };
}
