/**
 * The gate every tool call passes through before it touches anything.
 *
 * Three layers, in order — the same order as the sensor's supervisor (`decide.go`):
 *
 *   1. **Floor** — a local, deny-only list. Resolved paths outside the workspace and secrets
 *      inside it are refused whatever the certificate says, because a grant written too wide
 *      must not reach `~/.ssh` or this Actor's own identity.
 *   2. **Certificate** — `checkPermission`, which refreshes the signed status when it is stale
 *      and denies when the control plane cannot vouch for it under `failClosed`. A revocation,
 *      a deleted custom capability or an armed kill switch lands here.
 *   3. **Human** — consequential capabilities wait for an explicit yes on the terminal.
 *
 * Every decision, allowed or not, is appended to a JSONL trace: the agent's own audit log.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import type { ActorRuntime, AgentCapability } from "../../src/index.js";

export interface GateRequest {
  tool: string;
  capability: AgentCapability;
  /** URI-shaped, as `CertScope` matches it: `file:///abs/path`, `exec://pnpm`. */
  resource: string;
  /** Absolute filesystem path behind a `file://` resource — what the floor checks. */
  fsPath?: string;
  /** Shown to the human when approval is required. */
  summary: string;
}

export type GateDecision =
  | { allowed: true; grantingCertId?: string }
  | { allowed: false; layer: "floor" | "certificate" | "human" | "kill_switch"; reason: string };

/** Path segments nobody decided an agent may touch, whatever its scope says. */
export const FLOOR_DIRS = [".ssh", ".aws", ".gnupg", ".vaultysclaw", ".git"];
/** The same files as `FLOOR_BASENAMES`, as globs for tools (grep) that take them. */
export const FLOOR_FILE_GLOBS = [".env", ".env.*", "identity.secret", "*.pem", "*.key"];
const FLOOR_SEGMENTS = new Set(FLOOR_DIRS);
const FLOOR_BASENAMES = [/^\.env(\..*)?$/, /^identity\.secret$/, /\.pem$/, /\.key$/];

export class Guard {
  private killed = false;

  constructor(
    private readonly actor: ActorRuntime,
    private readonly opts: {
      workspaceRoot: string;
      tracePath: string;
      /** Capabilities that need a terminal "yes" on top of the certificate. */
      confirm: ReadonlySet<string>;
    }
  ) {
    fs.mkdirSync(path.dirname(opts.tracePath), { recursive: true });
    actor.onCapabilityChange((change) => {
      if (change.reason === "kill_switch") this.killed = true;
      if (change.reason === "status_refresh" && change.current.length > 0) this.killed = false;
    });
  }

  /** True once a kill switch covering this Actor has been received. The loop stops on it. */
  get suspended(): boolean {
    return this.killed;
  }

  async check(req: GateRequest): Promise<GateDecision> {
    const decision = await this.decide(req);
    this.trace(req, decision);
    return decision;
  }

  /** Records something that is not a tool decision (model turns, stops) in the same trace. */
  note(event: string, detail: Record<string, unknown> = {}): void {
    fs.appendFileSync(
      this.opts.tracePath,
      JSON.stringify({ at: new Date().toISOString(), event, ...detail }) + "\n"
    );
  }

  private async decide(req: GateRequest): Promise<GateDecision> {
    if (this.killed) {
      return { allowed: false, layer: "kill_switch", reason: "a kill switch suspended every grant" };
    }

    if (req.fsPath) {
      const floor = this.floor(req.fsPath);
      if (floor) return { allowed: false, layer: "floor", reason: floor };
    }

    const cert = await this.actor.checkPermission({
      capability: req.capability,
      resource: req.resource,
    });
    if (!cert.allowed) {
      return {
        allowed: false,
        layer: "certificate",
        reason: cert.reason ?? `no active certificate grants ${req.capability} on ${req.resource}`,
      };
    }

    if (this.opts.confirm.has(req.capability) && !(await this.ask(req))) {
      return { allowed: false, layer: "human", reason: "the operator declined this action" };
    }

    return { allowed: true, grantingCertId: cert.grantingCertId };
  }

  private floor(fsPath: string): string | null {
    const root = this.opts.workspaceRoot;
    const rel = path.relative(root, fsPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return `${fsPath} is outside the workspace ${root}`;
    }
    const segments = rel.split(path.sep);
    if (segments.some((s) => FLOOR_SEGMENTS.has(s))) {
      return `${rel} is inside a protected directory`;
    }
    const base = segments[segments.length - 1] ?? "";
    if (FLOOR_BASENAMES.some((re) => re.test(base))) {
      return `${rel} looks like a secret`;
    }
    return null;
  }

  private async ask(req: GateRequest): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(`\n[approve?] ${req.summary}\n           (${req.capability} on ${req.resource}) [y/N] `);
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  }

  private trace(req: GateRequest, decision: GateDecision): void {
    this.note("tool_decision", {
      tool: req.tool,
      capability: req.capability,
      resource: req.resource,
      allowed: decision.allowed,
      ...(decision.allowed
        ? { grantingCertId: decision.grantingCertId }
        : { layer: decision.layer, reason: decision.reason }),
    });
  }
}
