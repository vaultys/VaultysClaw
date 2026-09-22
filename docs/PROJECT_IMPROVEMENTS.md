# Project improvement roadmap

## Milestone 1: a reliable entry point

Implemented in the first cleanup pass:

- Docker-only local setup, prerequisite check, persistent generated credentials, isolated volumes,
  loopback application ports, readiness failures and documented stop/log commands.
- `pnpm dev` starts the supported control plane rather than every package's development task
  (which included the fleet simulator). Workspace dependencies build before the app starts.
- Root README and contributor guide describe the current identity/trust architecture.
- The obsolete agent-controller installer fails with current setup guidance instead of downloading
  from a placeholder repository.
- Launcher regression checks and a Docker startup smoke check in CI.

Acceptance: from a clean checkout, start the local stack, open the login page, create the first
administrator, stop and restart without losing the identity's server-side registration.
The automated smoke check covers service readiness and login availability; browser onboarding
and identity persistence still need an end-to-end browser test.

## Maintenance inventory

| Surface | Decision | Verification / follow-up |
|---|---|---|
| `quick-start.sh` | Supported local evaluation entry point | Python launcher tests; Docker workflow startup |
| `install.sh` | Retired with explicit guidance | No downloads or system changes |
| `docker/wait-for-db.sh` | Keep: production container startup | Docker startup smoke check |
| `scripts/fix-esm-extensions.mjs` | Keep: workspace build dependency | Package builds |
| `scripts/webhook-receiver.mjs` | Keep: local delivery inspection | Include in future notification demo |
| `vaultysclaw-sensor/quickstart.sh` | Keep as a separate sensor/collector experiment | Audit separately from control-plane setup |
| Root `__tests__/` | Legacy; excluded from package test runs | Map relevant behaviors before deletion |
| Package `__tests__/` + `conformance/` | Supported test suites | TypeScript and Go CI |
| Root lint / control-plane start scripts | Further maintenance needed | Modernize lint config; verify production entry point |
| Historical architecture/compliance documents | Historical claims need review | Label or update before client-facing use |

Do not bulk-delete the root tests merely because their imports are broken. In a dedicated cleanup:
map authorization, enrollment, certificate and notification behaviors to current package coverage;
port missing, still-applicable cases; then remove the obsolete implementations and test utilities.
Old workflow, memory and agent-controller tests should not be treated as current coverage.

## Milestone 2: one repeatable client story

First implementation: `pnpm demo` provides a local presenter with two live SDK agents, six
verified steps, console links and JSON evidence export. See
[the presenter guide](../packages/simulator/GUIDED_DEMO.md). Approval and suspension are manual
console actions; expanded fictional fleets and fully integrated presenter controls remain future work.

Extend `packages/simulator`; retain real VaultysId identities and SDK protocol traffic.
Start with a fictional organization, two workspaces and roughly 50 actors rather than the
7,000-actor load preset. Keep scenario data and credentials in the isolated demo environment.

Sequence:

1. Discover agents and their owners.
2. Register and approve a new agent with a narrow certificate.
3. Perform an allowed action against a harmless local resource, then attempt a denied action.
4. Suspend one workspace; retry and show the observed effect while the other workspace continues.
5. Restore access and verify recovery.
6. Show the evidence timeline and export a run summary.

Build a scenario runner with deterministic fixtures, expected outcomes, deadlines and observed
results. Provisioning can seed data; demonstrated administrative actions should use the same
application services and authorization paths as the console. Do not present direct database
seeding as evidence that onboarding or approval worked end to end.

Then add presenter controls: Start, Next, Pause and Reset, with captions explaining the business
outcome. A failed expectation must stop the story and show diagnostics, rather than advancing a
scripted success animation. Measure revocation/suspension propagation, including status refresh
and cache behavior; do not promise instantaneous enforcement.

Acceptance: a colleague presents the same scenario twice from a reset environment without code
edits, manually pasted browser-console snippets, paid model credentials or external business services.

## Milestone 3: understandable access

Build a "Can this actor perform this action on this resource?" view using the actual permission
resolver. Explain the decision, applicable grants, scope, expiry and suspension, and link to the
next operator action. Keep effective access distinct from a certificate's stored ledger status.

Connect inventory → owner → access → recent events → incident controls. Improve the end-user
portal with readable access summaries and expiry guidance. Decide separately whether access
requests belong in the product; the current portal deliberately has no request workflow.

## Milestone 4: broader demonstrations

- Guided mode: the small, deterministic client story.
- Explore mode: clients inspect the populated console.
- Scale mode: existing large fleet plus measured performance and failure reporting.
- Optional notifications: add Redis, dispatcher and local receiver to the demo profile;
  the current simulator intentionally omits notification delivery.

Use fictional names and locations by default. Keep prospect-specific branding separate from the
scenario logic. Validate every marketed capability against a reproducible demonstration.
