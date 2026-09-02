/**
 * The fleet: N real Actors, each with its own VaultysId, driven against a live control plane.
 *
 * These are **not** mocks. Every member is a `packages/sdk` `ActorRuntime`, so every connection is
 * a genuine Challenger handshake against a real DID, every certificate is really issued and really
 * verified, and every status check is a signed round trip. That is the whole value: a simulator
 * that faked the protocol would prove the simulator works.
 */

import path from "node:path";
import fs from "node:fs";
import { ActorRuntime } from "@vaultysclaw/sdk";
import type { SimConfig } from "./config.js";
import { PERSONAS, type SimKind } from "./personas.js";
import { Metrics } from "./metrics.js";

/** Where a member is in its lifecycle. The fleet owns this; the metrics derive counts from it. */
export type MemberState =
  | "connecting"
  | "pendingApproval"
  | "connected"
  | "certified"
  | "disconnected";

export interface FleetMember {
  index: number;
  name: string;
  kind: SimKind;
  runtime: ActorRuntime;
  timers: NodeJS.Timeout[];
  state: MemberState;
}

/**
 * Identities live on disk, one directory per member.
 *
 * Persisting them is not incidental — it is what makes a rerun *mean* something. A fresh keypair
 * every run would flood the control plane with new PendingRegistrations and make the second run
 * indistinguishable from the first, so approvals could never be demonstrated. With stable DIDs,
 * run → approve → run again shows the same fleet coming back certified.
 */
function memberPaths(cfg: SimConfig, index: number, kind: SimKind) {
  const dir = path.join(cfg.dataDir, `${kind}-${String(index).padStart(5, "0")}`);
  return {
    dir,
    identityPath: path.join(dir, "identity"),
    capabilityStatePath: path.join(dir, "capabilities.json"),
  };
}

export class Fleet {
  private readonly members: FleetMember[] = [];
  private stopped = false;

  constructor(
    private readonly cfg: SimConfig,
    private readonly metrics: Metrics
  ) {
    // The metrics object asks the fleet for lifecycle state rather than being told about every
    // transition — see the note on `Snapshot`.
    metrics.lifecycle = () => this.lifecycleCounts();
  }

  /** Count members by state. O(n) per render, which at 7,000 members is nothing. */
  private lifecycleCounts() {
    const counts = {
      connecting: 0,
      pendingApproval: 0,
      connected: 0,
      certified: 0,
      disconnected: 0,
    };
    for (const m of this.members) counts[m.state]++;
    return counts;
  }

  get size(): number {
    return this.members.length;
  }

  /**
   * Bring the fleet up, rate-limited.
   *
   * The ramp exists because a stampede measures the wrong thing: 7,000 simultaneous TCP+WebSocket
   * upgrades will exhaust file descriptors and the accept backlog long before the control plane's
   * actual handshake capacity is reached, and the resulting failures look like server bugs. Ramping
   * finds the sustainable rate instead of the connect-storm cliff.
   */
  async spawnAll(kinds: SimKind[]): Promise<void> {
    const perTick = Math.max(1, this.cfg.ratePerSecond);
    let launched = 0;

    for (let i = 0; i < kinds.length && !this.stopped; i++) {
      this.spawnOne(i, kinds[i]);
      launched++;

      if (launched % perTick === 0) {
        await sleep(1000);
      }
      // Keep the in-flight handshake count bounded even inside a single tick.
      while (!this.stopped && this.inFlight() >= this.cfg.maxInFlight) {
        await sleep(50);
      }
    }
  }

  private inFlight(): number {
    return this.lifecycleCounts().connecting;
  }

  private spawnOne(index: number, kind: SimKind): void {
    const persona = PERSONAS[kind];
    const { dir, identityPath, capabilityStatePath } = memberPaths(this.cfg, index, kind);
    fs.mkdirSync(dir, { recursive: true });

    const name = `${kind}-${String(index).padStart(5, "0")}`;
    const startedAt = Date.now();
    let handshakeRecorded = false;

    const runtime = new ActorRuntime({
      name,
      kind,
      controlPlaneWsUrl: this.cfg.wsUrl,
      identityPath,
      capabilityStatePath,
      requestedCapabilities: persona.requestedCapabilities,
      // The fleet's own heartbeat is the SDK's; spreading it stops 7,000 pings landing in the
      // same 30-second slot and producing a sawtooth that looks like a server problem.
      heartbeatIntervalMs: 30_000 + Math.floor(Math.random() * 10_000),
      reconnectBaseDelayMs: 2_000,
      reconnectMaxDelayMs: 60_000,
      // Silence per-actor logging: at fleet scale it is noise and a bottleneck. Errors are
      // aggregated through `metrics` instead.
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });

    const member: FleetMember = { index, name, kind, runtime, timers: [], state: "connecting" };

    this.metrics.counts.spawned++;

    runtime.on("status", (status) => {
      if (status === "connected") {
        if (!handshakeRecorded) {
          this.metrics.recordHandshake(Date.now() - startedAt);
          handshakeRecorded = true;
        } else if (member.state === "disconnected") {
          this.metrics.counts.reconnects++;
        }
        // Certified covers two cases, and missing the second understated every rerun by thousands:
        //  - the member holds a certificate this process saw issued (`certificate` fired), or
        //  - it *restored* one from `capabilityStatePath` on startup, in which case no event ever
        //    fires because nothing was issued — the grant was collected on an earlier run.
        // Reconnecting also never un-certifies a member; showing it drop back to "connected" would
        // make a healthy fleet look like it was losing grants.
        member.state =
          member.state === "certified" || member.runtime.getCapabilities().length > 0
            ? "certified"
            : "connected";
      } else if (status === "pending_approval") {
        // Reaching "pending approval" means the Challenger exchange *completed* — the DID is
        // cryptographically proven and only an admin decision is outstanding. That is the same
        // handshake the "connected" branch times, so it counts: a first run against a fresh
        // control plane is all pending registrations, and not recording here reported p50 = 0 ms
        // for a run that did thousands of real handshakes.
        if (!handshakeRecorded) {
          this.metrics.recordHandshake(Date.now() - startedAt);
          handshakeRecorded = true;
        }
        member.state = "pendingApproval";
      } else if (status === "disconnected") {
        member.state = "disconnected";
      }
    });

    runtime.on("certificate", () => {
      member.state = "certified";
    });

    // The event the staple loop emits when the control plane withdraws something — a revocation, or
    // a custom capability deleted from the registry. Counting it is how a mass revoke becomes
    // visible across the fleet rather than an invisible per-actor detail.
    runtime.on("capabilities", (caps) => {
      if (caps.length === 0) this.metrics.counts.capabilitiesWithdrawn++;
    });

    runtime.on("error", (err) => {
      this.metrics.recordError(Metrics.describe(err));
      this.metrics.counts.failed++;
    });

    void runtime.start().catch((err) => {
      this.metrics.recordError(Metrics.describe(err));
      this.metrics.counts.failed++;
    });

    // An explicit --status-refresh overrides the persona: the point of that flag is to make the
    // whole fleet re-check on a human timescale, so honouring per-kind cadences would defeat it.
    const statusRefreshMs =
      this.cfg.statusRefreshMs > 0 ? this.cfg.statusRefreshMs : persona.statusRefreshMs;
    this.scheduleActivity(member, statusRefreshMs, persona.telemetryMs, persona.churnPerMinute);
    this.members.push(member);
  }

  /** Per-member timers: status refreshes, telemetry, and churn. All jittered — see `jitter`. */
  private scheduleActivity(
    member: FleetMember,
    statusRefreshMs: number | null,
    telemetryMs: number | null,
    churnPerMinute: number
  ): void {
    if (statusRefreshMs !== null) {
      member.timers.push(
        setInterval(
          () => {
            void member.runtime.refreshCertStatus().then((ok) => {
              if (ok) this.metrics.counts.statusChecks++;
            });
          },
          jitter(statusRefreshMs)
        )
      );
    }

    if (telemetryMs !== null) {
      member.timers.push(
        setInterval(() => {
          try {
            // Only meaningful once the sensor actually holds the capability it gates on — sending
            // regardless would simulate a client that ignores its own grant, which is not the
            // behaviour under test.
            if (!member.runtime.hasCapability("process_read")) return;
            member.runtime.send("sensor_telemetry", syntheticTelemetry(member));
            this.metrics.counts.telemetrySent++;
          } catch {
            // Not connected right now; the next tick will find it reconnected.
          }
        }, jitter(telemetryMs))
      );
    }

    if (churnPerMinute > 0) {
      // Evaluated once a minute rather than scheduled as a one-shot, so an Actor can churn more
      // than once over a long run.
      member.timers.push(
        setInterval(() => {
          if (Math.random() < churnPerMinute) member.runtime.dropConnection();
        }, jitter(60_000))
      );
    }
  }

  /**
   * Cycle the connections of members that actually need one.
   *
   * Used after a bulk approval: a grant is delivered on the Actor's *next* connection
   * (`deliverApprovedCapabilities` runs from the reconnect branch of the handshake), so this is
   * what turns "approved in the database" into a real certificate minted over a live exchange.
   *
   * Two things it deliberately does **not** do, both learned from a 7,000-Actor run that produced
   * 11,846 `ETIMEDOUT`s:
   *
   * 1. **It does not cycle everyone.** Only members still awaiting approval have anything to
   *    collect; an already-certified member reconnecting is pure load. On a rerun against a fleet
   *    that is mostly certified already, this is the difference between a handshake storm and
   *    almost no work at all.
   * 2. **It does not reuse the ramp rate.** The ramp rate is what the *simulator* can start; the
   *    reconnect rate has to respect what the control plane can *finish*, and a reconnect wave
   *    lands on a server still working through the tail of the original ramp. Defaulting it to half
   *    the ramp rate keeps the two waves from summing past the handshake ceiling.
   */
  reconnectPending(): number {
    const needsGrant = this.members.filter((m) => m.state === "pendingApproval");
    const perSecond = Math.max(1, Math.floor(this.cfg.reconnectRatePerSecond));

    needsGrant.forEach((m, i) => {
      const delay = Math.floor((i / perSecond) * 1000);
      setTimeout(() => {
        if (!this.stopped) m.runtime.dropConnection();
      }, delay).unref?.();
    });

    return needsGrant.length;
  }

  stop(): void {
    this.stopped = true;
    for (const m of this.members) {
      for (const t of m.timers) clearInterval(t);
      m.runtime.stop();
    }
  }
}

/** ±25%, so timers spread instead of forming a thundering herd on a round interval. */
function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** A plausible workload observation, shaped like `vaultysclaw-sensor`'s real telemetry. */
function syntheticTelemetry(member: FleetMember) {
  const workloads = ["claude", "ollama", "lm-studio", "mcp-server", "codex"];
  const pick = workloads[member.index % workloads.length];
  return {
    deviceDid: member.runtime.getDid(),
    observedAt: new Date().toISOString(),
    workloads: [
      {
        fingerprint: `${member.name}-${pick}`,
        processName: pick,
        classification: pick === "mcp-server" ? "mcp_server" : "ai_workload",
        provider: pick === "ollama" || pick === "lm-studio" ? "local" : "anthropic",
        confidence: 0.9,
      },
    ],
  };
}
