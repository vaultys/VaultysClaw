# P1 Spike — Durable workflows on self-hosted Inngest

Status: **prototype, compiles & type-checks** (`pnpm --filter @vaultysclaw/control-plane type-check` → 0 errors). Additive and engine-gated, so the existing executor is untouched unless `WORKFLOW_ENGINE=inngest`.

## What this proves

The hand-rolled `executeWorkflow` fire-and-forget loop is replaced by a **generic durable function** that walks any `WorkflowDefinition` as Inngest steps. It demonstrates, on the real DAG/approval domain:

- **Crash recovery / memoization** — each node runs in `step.run(...)`; on restart Inngest replays and skips completed steps. Replaces the manual "which steps already ran" bookkeeping.
- **Approval gate via `step.waitForEvent`** — replaces the 10s DB poll loop in `executeWorkflow`. The function suspends with zero resources until the approve/reject API emits `workflow/approval.resolved`, or the configured timeout elapses (auto-continue, matching legacy behaviour).
- **Durable delay** via `step.sleep`, per-step **retries** via function config.

## Files

| File | Role |
|---|---|
| `packages/control-plane/lib/inngest/client.ts` | Inngest client + event payload types + `isInngestEngine()` |
| `packages/control-plane/lib/inngest/functions/run-workflow.ts` | **The spike** — generic durable DAG interpreter |
| `packages/control-plane/lib/inngest/emit-approval.ts` | Bridges approve/reject API → `workflow/approval.resolved` event |
| `packages/control-plane/app/api/inngest/route.ts` | `serve()` endpoint the Inngest server invokes |
| `app/api/workflows/[id]/execute/route.ts` | Branches to `inngest.send()` when engine selected |
| `app/api/workflow-approvals/[id]/{approve,reject}/route.ts` | Emit the approval event |
| `docker-compose.inngest.yml` | Standalone Inngest Dev Server (dashboard at :8288) |
| `docker/docker-compose.yml` | `inngest` service added; control-plane gets `WORKFLOW_ENGINE=inngest` + `INNGEST_DEV` |
| `demo/simulator/demo-up.sh` | starts `vc-demo-inngest`; `--skip-inngest` falls back to the legacy engine |
| `__tests__/inngest-engine.test.ts` | bridge + route branching (6 tests) |
| `__tests__/inngest-run-workflow.test.ts` | durable function via `@inngest/test` + approval logic (8 tests) |

## Run it locally

Three ways, depending on what you're running:

```bash
# A. Full demo stack — Inngest is wired in automatically (use --skip-inngest to opt out)
pnpm simulator:up

# B. All-in-one docker stack — inngest service included, engine on by default
docker compose -f docker/docker-compose.yml up --build

# C. Standalone (manual dev), control plane run separately:
# 1. Start the Inngest Dev Server (auto-discovers /api/inngest)
docker compose -f docker-compose.inngest.yml up

# 2. Start the control plane with the durable engine selected
WORKFLOW_ENGINE=inngest pnpm vaultysclaw:dev

# 3. Trigger a workflow run (UI or API). For a workflow with a user/approval node:
#    - the run suspends at the approval step (visible in the Inngest dashboard, :8288)
#    - approve it in the VaultysClaw UI → approve route emits the event
#    - the dashboard shows the function resume and complete
```

## Verify

- **Dashboard (:8288)** — each node appears as a discrete step with inputs/outputs; the approval step shows `waitForEvent` suspended, then resumed.
- **Crash recovery** — kill the control plane mid-run (after some steps, before approval), restart it: the function replays, already-completed steps return memoized outputs (no agent re-calls), and it picks up where it left off.
- **DB parity** — `workflow_runs` / `workflow_steps` reflect the same statuses as the legacy path (the function still writes through `WorkflowDAO`).

## Known follow-ups (out of spike scope)

- **Full v4 typed triggers** — inngest v4 replaced the `EventSchemas` builder with `eventType()`/`staticSchema`; the spike types payloads at the boundary with casts instead. Wire real typed triggers for end-to-end inference.
- **Idempotency hardening** — side-effecting agent intents are wrapped in `step.run` (so a *completed* step never re-fires), but each intent should also carry an idempotency key for the in-flight-crash window.
- **Edge-condition branching** — still uses the "all predecessors succeeded" gate; the `workflow-executor.ts:189-194` condition-evaluation fix applies here too.
- **Scheduler** — once this lands, retire the 60s-poll `workflow-scheduler.ts` in favour of Inngest scheduled functions (roadmap P2).
- **Self-hosted prod** — dev uses the in-memory Dev Server; production points the same binary at Postgres + Redis.
