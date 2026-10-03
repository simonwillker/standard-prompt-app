export type Issue = { code: string; path: string; message: string };
export type Variable = {
  key: string; label: string; type: "text" | "textarea" | "number" | "boolean" | "date" | "select";
  placement: "input" | "inline"; required: boolean; default?: unknown;
  description?: string; options?: string[]; minimum?: number; maximum?: number;
};
export type Template = {
  schema_version: 1;
  template: { id: string; version: string; name: string; category: string; tags: string[]; description: string };
  prompt: {
    role: string; task: string; input_spec: string; variables: Variable[];
    output: { type: "markdown" | "text"; template: string } | { type: "json"; schema: Record<string, unknown> };
    examples?: { input: string; output: unknown }[]; constraints?: string[];
    missing_info: { policy: "ask" } | { policy: "mark_unknown"; value: string };
  };
  execution?: { api_profile: { enabled: boolean; provider: string | null; model: string | null; temperature: number; max_retries: number } };
  metadata?: { created_at: string; updated_at: string };
};
