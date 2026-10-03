import { createHash } from "node:crypto";

export const rendererVersion = "0.1.0";
export const hash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
export const normalizeText = (text: string): string => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
export const missing = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && /^[ \t\r\n]*$/.test(value));

export function decimal(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("VARIABLE_INVALID");
  if (Object.is(value, -0)) return "0";
  const source = value.toString();
  if (!/e/i.test(source)) return source;
  const [mantissa, exponent] = source.split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const unsigned = mantissa.replace(/^-/, "");
  const [integer, fraction = ""] = unsigned.split(".");
  const digits = integer + fraction;
  const position = integer.length + Number(exponent);
  if (position <= 0) return sign + "0." + "0".repeat(-position) + digits;
  if (position >= digits.length) return sign + digits + "0".repeat(position - digits.length);
  return sign + digits.slice(0, position) + "." + digits.slice(position);
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a, c => c.codePointAt(0)!);
  const y = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

// Emit keys directly: JS object enumeration reorders integer-like keys.
export function canonicalJSON(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error("IMPORT_LIMIT_EXCEEDED");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return decimal(value);
  const pad = "  ".repeat(depth), childPad = pad + "  ";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return "[\n" + value.map(v => childPad + canonicalJSON(v, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  if (typeof value === "object" && value) {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort(compareCodePoints);
    if (!keys.length) return "{}";
    return "{\n" + keys.map(k => childPad + JSON.stringify(k) + ": " + canonicalJSON(object[k], depth + 1)).join(",\n") + "\n" + pad + "}";
  }
  throw new Error("VARIABLE_INVALID");
}
