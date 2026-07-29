// ── Wizard steps ────────────────────────────────────────────────────────────
// Simpler than the agent wizard: a proxy has no capabilities or workspace to
// pick at approval time (governance lives on its principals, configured
// separately from the proxy's own detail page) — so there's no "approve"
// form step, just Launch -> Waiting, and approval is a single click.

export type WizardStep = "launch" | "waiting";

export const STEPS: { id: WizardStep; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "waiting", label: "Connect" },
];

export const STEP_INDEX: Record<WizardStep, number> = {
  launch: 0,
  waiting: 1,
};

export interface PendingReg {
  id: string;
  agentName: string;
  kind: string;
  createdAt: string;
  status: string;
}
