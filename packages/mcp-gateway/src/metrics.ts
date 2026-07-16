/**
 * In-memory metrics for MCP tool calls — call counts, error counts, and
 * latency percentiles. Reset on process restart; not persisted.
 */

interface ToolStats {
  calls: number;
  errors: number;
  durationsMs: number[];
}

const MAX_SAMPLES = 500;

export class GatewayMetrics {
  private readonly stats = new Map<string, ToolStats>();
  private readonly startedAt = Date.now();

  record(tool: string, durationMs: number, ok: boolean): void {
    let s = this.stats.get(tool);
    if (!s) {
      s = { calls: 0, errors: 0, durationsMs: [] };
      this.stats.set(tool, s);
    }
    s.calls++;
    if (!ok) s.errors++;
    s.durationsMs.push(durationMs);
    if (s.durationsMs.length > MAX_SAMPLES) s.durationsMs.shift();
  }

  snapshot(): {
    uptimeSeconds: number;
    tools: Record<
      string,
      { calls: number; errors: number; p50Ms: number; p95Ms: number }
    >;
  } {
    const tools: Record<
      string,
      { calls: number; errors: number; p50Ms: number; p95Ms: number }
    > = {};
    for (const [tool, s] of this.stats) {
      const sorted = [...s.durationsMs].sort((a, b) => a - b);
      tools[tool] = {
        calls: s.calls,
        errors: s.errors,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
      };
    }
    return { uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000), tools };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return Math.round(sorted[idx]);
}
