export type InferredField = {
  path: string;
  type: "null" | "boolean" | "number" | "string" | "date" | "array" | "object";
  nullable: boolean;
};

function inferType(value: unknown): InferredField["type"] {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return "date";
  return "string";
}

export function inferFields(records: Record<string, unknown>[]): InferredField[] {
  const fields = new Map<string, InferredField>();
  const walk = (value: unknown, path: string): void => {
    const type = inferType(value);
    if (path) {
      const existing = fields.get(path);
      fields.set(path, {
        path,
        type: existing?.type === "null" ? type : (existing?.type ?? type),
        nullable: existing?.nullable === true || type === "null",
      });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  for (const record of records) walk(record, "");
  return [...fields.values()].sort((a, b) => a.path.localeCompare(b.path));
}
