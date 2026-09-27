/// Attributs de span : jamais de secrets, jetons, emails.
const SENSITIVE = /authorization|cookie|token|password|secret|email|mfa|refresh/i;

export function sanitizeTraceAttributes(
  attrs: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (SENSITIVE.test(key)) continue;
    if (typeof value === 'string' && SENSITIVE.test(value)) continue;
    out[key] = value;
  }
  return out;
}
