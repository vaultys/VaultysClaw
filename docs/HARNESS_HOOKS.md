# Harness Hooks — Design Brief

**Status:** phases 0 and 1 built (§9) — `sdk-go/toolgate`, `vaultysclaw-hooks/` with Claude Code in
observe and enforce modes, `install` / `uninstall` / `doctor`, `enroll` / `agent`, and the audit
trail reaching the control plane, and signed status refresh (`cert_status_request` from Go). Phase
2 built: Codex and Cursor adapters, the per-harness coverage indicator, and the
`harness.tool_denied` / `harness.coverage_degraded` webhook events. Wave 3 built: Gemini CLI,
Copilot CLI, Cline. Not yet: OpenCode (wave 4), a live run against each vendor, the decision on
replacing the sensor (§8).

**Goal:** a single, OS-agnostic Go binary that installs itself into every coding harness through
that harness's *own* hook system, and allows or blocks each tool call from the certificates the
control plane has distributed. No seatbelt, no bubblewrap, no eBPF, no proxy: one binary,
cross-compiled for macOS, Linux and Windows.

If it works, it is meant to eventually replace both `vaultysclaw-sensor`'s supervisor
(`internal/supervise`, `docs/HARNESS_SUPERVISOR.md`) and the sensor itself, because it is simpler
to install and fully portable. §8 lists what that replacement would cost.

Working name: **`vaultysclaw-hooks/`**, a top-level Go module like `vaultysclaw-sensor/`.

## 1. Prior art: how OpenLIT hooks into agents

[OpenLIT](https://github.com/openlit/openlit) (Apache-2.0) uses the same installation mechanism
for **telemetry only**:

- `openlit coding install` drops one plugin manifest per vendor:
  - Claude Code: a plugin under `~/.claude/plugins/openlit-cc/`, registered through the `claude` CLI.
  - Codex: a local plugin marketplace registered with `codex plugin add`. The user must then trust
    each hook under `/hooks`.
  - Cursor: entries in `~/.cursor/hooks.json`.
  - OpenCode: a TypeScript plugin.
- Every manifest points every lifecycle event at **one binary**:
  `openlit coding hook --vendor=<v> --event=<e>`. It reads the payload on stdin, normalises it
  through a per-vendor adapter (`cli/internal/coding/hook/<vendor>/`), and exports OTel spans.
- It is deliberately passive: it never writes to stdout, always exits 0, and has a 5 s hard timeout.

We take the shape (one hot-path command, per-vendor adapters, embedded manifests,
`install`/`uninstall`/`doctor`) and the per-vendor payload knowledge. The decision path is new:
ours answers **allow/deny on stdout** in each vendor's format.

## 2. What "blocking" means here

**It blocks.** When the `PreToolUse` hook answers `deny`, the harness does not run the tool, and
the model receives the reason. This is an enforcement point, not telemetry.

**It can be bypassed.** The hook governs *what the harness declares it is about to do*, not *what
the machine actually does*:

| Bypass | Example | Mitigation |
|---|---|---|
| Indirection through an allowed tool | `Read ~/.ssh/id_rsa` is denied, but `Bash python -c "open(...)"` passes if `code_execution` is granted. Shell strings cannot be parsed into a security boundary. | Scope or withhold `code_execution`. Only OS confinement truly closes this. |
| Config tampering | The agent edits its settings to remove the hook. | Install at the admin-managed location (root-owned, outranks user config). `doctor` and `agent` detect removal. |
| Uncovered events | Codex reportedly hooks only `Bash`. Cursor has no file-write gate. OpenCode subagents skip `tool.execute.before`. | An honest per-harness coverage indicator (§6). |
| Hook failure | A crash or timeout. | **Fail closed** in `enforce` mode. This is the opposite of today's supervisor shim, which fails open because tier B is the boundary there. |
| Detached processes | A script the agent starts that outlives the call. | None at this layer. |

It stops a well-meaning agent's mistakes and naive prompt injection, which is almost every real
case: a model handed a reasoned refusal routes around it rather than attacking it. It does not
stop a determined adversary who already has code execution.

## 3. Architecture

```
harness ──hook──▶ vaultysclaw-hooks hook --vendor=X --event=Y      (hot path, target < 50 ms)
                     │ read stdin → vendor adapter → normalised Request
                     │ → tool mapping → (capability, resource)
                     │ → local offline decision (grant + rules + signed status, from cache)
                     └─▶ vendor-format allow/deny on stdout + audit line to a local spool

vaultysclaw-hooks agent                                             (background, not on the decision path)
    WebSocket to the control plane: handshake, cert_status_request, actor_config
    → writes signed artefacts to the cache, drains the audit spool upstream
```

**No socket or daemon on the decision path.** Each hook invocation verifies the cached signed
artefacts on disk itself. That is what makes it portable: unix sockets are awkward on Windows,
while a file works everywhere. The `agent` only refreshes the cache and ships the audit spool. If
it is down, decisions continue until `maxStatusAge` expires, then follow the configured
fail-closed posture.

## 4. Components

1. **`hook`**: one adapter per vendor (`hook/<vendor>/`). Each adapter:
   - parses the payload;
   - maps vendor tool names onto existing capabilities (`file_read`, `file_write`,
     `code_execution`, `internet_access`, `mcp://<server>/<tool>`, …);
   - encodes the decision in the vendor's output format.

   Events by role:
   - Deciding: `PreToolUse`.
   - Could later gate prompts: `UserPromptSubmit`.
   - Audit only: `PostToolUse`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`.
2. **`install` / `uninstall` / `doctor` / `status`**: vendor manifests are embedded with
   `go:embed`. They are installed at each harness's **admin-managed** location per OS
   (`/Library/Application Support/…`, `/etc/…`, `%ProgramData%\…`), not in user config as OpenLIT
   does. `doctor` checks that the hook is actually live in the harness's effective configuration.
3. **`enroll`**: creates the machine's or user's VaultysId, registers it as an Actor of kind
   `harness` (the kind already exists), and goes through admin approval and certificate issuance.
4. **`agent`**: the control-plane connection, on the same model as `sdk-go/vconn`. It receives
   `actor_config` (mode, signed grant and rule set) and sends the audit trail.

Modes: `observe` (decide and record, always allow) and `enforce` (block, fail closed).

## 5. Reuse

- **`sdk-go/`** unchanged: `authz` (the `resolvePermission` port), `grant`, `rules`, `capability`,
  `vconn`. The TS↔Go conformance contract therefore covers the decision core for free.
- **The supervisor's decision logic**: move `map.go`, `decide.go` and `floor.go` out of
  `vaultysclaw-sensor/internal/supervise` into a shared package (e.g. `sdk-go/toolgate`), so the
  sensor and this package run identical logic during the transition.
- **Per-vendor payload formats, ported from OpenLIT** (Apache-2.0, with attribution): Claude Code,
  Codex (local marketplace + trust-each-hook), Cursor, OpenCode.

## 6. Control plane

- **A new audit message** in `packages/controlplane/lib/protocol.ts` (e.g. `hook_audit`), with
  storage and a per-harness view: blocked and allowed calls, and sessions.
- **Webhook events** — built: `harness.tool_denied` (a refusal in enforce mode, capped per batch)
  and `harness.coverage_degraded`. The latter covers what `harness.hook_tampered` was meant for: a
  removed or broken hook shows up as a harness dropping to *ungoverned*.
- **A coverage indicator per harness and device**: *enforcing*, *observe only*, or *ungoverned*.
  The console must never say "enforcing" for a harness whose sensitive tools are not all hooked.
  This is the same posture as the *advisory* banner in `docs/HARNESS_SUPERVISOR.md` §7.
- **Optional:** emit OpenLIT-compatible `coding_agent.*` OTel spans, so an OpenLIT user sees the
  same sessions next to our decisions.

## 7. Vendor rollout

| Wave | Vendors | Note |
|---|---|---|
| 1 | Claude Code | Parity with today's supervisor tier A; doubles as the regression test. |
| 2 | Codex, Cursor | **Built** — see "Phase 2 as built". Checked against openai/codex rust-v0.167.2 source and cursor.com/docs/agent/hooks, not yet against a live run. |
| 3 | Gemini CLI, Copilot CLI, Cline | **Built** — see "Phase 3 (wave 3) as built". Checked against gemini-cli v0.68.0 and cline v4.1.26 source, and the Copilot CLI hooks reference (CLI 1.0.109); not yet against a live run. |
| 4 | OpenCode | TS plugin calling the binary; known subagent bypass. |

Hook formats for waves 2–4 come partly from third-party write-ups. Each adapter must be checked
against the vendor's current release when it is built.

## 8. What replacing the sensor and supervisor would cost

- **Kernel enforcement.** Keep `srt` as an **optional** add-on when present on the host, for
  machines that need the strong guarantee, rather than deleting it.
- **Shadow-AI discovery.** The sensor scans processes and network traffic. Hooks only see
  harnesses that are installed and managed.
- **Egress control.** The tier-C proxy goes away.

## 9. Phases

| Phase | Scope |
|---|---|
| ~~0~~ | ~~Extract `sdk-go/toolgate`. Package skeleton (`hook`, `install`, `doctor`) for Claude Code in `observe` mode.~~ **Built** — see below. |
| ~~1~~ | ~~`enforce` mode, `enroll` and `agent`, audit shipped to the control plane.~~ **Built** — see below. |
| ~~2~~ | ~~Codex and Cursor; the coverage indicator in the console.~~ **Built** — see below. |
| 3 | Remaining vendors. Decide on replacing the sensor, knowing §8. |

### Phase 0 as built

- **`sdk-go/toolgate`** holds `MapToolCall`, `Decide` and the safety floor, moved unchanged from
  `vaultysclaw-sensor/internal/supervise`, which now aliases them. The sensor's behaviour and tests
  are unchanged.
- **Policy files** use the sensor's names (`control-plane-anchor.json`, `grant.token`,
  `rules.token`), so an artefact provisioned for one works for the other. Until `enroll`/`agent`
  exist they are provisioned by hand.
- **Allowed means silent.** A permitted call produces no hook output, never an explicit "allow",
  because in Claude Code a `PreToolUse` allow bypasses the user's permission prompt.
  `vaultysclaw-sensor`'s supervisor shim used to emit "allow", and so skipped those prompts. It now
  follows the same rule, and its fail-open passes warn through `systemMessage` instead.
- **Enforce mode is built, not just observe.** Without `agent` there is no status refresh, so the
  default `maxStatusAgeSeconds` is unbounded (-1). Enforce fails closed on anything it cannot
  evaluate (§2).
- **Machine scope writes a drop-in** (`managed-settings.d/50-vaultysclaw-hooks.json`) rather than
  editing `managed-settings.json`. Two things are still to verify on a real install: that the
  current Claude Code reads hooks from drop-ins, and how it merges them with other managed hooks.
  `doctor` says so.
- **The hook protects its own install.** The settings file it was installed into, its policy
  directory and its spool are on the floor, so an agent `Edit` of `~/.claude/settings.json` is
  refused like a read of `~/.ssh`. That covers the tools Claude Code exposes, not `Bash` (§2).

### Phase 1 as built

- **`enroll --url --control-plane-id`** pins the control plane's VaultysID as the trust anchor
  (never learned from the network), creates the host identity, and records the coordinates in
  `agent.json`. Re-enrolling against a different control plane fails instead of re-pointing.
- **`agent`** connects as `kind: "harness"` — the same kind as the sensor's supervise role, so the
  existing harness panel, kindConfig schema and signed push serve both. On `actor_config` it:
  - verifies **every** signed artefact in the push before writing **any** of them, so a push with
    one bad token changes nothing;
  - treats a null token as "nothing to give", never as "erase";
  - applies a signed kindConfig in both directions (`explicit` → `enforce`), and an unsigned one
    only where it tightens;
  - **ignores the unsigned trust block** (see "Status refresh" below).
- **Audit shipping.** vconn gained a generic `Outbox`, so a role can send its own message types,
  and a `hook_audit` message. The agent claims each spool by renaming it, reads it once a 2 s grace
  period has passed, and deletes it only after every batch was written to the socket. Delivery is
  at-least-once; every record carries an `id`, and the control plane stores
  `(actorDid, eventId)` uniquely, so a re-sent batch is absorbed.
- **Machine scope** keeps spools in a shared sticky directory (`/Library/Logs/VaultysClaw/hooks`,
  `/var/log/vaultysclaw-hooks`, `%ProgramData%\VaultysClaw\hooks-spool`), one file per user, so an
  agent running as a service drains every user's trail.
- **Control plane:** `hook_audit` is accepted only from an authenticated `harness` Actor and
  attributed to the connection's DID. `lib/hook-audit.ts` validates each event: unknown fields are
  dropped, strings clipped, future timestamps clamped, and batches capped at 500. Events are stored
  in `HookAuditEvent`, and the Actor page shows the last decisions with "would refuse" kept apart
  from "blocked". This is display-only data: the host's own account of itself.

**Status refresh.** A signed grant proves what was granted, never that it still is: revocation
reaches a host as a push with *no* grant, and a null token rightly erases nothing. So the agent
checks the status itself:

- `sdk-go/grant` signs a `cert_status_request` with the host's identity (`SignStatusRequest`) and
  verifies the control plane's signed `cert_status_response` (`VerifyStatusResponse`). Both
  directions are pinned by conformance fixtures: `status-fixture.json` (TypeScript-signed, checked
  by Go) and `status-request-fixture.json` (Go-signed, checked by `packages/policy`).
- The agent's `StatusRefresher` sends a request on the outbox tick whenever the held grant has no
  status, a status for another certificate, or one older than a third of `maxStatusAgeSeconds`
  (clamped to 15 s – 5 min). One request is in flight at a time; an unanswered one is re-sent after
  30 s. A response is persisted to `status.token` only if it verifies against the anchor and is
  about this host and its current grant, and never over a newer one.
- Each hook invocation re-verifies `status.token` (`state.LoadPolicy`). For the current grant, the
  response's status is enforced, its capability list **replaces** the grant's (intersection only, so
  a check can narrow but never widen), and its signed `checkedAt` is the freshness. A non-active
  status is final: a later push carries no status and cannot overrule it. Until the first check,
  or after a re-issue, the grant's write time is the freshness, as before. A status file that does
  not verify is an error, not "no status", because ignoring it would drop a revocation.
- This is how a revocation, a kill switch (signed as `revoked`), or a custom capability deleted from
  the registry reaches a host within one refresh interval. `doctor` shows which source the current
  status rests on.

The org's unsigned trust block is still not adopted. Persisting its TTL tighten-only would be a
ratchet: an admin who later relaxed the org bound would never see this host follow. The harness
kind's own `maxStatusAgeSeconds`, signed in the kindConfig, is the knob, and it moves both ways.

### Phase 2 as built

**Codex** (`internal/adapter/codex`, checked against openai/codex `rust-v0.167.2`). Codex follows
Claude Code's protocol: same payload fields, same `PreToolUse` denial, and it rejects "allow"
outright. Shell calls arrive as `Bash`, MCP tools as `mcp__<server>__<tool>`.

- **`apply_patch`** carries the whole patch text, and one patch can add, update, delete and move
  several files. Every path it touches becomes its own file-write decision (`adapter.Event.More`),
  and the patch is refused if any of them is. Markers are matched more leniently than Codex's own
  parser, because a missed marker is an undecided write.
- **Install.** Machine scope writes `/etc/codex/hooks.json`, in Codex's system layer: managed, so
  always trusted, and the user cannot disable it. User scope writes `~/.codex/hooks.json`
  (`$CODEX_HOME`). Codex runs user-layer hooks only after the user approves them in its hook
  review, which cannot be checked from outside, so it is declared as a gap.
- **Blind spot:** text typed into an already-running interactive shell (`write_stdin`) never
  reaches a hook.

**Cursor** (`internal/adapter/cursor`, checked against cursor.com/docs/agent/hooks).

- **Decision events.** `preToolUse` is the only event that sees writes and deletes before they
  happen, so it is the decision point. `beforeShellExecution`, `beforeReadFile`, `beforeMCPExecution`
  and `beforeTabFileRead` are registered as well: their payloads are better, and `cursor-agent` has
  historically fired only some events. A call decided twice gets the same answer both times.
- **Mapping.**
  - `Shell` → `Bash`; `Delete` → `Write`.
  - File paths are looked up under several key names. A file tool with no recognisable path is
    refused in enforce mode.
  - `MCP:<tool>` on `preToolUse` names no server, so it is deferred (`adapter.ErrDeferred`) to
    `beforeMCPExecution`, which does name it.
- **Output.**
  - Invalid output on a permission hook is a refusal, so every decision event answers valid JSON:
    a `deny`, or `{}` for no objection.
  - Never `allow`: the docs do not say whether it skips Cursor's own approval.
  - Every entry sets `failClosed: true`; by default Cursor lets an action through when a hook
    crashes or times out.
- **Install.**
  - Machine scope merges into the enterprise `hooks.json`, which may also be managed by an MDM
    profile, so it is never overwritten.
  - Cursor runs every level's hooks and a `deny` from any of them wins, so a lower level cannot
    overrule ours.
- **Blind spots:**
  - web search, web fetch and codebase search are not documented as reaching `preToolUse`;
  - MCP calls are ungoverned on `cursor-agent` releases that do not fire `beforeMCPExecution`.
- **Unverified until a live run:**
  - that `{}` reads as "no objection";
  - the exact `tool_input` keys for Read, Write and Delete.

**Coverage indicator.**

- `internal/coverage` derives one level per harness from the installer checks:
  - **enforcing**;
  - **partial**: enforce mode, but the vendor declares gaps;
  - **observe**;
  - **ungoverned**: no decision hook, or a broken one.
- Each level below enforcing says why.
- `doctor` prints exactly what the agent reports, so the CLI and the console cannot disagree.
- **Reporting.** The agent sends it as `hook_coverage` whenever it changes, and every 10 minutes
  otherwise.
- **Control plane.**
  - The control plane keeps the latest report per Actor (`HookCoverage`).
  - An unknown level is read as ungoverned.
  - Tamper resistance is only shown at machine scope.
  - A report older than 30 minutes is labelled stale on the Actor page.
- **Not every limit is a gap.** Every vendor fails open when our process crashes or times out,
  except Cursor with `failClosed`. That is a limit of the hook model as a whole, not of any one
  harness, so it is documented here and not listed as a gap.

### Phase 3 (wave 3) as built

Every adapter maps its harness's tools onto toolgate's vocabulary. Where a tool takes a list —
several commands, files or URLs — every item is decided and the call is refused if any one is.
Where arguments are documented loosely, paths are looked up under several key names, and a file
tool with no recognisable path is refused in enforce mode.

| | Gemini CLI | Copilot CLI | Cline |
|---|---|---|---|
| Decision event | `BeforeTool` | `preToolUse` (camelCase payload) | `PreToolUse` executable file |
| Refusal | `{"decision":"deny","reason"}` | `{"permissionDecision":"deny","permissionDecisionReason"}` | `{"cancel":true,"errorMessage"}` — ends the whole turn |
| "allow" | would not skip confirmation; never sent | **skips the approval prompt**; never sent | does not exist |
| Machine scope | system `settings.json`, merged | own file in `policy.d/` (root-owned, not group/world-writable) | **none exists** — skipped, reported ungoverned |
| User scope | `~/.gemini/settings.json` | own file in `~/.copilot/hooks/` | scripts in `~/Documents/Cline/Hooks/` (read by the extension and the CLI) |
| Failure | fails open on every error path | crash fails **closed**, timeout fails open | fails open on every error path |

**Gemini CLI.**
- MCP tools are named `mcp_<server>_<tool>` with single underscores, which cannot be split
  reliably. The payload's `mcp_context` names the server, and only that is used.
- `web_fetch` takes a prompt with the URLs inside it. Every URL in the prompt is decided, and a
  prompt naming none is refused in enforce mode.
- **Gaps:**
  - No hook runs, system ones included, in a folder Gemini does not trust. Folder trust is on by
    default.
  - A user can disable any hook by name. `Check` reports it when the name is in a settings file,
    but `/hooks disable` at runtime leaves no trace.

**Copilot CLI.**
- `toolArgs` is documented only as "unknown", so it is decoded both as an object and as a JSON
  string.
- **Gaps:**
  - MCP tool naming is undocumented, so MCP tools are left unmapped rather than guessed.
  - At user scope, a repository's `disableAllHooks` switches user hooks off.
- **Unverified:** the argument names of `view`, `create` and `edit`.

**Cline.**
- **Two payload shapes.** The VS Code extension sends `preToolUse.parameters`, with every value
  converted to a string. The CLI sends `tool_call.input`, the model's raw input. Both are read,
  and stringified lists are decoded.
- **Hook files.** Each hook is a whole file per event. An existing one that is not ours stops the
  install before anything is written.
- **Gaps:**
  - every failure lets the call through;
  - there is no admin-managed location, and any user can switch hooks off;
  - the CLI's `--yolo` mode runs no hooks.

Cline is therefore *partial* at best at user scope, and *ungoverned* at machine scope. The console
says so.
