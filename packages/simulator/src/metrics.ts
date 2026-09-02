/**
 * Fleet counters and the live display.
 *
 * Deliberately counters-and-histogram rather than a log line per actor: at 7,000 actors a
 * per-event log is unreadable and its own bottleneck. What an operator needs is the shape of the
 * fleet right now — how many are through the handshake, how many hold a certificate, what is
 * failing — and the latency distribution at the end.
 */

/**
 * Cumulative counters only.
 *
 * Lifecycle state (connecting / pending / connected / …) is deliberately **not** here: it was, and
 * every transition had to increment one field and decrement another. Miss one edge — an Actor that
 * goes pending twice because it re-registered — and the totals drift without anything failing.
 * Current state is derived by counting members instead (see {@link LifecycleCounts}), which cannot
 * drift because there is nothing to keep in sync.
 */
export interface Snapshot {
  spawned: number;
  failed: number;
  statusChecks: number;
  capabilitiesWithdrawn: number;
  telemetrySent: number;
  reconnects: number;
}

/** Derived by counting members in each state — never incremented. */
export interface LifecycleCounts {
  connecting: number;
  pendingApproval: number;
  connected: number;
  certified: number;
  disconnected: number;
}

export class Metrics {
  readonly counts: Snapshot = {
    spawned: 0,
    failed: 0,
    statusChecks: 0,
    capabilitiesWithdrawn: 0,
    telemetrySent: 0,
    reconnects: 0,
  };

  /** Supplied by the fleet, which owns the members and therefore the truth about their states. */
  lifecycle: () => LifecycleCounts = () => ({
    connecting: 0,
    pendingApproval: 0,
    connected: 0,
    certified: 0,
    disconnected: 0,
  });

  /** Handshake latencies in ms — kept raw; at fleet sizes this is a few hundred KB at most. */
  private readonly handshakeMs: number[] = [];
  /** Error message → how many actors hit it. Grouped because 7,000 copies of one error is one bug. */
  readonly errors = new Map<string, number>();
  readonly startedAt = Date.now();

  recordHandshake(ms: number): void {
    this.handshakeMs.push(ms);
  }

  /**
   * Describe an error usefully even when it has no message.
   *
   * Socket errors routinely arrive with `message: ""` — a 7,000-actor run reported 18,449 errors as
   * a blank line, which is the least useful possible output at the exact moment the output matters.
   * Falling back through code → errno → name → constructor keeps every bucket identifiable.
   */
  static describe(err: unknown): string {
    // `String(undefined)` is the truthy string "undefined", so null-ish throws have to be caught
    // before the generic stringify or they render as a useless literal.
    if (err === null || err === undefined) return "unknown non-Error throw";
    if (!(err instanceof Error)) return String(err) || "unknown non-Error throw";
    const e = err as Error & { code?: string; errno?: number };
    if (err.message) return err.message;
    if (e.code) return `${err.name}: ${e.code}`;
    if (e.errno !== undefined) return `${err.name}: errno ${e.errno}`;
    return `${err.name} (no message)`;
  }

  recordError(message: string): void {
    // Collapse the variable parts so 7,000 distinct-looking errors group into the one real cause.
    const key = message
      .replace(/did:[a-z]+:[0-9a-f]+/gi, "did:…")
      .replace(/\b[0-9a-f]{8,}\b/gi, "…")
      .replace(/\d+/g, "N")
      .slice(0, 120);
    this.errors.set(key, (this.errors.get(key) ?? 0) + 1);
  }

  percentile(p: number): number {
    if (this.handshakeMs.length === 0) return 0;
    const sorted = [...this.handshakeMs].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[idx]);
  }

  get elapsedSeconds(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  /** One-line live status, rewritten in place. */
  renderLine(target: number): string {
    const c = this.counts;
    const l = this.lifecycle();
    const rate = c.spawned / Math.max(1, this.elapsedSeconds);
    return (
      `${bar(l.connected + l.certified, target)} ` +
      `spawned ${c.spawned}/${target} (${rate.toFixed(0)}/s)  ` +
      `connected ${l.connected}  certified ${l.certified}  pending ${l.pendingApproval}  ` +
      `status-checks ${c.statusChecks}  reconnects ${c.reconnects}  failed ${c.failed}`
    );
  }

  renderReport(target: number): string {
    const c = this.counts;
    const l = this.lifecycle();
    const lines = [
      "",
      "─".repeat(78),
      `Fleet report — ${this.elapsedSeconds.toFixed(1)}s elapsed`,
      "─".repeat(78),
      `  requested            ${target}`,
      `  spawned              ${c.spawned}`,
      `  connected (no cert)  ${l.connected}`,
      `  certified            ${l.certified}`,
      `  awaiting approval    ${l.pendingApproval}`,
      `  disconnected         ${l.disconnected}`,
      `  errors               ${c.failed}`,
      "",
      `  handshake p50/p95/p99  ${this.percentile(50)} / ${this.percentile(95)} / ${this.percentile(99)} ms`,
      `  status checks          ${c.statusChecks}`,
      `  capabilities withdrawn ${c.capabilitiesWithdrawn}`,
      `  telemetry reports      ${c.telemetrySent}`,
      `  reconnects             ${c.reconnects}`,
    ];
    if (this.errors.size > 0) {
      lines.push("", "  errors (grouped):");
      const sorted = [...this.errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [msg, n] of sorted) lines.push(`    ${String(n).padStart(6)}  ${msg}`);
    }
    lines.push("─".repeat(78), "");
    return lines.join("\n");
  }
}

function bar(done: number, total: number, width = 24): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return `[${"█".repeat(Math.min(width, filled))}${"·".repeat(Math.max(0, width - filled))}]`;
}
