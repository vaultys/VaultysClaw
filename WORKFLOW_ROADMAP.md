# VaultysClaw — Improvement Roadmap

*Date: 2026-06-16 | Scope: workflows + unfinished app surfaces*

## Guiding principle

Reuse mature OSS where we've hand-rolled infrastructure. The workflow executor, cron
scheduler, and condition evaluator are home-grown and missing the exact features that
durable job engines provide for free (retries, backoff, parallelism, timeouts, crash
recovery, TZ-aware scheduling). Adopt libraries; keep our domain logic (intents,
VaultysId signatures, approvals) on top.

---

## P0 — Security hardening (next sprint)

These are small, high-leverage, and block production trust.

- [ ] **Auth on test API** — add `getAuthContext()` + `isGlobalAdmin` check in `guard()`
      of `app/api/test/[...path]/route.ts`. (SECURITY_REVIEW #3)
- [ ] **Encrypt bridge configs at rest** — wire existing signcrypt utils into
      `channel-bridge-service.ts` `encryptConfig()` / `decryptConfig()` (lines 190–211).
- [ ] **Real Teams JWT verification** — replace `return true` in
      `bridges/teams-gateway.ts:63-67` with `jwks-rsa` + `jsonwebtoken` against the
      Bot Framework JWKS (or `botframework-connector`).
- [ ] **Rate limiting** — add `rate-limiter-flexible` to `/api/auth/*`,
      `/api/user/connect`, `/api/api-keys`. (SECURITY_REVIEW #8)
- [ ] **HTTP security headers** — CSP, HSTS, X-Frame-Options via Next.js `headers()` in
      `next.config.js`. (SECURITY_REVIEW #10)
- [ ] **Move serverSecret out of DB** — env var or Infisical/Doppler/Vault. (#11)
- [ ] **Strip DID console.logs** in `app/web/auth.ts`. (#9)

## P1 — Workflow engine: adopt self-hosted Inngest (core, blocks "real" workflows)

**Decision (2026-06-16): self-hosted Inngest** over BullMQ/Temporal. Rationale: durable
step-functions map onto our domain (long-running human approvals, crash recovery,
fan-out, scheduled steps) so we can *delete* hand-rolled DAG bookkeeping + approval
polling rather than wrap it. Best Next.js/TS fit. Same backing stores as the BullMQ path
(Postgres we already run + Redis), plus one stateless Go binary.

**Licensing note:** the Inngest **SDK** (what we program against) is **Apache 2.0**. The
self-hosted **server/CLI** is **SSPL + DOSP** (auto-converts to Apache 2.0 after the
release delay). SSPL's "as a service" copyleft is **not triggered** by embedding Inngest
as our internal orchestration engine — only by exposing Inngest's own API/dashboard to
customers, which we won't. Confirm exact DOSP window vs `LICENSE.md`; get counsel sign-off
before commercial GA if our product boundary relative to the service clause is ever unclear.

Replace the fire-and-forget `Promise.resolve().then()` executor with durable Inngest
functions. This fixes retries, backoff, parallel fan-out, per-step timeout, crash
recovery, and missed-run catch-up at once.

> **Spike landed (2026-06-16)** — generic durable DAG interpreter + `waitForEvent`
> approval gate, engine-gated behind `WORKFLOW_ENGINE=inngest`, type-checks clean,
> 14 tests passing (`@inngest/test`). Wired into `docker/docker-compose.yml` and
> `demo/simulator/demo-up.sh` (`--skip-inngest` opts out). See `docs/INNGEST_SPIKE.md`.
> Inngest installed at v4.5.1.

- [x] **Stand up self-hosted Inngest** — `docker-compose.inngest.yml` (Dev Server). Prod
      still needs the binary backed by Postgres + Redis + signing/event keys.
- [x] **Add the Inngest SDK** to control-plane; `/api/inngest` serve handler mounted.
- [x] **Port the executor to a durable function** — `lib/inngest/functions/run-workflow.ts`:
      each node is a `step.run("node:<id>", ...)`; memoization replaces the manual
      "which steps already ran" bookkeeping; `WorkflowDAO` still written for UI/audit.
- [ ] **Parallel execution** — fan-out nodes with no single predecessor via
      `Promise.all([step.run(...), step.run(...)])`; fan-in is automatic.
- [ ] **Retry + backoff** — per-step `retries` config (Inngest does exponential backoff).
- [ ] **Per-node timeout** — step/function timeout from `node.data.timeout`; today only
      approval nodes have it, agent nodes hard-code 30s.
- [x] **Approval gates → `step.waitForEvent`** — done in the spike; approve/reject routes
      emit `workflow/approval.resolved` via `lib/inngest/emit-approval.ts`. Zero-resource waits.
- [ ] **Edge condition evaluation** — fix the stub at `workflow-executor.ts:189-194`:
      pass the actual upstream step output (not just `"success"`) into the evaluator.
      Consider `json-logic-js` for UI-buildable, serializable conditions.
- [ ] **Idempotency review** — audit side-effecting agent intents (Slack post, file
      write) so step replay after a crash is safe; lean on step memoization.
- [ ] **Custom node handler** — define behavior (HTTP call / sandboxed JS) or remove the
      type; currently silently skipped.

## P2 — Scheduling & triggers

With Inngest, scheduling and event triggers become engine primitives — the hand-rolled
60s-poll scheduler in `workflow-scheduler.ts` can be retired.

- [ ] **Cron via Inngest scheduled functions** (TZ-aware) — retire the custom 5-field
      parser and the UTC-only limitation. (`croner` only if we keep cron outside Inngest.)
- [ ] **Per-workflow timezone** — store on Workflow, pass through to the schedule.
- [ ] **Event / webhook triggers** — `inngest.send()` from a signed webhook endpoint
      starts a run; same event bus powers approval waits and fan-out.
- [ ] **Run controls API** — retry-failed-run, pause/resume, cancel (Inngest exposes
      cancel + replay natively; surface them through our API).

## P3 — Finish stubbed integrations & polish

- [ ] **Peer manager / P2P grants** — implement the 4 stubbed endpoints under
      `app/api/agents/[did]/peers/` (currently `UNAVAILABLE: Not implemented`), or
      formally defer with a tracking issue.
- [ ] **Entra/Azure AD QR** — implement `app/api/server/entra/send-qr` (501) or remove.
- [ ] **Bridge connectivity validation** — `validateTeamsBridge` / `validateWebhookBridge`.
- [ ] **Loop / iteration node** — fan-out over arrays (natural with Inngest step fan-out).
- [ ] **Conditional edge labels** rendered in the React Flow canvas.

## P4 — Quality & types

- [ ] **Replace `c.type<any>()`** in `agents.contract.ts` (lines 40, 76, 104, 265) with
      real response schemas.
- [ ] **Re-enable ~20 skipped auth tests** in `__tests__/security.test.ts`
      (lines 348, 415, 472, 510) once DB helpers are refactored.
- [ ] **Add tests** for parallel execution, edge conditions, retries, scheduler TZ.
- [ ] **Revalidate role flags per request** instead of trusting cached JWT claims. (#7)

---

## OSS library shortlist

| Need | Library |
|---|---|
| Durable workflow execution (retry/backoff/parallel/timeout/cron/waitForEvent) | **Inngest, self-hosted** (SDK Apache 2.0; server SSPL+DOSP). Backing stores: Postgres + Redis. Evaluated against BullMQ (lighter, but keeps hand-rolled orchestration) and Temporal (more powerful, much heavier ops). |
| TZ-aware cron | Inngest scheduled functions (else **croner** / `cron-parser`) |
| Serializable conditions | **json-logic-js** (keep `expr-eval` for arithmetic) |
| Rate limiting | **rate-limiter-flexible** |
| Security headers | Next `headers()` / **@next-safe/middleware** |
| Teams JWT | **jwks-rsa** + **jsonwebtoken** / **botframework-connector** |
| Secrets | **Infisical** / **Doppler** / Vault (existing signcrypt for at-rest blobs) |
