# Guided client demonstration

A live, six-step walkthrough of identity, read-only access, workspace containment and recovery.
It uses two real TypeScript SDK agents and harmless local JSON files. It requires no LLM key or
external business service. The fictional organization is Northstar; the teams are Finance and Research.

## Start

From the repository root, after `pnpm install`:

```bash
pnpm simulator:up
```

Keep that terminal running. Open **http://localhost:3003/login** and create the first browser
identity to bootstrap an administrator, or sign in as an existing administrator.

In another terminal:

```bash
pnpm demo
```

Open **http://localhost:3011**. Click **Start walkthrough**. Keep both terminals running.
The presenter binds to loopback, and refuses database/WebSocket coordinates outside the existing
isolated simulator (localhost:5434/vaultysclaw and localhost:8083).
The Docker quick-start stack on port 3010 is a separate environment and is not used here.

## Present the story

1. **Discover:** start the run. Two unique `guided-…` agents complete real registration handshakes.
   The presenter places their pending requests into newly created demo workspaces and verifies
   that reads are denied before approval.
2. **Approve:** use **Open approvals**. Approve both agents with **file_read only**. Return to the
   presenter and click **Verify this step**. A database approval flag alone is insufficient:
   each agent must receive and verify its grant, and successfully read its sample file.
   Match the exact names shown by the presenter. In a populated simulator, use the browser's
   Find command to locate each pending request; the console search box searches registered actors.
3. **Boundary:** verify the next step. Finance reads its invoice, attempts an ungranted file write,
   and Research reads its sample. The SDK decision gates the actual file operation. A write that
   unexpectedly succeeds fails the step; the UI never substitutes a scripted success.
4. **Contain:** follow Finance's **Workspace** link. Arm its emergency switch through the console,
   entering a reason and its required **ARM** confirmation. Verify that Finance cannot read while
   Research still can. An organization-wide switch will correctly fail this scenario.
5. **Recover:** disarm Finance's switch through the console. Verify both reads succeed after
   reconnection, with the same certificate IDs as before suspension.
6. **Evidence:** download the JSON report and open the console audit log. The report contains local
   operation observations, reasons, certificate references and timestamps. Administrative audit
   records remain in the control plane; the downloaded report is not a signed audit artifact.

Steps that need registration, grant delivery or reconnection wait up to 30 seconds. Failed
expectations leave the current step in place with an explanation and observed results. Resolve the
cause in the console, then retry. The current two-agent scenario measures individual operations;
it does not claim a fleet-wide propagation SLA.
After arming or disarming, allow a few seconds for status propagation. An immediate check can
observe the preceding state; it remains in the report and does not advance the walkthrough.

## Presenter controls and repeatability

- **Pause** disables progression; SDK connections remain live so the console continues to reflect reality.
- **Restart with new identities** archives the current report and creates a fresh pair of agents,
  new workspaces and new files. Prior actors, certificates, switches and audit records are retained.
  No reset removes or rewrites ledger history. Disarm any switches you no longer want active in the
  console. A global switch must be disarmed before another onboarding run can pass.
- Each run uses the same scenario data and operations, with unique DIDs and workspace IDs.
- Report snapshots and private identity files live under `packages/simulator/.simdata/guided/`.
  This directory is ignored by Git. Reports contain public identity references, never private keys.
- Ctrl+C stops the presenter and its agents. Stop the simulator control plane in its own terminal
  when finished; `pnpm simulator:down` stops its database while preserving data.

The only direct database writes are demo provisioning: new workspaces, pending-request placement
and ownership metadata for these new demo agents. Ownership points to the existing simulator
administrator. The presenter never approves registrations, issues grants, or arms/disarms switches.
Those actions go through the console's existing authorization and audit paths.

## Scope and next extensions

This is the first live client walkthrough, deliberately focused on two spotlight agents. The
existing fleet simulator remains available for background population and scale tests. A larger
fictional estate, integrated admin controls, notification delivery and a signed evidence bundle
are separate extensions. The current local operation guard demonstrates enforcement by these
clients; it does not claim control over arbitrary uninstrumented processes.
