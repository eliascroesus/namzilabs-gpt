const sensitiveKey = /authorization|cookie|token|secret|password|api[-_]?key|rawBody|payload/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactSensitive(child),
    ]),
  );
}
