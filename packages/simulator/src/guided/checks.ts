import type { PermissionDecision, RequestedAction } from "@vaultysclaw/sdk";

export const STEPS = [
  {
    title: "Discover two agents",
    instruction:
      "Start the walkthrough. Two new agents will request read-only access in separate workspaces.",
    outcome: "Both requests are visible and neither agent has access.",
  },
  {
    title: "Approve narrow access",
    instruction:
      "Open Pending approvals in the console. Approve both guided agents with file_read only, then verify.",
    outcome: "Both agents hold usable, signed read-only grants.",
  },
  {
    title: "Prove the boundary",
    instruction:
      "Run the checks. Finance will read its sample invoice, then attempt a write. Research will read its own sample.",
    outcome:
      "Reads succeed; the ungranted write is denied before the file operation.",
  },
  {
    title: "Contain the incident",
    instruction:
      "Open the Finance workspace’s Settings. Arm its kill switch with a reason and the console’s ARM confirmation. Allow a few seconds for status propagation, then verify.",
    outcome: "Finance loses access while Research continues working.",
  },
  {
    title: "Recover safely",
    instruction:
      "Disarm Finance’s kill switch in the console. Allow a few seconds for reconnection and status propagation, then verify.",
    outcome: "Both agents can read again, using the existing certificates.",
  },
  {
    title: "Review the evidence",
    instruction:
      "Download the run report and review the console audit log. Restart creates new identities and keeps this run’s history.",
    outcome:
      "A report of measured decisions, certificate references and timestamps.",
  },
] as const;

export interface Observation {
  actor: string;
  action: string;
  allowed: boolean;
  executed: boolean;
  reason?: string;
  certificateId?: string;
}

/** The effect is invoked only after the SDK allows the action. A decision is not itself execution. */
export async function guardedOperation(
  actor: string,
  check: (action: RequestedAction) => Promise<PermissionDecision>,
  action: RequestedAction,
  effect: () => Promise<unknown>
): Promise<Observation> {
  const decision = await check(action);
  if (decision.allowed) await effect();
  return {
    actor,
    action: action.capability,
    allowed: decision.allowed,
    executed: decision.allowed,
    reason: decision.reason,
    certificateId: decision.grantingCertId,
  };
}

export function expectDecisions(
  observations: Observation[],
  expected: boolean[]
): void {
  if (
    observations.length !== expected.length ||
    observations.some(
      (o, i) => o.allowed !== expected[i] || o.executed !== expected[i]
    )
  ) {
    throw new Error(
      "The observed operations did not match this step. Review the results and console configuration, then retry. The walkthrough has not advanced."
    );
  }
}

export function assertDemoTarget(
  databaseUrl: string | undefined,
  wsUrl: string
): void {
  let db: URL;
  let ws: URL;
  try {
    db = new URL(databaseUrl ?? "missing:");
    ws = new URL(wsUrl);
  } catch {
    throw new Error(
      "Missing or invalid simulator coordinates. Start the guided demo with pnpm demo."
    );
  }
  if (
    !["postgresql:", "postgres:"].includes(db.protocol) ||
    db.hostname !== "localhost" ||
    db.port !== "5434" ||
    db.pathname !== "/vaultysclaw" ||
    db.search ||
    db.hash ||
    ws.protocol !== "ws:" ||
    ws.hostname !== "localhost" ||
    ws.port !== "8083" ||
    ws.pathname !== "/" ||
    ws.search ||
    ws.hash ||
    ws.username ||
    ws.password
  ) {
    throw new Error(
      "The guided demo only uses the isolated simulator: localhost:5434/vaultysclaw and ws://localhost:8083. Run it with pnpm demo."
    );
  }
}
