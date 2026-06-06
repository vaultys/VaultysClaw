/**
 * ScenarioRunner — triggers demo workflows on a randomised schedule
 * so Mission Control always has live activity.
 *
 * Uses x-api-key header (created by seed-demo.ts) to authenticate
 * REST calls to the control plane.
 */

import { BASE_URL, DEMO_API_KEY } from "./config.js";

interface WorkflowListItem {
  id: string;
  name: string;
  realmId?: string | null;
}

interface WorkflowTriggerResult {
  success: boolean;
  runId?: string;
  workflowId?: string;
}

const DEMO_WORKFLOW_NAMES = [
  "Code Quality Pipeline",
  "Security Threat Assessment",
  "Infrastructure Deploy",
  "Financial Risk Report",
  "Product Analytics",
];

const WORKFLOW_INPUTS: Record<string, string[]> = {
  "Code Quality Pipeline": [
    "Review PR #1247 — refactor payment gateway",
    "Review PR #1249 — add OAuth2 refresh flow",
    "Review PR #1251 — migrate to TypeScript strict",
    "Review PR #1254 — rate limiter middleware",
  ],
  "Security Threat Assessment": [
    "Scan production cluster — scheduled sweep",
    "Scan after dependency update batch",
    "Incident response — anomalous traffic detected",
    "Quarterly security posture assessment",
  ],
  "Infrastructure Deploy": [
    "Deploy api-gateway v3.12.0 to staging",
    "Deploy auth-service v2.4.1 to production",
    "Provision new analytics worker nodes",
    "Deploy canary release — ml-inference v1.9.0",
  ],
  "Financial Risk Report": [
    "Monthly fraud sweep — November 2024",
    "Q4 compliance audit preparation",
    "Regulatory reporting — SOC2 evidence collection",
    "Year-end financial risk summary",
  ],
  "Product Analytics": [
    "Analyse checkout redesign A/B test results",
    "Weekly product metrics digest",
    "Onboarding funnel performance review",
    "Feature adoption report — new dashboard",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class ScenarioRunner {
  private workflows: WorkflowListItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private async apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DEMO_API_KEY,
        ...(opts.headers ?? {}),
      },
    });
  }

  async loadWorkflows(): Promise<void> {
    try {
      const res = await this.apiFetch("/api/workflows?pageSize=50");
      if (!res.ok) {
        console.log(`  [scenario] Warning: couldn't load workflows (${res.status})`);
        return;
      }
      const data = (await res.json()) as { workflows?: WorkflowListItem[] };
      const all: WorkflowListItem[] = data.workflows ?? [];
      // Keep only demo workflows
      this.workflows = all.filter((w) => DEMO_WORKFLOW_NAMES.includes(w.name));
      console.log(`  [scenario] Loaded ${this.workflows.length} demo workflows`);
    } catch (err) {
      console.log(`  [scenario] Warning: ${err}`);
    }
  }

  async triggerWorkflow(workflow: WorkflowListItem): Promise<void> {
    const inputs = WORKFLOW_INPUTS[workflow.name] ?? ["Run demo scenario"];
    const input = pick(inputs);

    try {
      const res = await this.apiFetch(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        body: JSON.stringify({ input }),
      });

      if (res.ok) {
        const data = (await res.json()) as WorkflowTriggerResult;
        const time = new Date().toISOString().slice(11, 19);
        console.log(`  [${time}] [scenario] ▷ "${workflow.name}" (run ${data.runId?.slice(0, 8)}…)`);
      } else {
        const time = new Date().toISOString().slice(11, 19);
        console.log(`  [${time}] [scenario] ✗ "${workflow.name}" — ${res.status}`);
      }
    } catch (err) {
      console.log(`  [scenario] trigger error: ${err}`);
    }
  }

  async scheduleNext(): Promise<void> {
    if (this.stopped) return;
    // 30–90 second intervals; bias toward shorter waits when fleet is large
    const delay = Math.floor(Math.random() * 60_000) + 30_000;
    this.timer = setTimeout(async () => {
      if (this.workflows.length > 0) {
        await this.triggerWorkflow(pick(this.workflows));
      }
      this.scheduleNext();
    }, delay);
  }

  async start(): Promise<void> {
    await this.loadWorkflows();

    if (this.workflows.length === 0) {
      console.log("  [scenario] No demo workflows found — run demo:seed first.");
      console.log("  [scenario] Retrying in 30s…");
      this.timer = setTimeout(() => this.start(), 30_000);
      return;
    }

    // Fire one immediately to kick things off, then go to randomised schedule
    console.log("  [scenario] Starting scenario runner");
    await this.triggerWorkflow(pick(this.workflows));
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
