/**
 * True if `s` is (or contains, for batched requests) a well-formed JSON-RPC
 * 2.0 envelope. Used by the stdout guard in index.ts to distinguish real MCP
 * protocol writes from stray library/log output sharing the same fd.
 */
export function isJsonRpcMessage(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(t);
    const isEnvelope = (m: unknown): boolean =>
      typeof m === "object" && m !== null && (m as Record<string, unknown>).jsonrpc === "2.0";
    return Array.isArray(parsed) ? parsed.some(isEnvelope) : isEnvelope(parsed);
  } catch {
    return false;
  }
}
