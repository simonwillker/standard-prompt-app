import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTemplate, rendererVersion, renderPrompt, validateTemplate, type TemplateRegistry } from "../../core/src/index.js";

export const serverName = "standard-prompt";

// Every tool returns the spec 7.2 contract object both as structured content and as JSON text,
// so hosts that only read text content see exactly the same values.
const reply = (value: Record<string, unknown>, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
  ...(isError ? { isError: true } : {})
});

export function createServer(registry: TemplateRegistry): McpServer {
  const server = new McpServer({ name: serverName, version: rendererVersion });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool("list_templates", {
    title: "列出模板",
    description: "列出已发布的标准 Prompt 模板（id、version、名称、分类、标签、描述）。query 按 id、名称、分类、标签或描述做不区分大小写的部分匹配。",
    inputSchema: { query: z.string().optional().describe("可选的关键字") },
    annotations: readOnly
  }, ({ query }) => reply({ templates: registry.list(query) }));

  server.registerTool("get_template", {
    title: "读取模板",
    description: "按 id 和精确 version 读取已发布模板，返回完整定义、变量列表和 content_sha256。用变量列表向用户收集变量值。",
    inputSchema: { id: z.string(), version: z.string().describe("精确版本，例如 1.0.0") },
    annotations: readOnly
  }, ({ id, version }) => {
    const result = getTemplate(registry, id, version);
    return reply(result, !result.ok);
  });

  server.registerTool("validate_template", {
    title: "校验模板",
    description: "校验一份 YAML 或 JSON 模板，返回 valid、errors、warnings（每项含 code、path、message）。不保存模板。",
    inputSchema: { format: z.enum(["yaml", "json"]), content: z.string() },
    annotations: readOnly
  }, ({ format, content }) => {
    const { valid, errors, warnings } = validateTemplate(content, format);
    return reply({ valid, errors, warnings });
  });

  server.registerTool("render_prompt", {
    title: "生成标准 Prompt",
    description: "用变量值渲染标准 Prompt。template_ref（已发布 id + 精确 version）与 template_source（直接传入 YAML/JSON）二选一。" +
      "成功时必须把返回的 prompt 原样展示给用户，不得改写。",
    inputSchema: {
      template_ref: z.object({ id: z.string(), version: z.string() }).optional(),
      template_source: z.object({ format: z.enum(["yaml", "json"]), content: z.string() }).optional(),
      variables: z.record(z.string(), z.unknown()).optional().describe("变量 key → 值；未填写的变量可省略")
    },
    annotations: readOnly
  }, request => {
    const result = renderPrompt(request, registry);
    return reply(result, !result.ok);
  });

  return server;
}
