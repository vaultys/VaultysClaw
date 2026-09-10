# Harness Supervision — Implementation Plan

**Status:** **phase 0.5 and phase 0 are built**; phase 1 is next. This plan targets
`vaultysclaw-sensor/` (Go); phases 0–2 need **no change to `packages/controlplane`**.

Built in `packages/policy` + `sdk-go/capability` (phase 0.5, §4.2.1/§4.2.2):

| What | Where |
|---|---|
| `file_read` / `file_write` built-ins, `file_access` withdrawn from issuance | `packages/policy/src/types.ts`, `sdk-go/capability/name.go`, `controlplane/lib/capabilities.ts` |
| `core`/`vaultys` reserved vendors, pinned by 4 new shared cases | `RESERVED_VENDORS`, `reservedVendors`, `conformance/capability-names.json` (31 cases) |

Built in `vaultysclaw-sensor/internal/supervise` (phase 0):

| File | What |
|---|---|
| `map.go` | §4.2's tool→capability mapping, path resolution (absolute + symlink), `Argv0` |
| `floor.go` | §4.3's deny-only safety floor, matched by path segment |
| `decide.go` | the decision: floor → unmapped → staleness → certificate, `observe`/`explicit` |
| `daemon.go` | the resident unix-socket decision daemon (0600, owner-only directory) |
| `hook.go` | the Claude Code `PreToolUse` shim — the only harness-specific file |
| `launch.go` | settings generation, `Preflight`, `BuildLaunch`, the advisory notice |
| `report.go` | the observe-mode reader — §4's "done when", turned into a `CertScope.resourcePattern` an admin can paste |
| `rules.ResourceRule` / `MatchResource` / `EvaluateResource` (in `sdk-go/rules`) | **phase 3a**: URI rules in the signed set, pinned by 3 new fixture rules and 10 decision cases |
| `sandbox.go` + `sandbox_darwin.go` | **tier B, phase 2a**: the safety floor and the supervisor's own artefacts, enforced by the macOS kernel. `sandbox_other.go` reports the honest absence of a backend elsewhere. |
| `cmd/sensor/supervise.go` + the `supervise`/`hook` subcommands + the `supervise` config block | role wiring, mirroring `startIntercept`'s fatal-not-degraded posture |

`intercept.Event` gained `Resource` (renamed from `Destination`), `Tool`, `Capability`, `WouldDeny`
and `Ungoverned` — §4.4's one event shape for both roles.

**Verified against the real binary**, using `conformance/grant-fixture.json`'s genuinely
policy-signed packcert: the anchor pins, the grant verifies, the generated settings file reaches the
harness, and four tool calls round-trip the real socket and land in the spool with distinct reasons
— an out-of-scope read denied by certificate, a `~/.ssh` read refused by the floor, a `Bash` mapped
to `exec://git`, and a `WebFetch` recorded as an ungoverned coverage gap. Also verified: the shim
fails open *loudly* when the daemon is unreachable, and the preflight probe is answered but never
recorded (a synthetic call must not inflate the coverage metric).

`vaultysclaw-sensor report` summarizes a spool: calls per capability, the tools that produced them,
a suggested scope pattern (common prefix cut at a separator, never mid-segment — the filesystem
analogue of `rules.MatchHost`'s strictness), the ungoverned-tool backlog sized, and what `explicit`
mode would have refused. Two findings it produced on its first real run, both now fixed and pinned
by tests: a floor-refused path poisoned the scope suggestion for its whole capability (a single
`~/.ssh` read collapsed every `file_read` suggestion to "none"), and the preflight probe was
counted as an ungoverned call.

`explicit` mode is implemented and tested — the mode switch fell out of the decider rather than
being a separate build — but **it is not recommended yet**, and that is the point of phase 0: run
observe against real sessions first, read the report, and let it tell you what the scope should be
before any certificate freezes a resource string.

### Tier B as built (phase 2a) — and what it deliberately is not

The macOS backend generates a seatbelt profile from **the same `Floor` tier A decides with**, so an
operator configures a deny once and gets both the reasoned refusal and the unbypassable one. It
starts from `(allow default)` and denies specific paths: **a deny-list, not general confinement.**
Everything not named is permitted. A real allow-list profile has to enumerate everything a coding
harness legitimately touches — node, git, its own state directory, three cache trees, the system
libraries — and is the sort of thing that ships broken, gets switched off, and protects nothing.
What phase 2a delivers is §7's anti-tamper requirements made true, which is worth having alone.

`supervise.sandbox` is `auto` (confine where possible, warn loudly where not), `require` (refuse to
launch without confinement — the setting for anyone who actually depends on it), or `off`.

**Verified end to end against the real kernel mechanism**, in `explicit` mode with the same floor:

| | Result |
|---|---|
| Read a floor path *through the hook* | denied, `refused: on the safety floor (…)` — tier A |
| Read it *bypassing the hook*, as `bash -c` does | `Operation not permitted` — **tier B** |
| Rewrite the settings file that installs the hook | `Operation not permitted` — **tier B** |
| Tamper with the supervisor's own grant | `Operation not permitted` — **tier B** |
| *Read* the settings file | still permitted — the harness must load it, so only writes are denied |
| Ordinary work in the repo | untouched |

Three findings from building it, each of which fails **silently** and each now pinned by a test:

- **An unresolved path enforces nothing.** Seatbelt matches the kernel's view, so a rule naming
  `/tmp/x` matches nothing on a machine where `/tmp` is a symlink to `/private/tmp` — which is every
  macOS machine. The profile loads cleanly and covers nothing.
- **`literal` names a file, `subpath` names a directory.** `subpath` on a file matches nothing.
- **Escaping happens exactly once.** A double-escaped quote names a path that does not exist, which
  fails the same silent way as no escaping at all; `%q` was also mangling non-ASCII paths into `\u`
  sequences.

Because all three failures are silent, and because `sandbox-exec` is deprecated and its behaviour
has changed before, `NewSandbox` **refuses to return a sandbox it has not just watched work**: it
writes a canary file, denies it, and requires the read to succeed unconfined and fail confined. A
mechanism that quietly stops functioning while still telling the operator they are protected is
worse than no mechanism.

Built in `packages/controlplane` (phase 5a — the `harness` kind):

| File | What |
|---|---|
| `lib/harness-kind.ts` | the `kindConfig` schema, parse-or-throw, and author-time warnings |
| `lib/actor-config.ts` | `buildHarnessConfig` — grant selection, resource-rule signing, the trust block |
| `lib/actor-kinds.ts` | the `harness` kind, danger-coloured like `proxy` |
| `components/harness/HarnessConfigPanel.tsx` | the Actor detail panel — mode, confinement, rule list, every warning inline |
| `app/admin/actors/actions.ts` | three Server Actions, each starting with `requireAdmin()` |
| the webhook pipeline | `harness.config_updated` through all six steps of the root CLAUDE.md checklist |

Three decisions in that slice worth carrying forward:

- **The rule form offers no subject.** A harness supervisor has no workload attribution, and the Go
  verifier refuses the *entire set* rather than let a subject-scoped rule silently never match — so
  offering the choice would be offering a way to take the whole policy down. `subject` is fixed at
  `any`, and the warning explains what would happen if it were not.
- **`parseHarnessKindConfig` validates through the same function the signer uses**, so a config that
  stores cleanly can never be one the signer later refuses. Otherwise an admin ends up with a saved
  policy that silently never ships.
- **A parse failure refuses to build a payload**, and the panel says so instead of rendering an
  empty config. A malformed stored config silently becoming the default would drop every deny rule
  *and* replace `explicit` with `observe` — enforcement turned off by a parse error nobody sees.

Fixed in passing: `proxy.config_updated` had been in the catalog and the docs since the proxy kind
shipped but had no entry in the dispatcher's `RENDERERS`, so it was subscribable, deliverable as a
webhook, and silently never reached a notification channel — exactly the gap the root CLAUDE.md
checklist warns about.

**Not built:** Linux and Windows backends (§6), allow-list confinement, network confinement (it
needs tier C wired, and denying egress without a working proxy simply breaks the harness), a signed
`kindConfig` (§12), `assist` mode, session delegation, and every harness but Claude Code.

**Depends on:** [`PROXY_ARCHITECTURE.md`](PROXY_ARCHITECTURE.md) — this is a third role in the same
binary and reuses its decision path, its artefacts and its spool verbatim. Read §2 (the
interception-point pattern), §10 (the decision pipeline) and §11 (the identity ladder) first;
everything here is stated as a delta against them.

**Goal:** govern a coding harness — Claude Code first, then Codex / OpenClaw / Hermes — at the
*tool-call* boundary, so that file reads, file writes and command execution are decided by the same
certificates that already decide network egress.

## 1. Why a second interception surface

The tier-1 CONNECT proxy sees `CONNECT api.anthropic.com:443`. A coding harness's dangerous actions
are `Bash("rm -rf ~")`, `Write("/etc/hosts")`, `Read("~/.ssh/id_ed25519")` — they never reach the
wire, or reach it only as a side effect of a child process. No amount of work on the network path
reaches them.

The tool-call boundary does, and it has the opposite properties to the network one:

| | Network (`intercept`) | Tool call (`supervise`) |
|---|---|---|
| Sees | host + port | tool name and **every argument** |
| Reaches | anything with a socket | only what the harness routes through it |
| Integrity | the agent cannot avoid the socket | the agent can rewrite the config that governs it |

So neither surface subsumes the other, and the honest framing is **one layer decides, two layers
guarantee**:

| Tier | Where | Sees | Agent can bypass? |
|---|---|---|---|
| **A — harness hook** | pre-tool-execution, in the harness | intent | yes — config tampering, `bash -c` |
| **B — OS confinement** | kernel | paths, syscalls, sockets | no |
| **C — egress proxy** | loopback, §8 of the proxy doc | host:port, and at tier 2 MCP/LLM bodies | no |

Tier A is the only layer with semantics. Tiers B and C are the only ones with integrity. **Until
tier B exists, supervision is advisory** — §7 says what that obliges us to do about it.

## 2. What already exists and is reused unchanged

This is most of the work, and it is done:

| Component | Reused as |
|---|---|
| `sdk-go/grant` | packcert verification + the pinned control-plane anchor. Identical. |
| `sdk-go/authz` | `Resolve` over the held certificates. Identical — including `CertScope.resourcePattern`'s trailing `*`, which already expresses `file:///Users/fx/repo/*`. |
| `internal/intercept/store.go` | `Store` verifies both artefacts against the anchor and reloads them. Identical. |
| `internal/intercept/decide.go` | rules-then-certificate, `MaxStatusAge`, `FailClosed`, the `Outcome` shape. Reused **structurally**, see §3. |
| `internal/intercept/spool.go` | the durable audit spool, gap markers included. Identical. |
| `cmd/sensor/intercept.go` | the provisioning and fail-loudly-at-startup pattern. Copied in shape. |

`startIntercept` provisions entirely from local token files (`AnchorPath`, `GrantPath`,
`RuleSetPath`, `SpoolPath`). The proxy doc's own claim is that a point provisioned from files
behaves identically to one that received an `actor_config` push. That is what lets phases 0–2 ship
with zero control-plane work.

## 3. Rules were host-shaped — resolved in phase 3

**Status: built.** `rules.ResourceRule` now exists alongside `rules.Rule`, in the same signed
`Set`, with `EvaluateResource` mirroring `Evaluate`'s deny-overrides precedence exactly. The
original problem and the reasoning are kept below because the shape of the answer follows from it.

Two rule lists, not one type with two optional halves: the tier-1 proxy has a host and port and no
URI, the supervisor has a URI and no host, and a rule carrying both would have a meaning nobody has
defined. One signed set still carries both, so an admin's policy stays a single artefact with one
signature and one version. `resourceRules` is `omitempty`, so a network-only set encodes exactly as
it did before — the existing conformance fixture verifies unchanged.

`MatchResource` is deliberately stricter than `CertScope.resourcePattern`'s matcher: an exact URI,
or a prefix ending in `/*` meaning that path and everything beneath it (the path itself included).
`file:///a/b*` is **refused at load**, not interpreted, because a rule's `allow` bypasses the
certificate entirely — the same argument `MatchHost` makes for hostnames, now made in three places.

**The floor is now a fallback, not an absolute.** A signed rule is consulted first and can allow as
well as deny, so an admin who deliberately signed "this agent may read `~/.aws`" gets it; the floor
then runs for anything no rule matched, because it is the only deny source a deployment has before
someone provisions a rule set — which is every deployment today. Unsigned local config must not be
able to overrule a signed decision in either direction.

**An authoring trap, found while building it and now warned about.** On macOS `/etc`, `/var` and
`/tmp` are symlinks into `/private`, and the supervisor canonicalizes every path before comparing —
which is what stops `../` and symlink escapes. So a rule written `file:///etc/*` verifies, loads,
and matches nothing there. `proxyResourceRuleWarnings` warns at authoring time rather than
rejecting, since `/etc` is real on Linux and the control plane does not know the target host's OS.
The reliable workflow is to copy the pattern from `vaultysclaw-sensor report`, which prints the
resolved form the matcher actually sees.

### The original gap (retained for the reasoning)

`rules.Rule` is `{ID, Subject, WorkloadID, Hosts []string, Ports []int, Effect}`, matched by
`MatchHost`. There is **no resource form**, so a signed rule set cannot today express
`deny file:///Users/fx/.ssh/*`. `Decide` is therefore reused as a *shape*, not called directly.

Two options, and the plan takes the second:

- **Extend `rules.Rule` now** with a resource-pattern form. This touches `sdk-go/rules`,
  `packages/controlplane/lib/proxy-rules.ts` and `conformance/rules-fixture.json` — all three
  sides, under the repo's "never change a fixture on one side only" rule. Correct, but it front-loads
  cross-language work before we know what the resources actually look like.
- **Ship phases 0–2 with certificate scope only** (allow-lists), plus a small **local safety floor**
  (§4.3). Extend the rule format in phase 3, once real traffic has told us the resource grammar.

The safety floor is deny-only and can only make a decision stricter, which is why it is defensible
as unsigned local config. Anything that could *widen* a grant stays in signed artefacts, always.

## 4. Phase 0 — observe (the first thing to build)

`vaultysclaw-sensor supervise -- claude`

Launches the harness as a child, with a `PreToolUse` hook wired to a resident daemon. Every tool
call is decided and recorded; **nothing is ever refused.** Ship this and run it against real daily
sessions for at least a week before writing a deny path.

The point of the phase is not enforcement. It is to learn the resource grammar before freezing it,
because the resource string is a wire format that ends up inside signed certificates.

### 4.1 New package `internal/supervise`

| File | Responsibility |
|---|---|
| `daemon.go` | unix-socket server, one decision per request, resident for the session's lifetime |
| `hook.go` | the shim the harness executes: reads the harness's JSON on stdin, round-trips the socket, writes the harness's decision JSON on stdout |
| `map.go` | `MapToolCall(tool string, input json.RawMessage) (authz.RequestedAction, error)` — §4.2 |
| `launch.go` | child-process launch, config injection, and the §7 pre-flight verification |
| `decide.go` | the `Decide` analogue: safety floor → certificate → outcome |

`cmd/sensor/supervise.go` wires it, mirroring `startIntercept` including its fatal-not-degraded
posture.

### 4.2 The capability mapping

Reuse the existing vocabulary, with one addition decided in §4.2.1.

| Tool | Capability | Resource |
|---|---|---|
| Read / Glob / Grep | `file_read` | `file:///abs/path` |
| Edit / Write / NotebookEdit | `file_write` | `file:///abs/path` |
| Bash | `code_execution` | `exec://<argv0>` |
| WebFetch | `internet_access` | `https://host/path` |
| WebSearch | `knowledge_search` | `websearch://` |
| `mcp__<server>__<tool>` | `api_call` | `mcp://<server>/<tool>` |
| Task / subagent | `agent_communication` | `agent://<subagent>` |
| TodoWrite, ExitPlanMode, AskUserQuestion | — | reaches no resource; see below |

Three deliberate omissions from the resource strings, each because the value would land verbatim in
the audit spool and in any scope suggested from it, and none of them is what an admin scopes on: a
**WebFetch query string and fragment** (tokens, session ids), its **userinfo** (credentials), and a
**WebSearch query** — which is why every search is the single resource `websearch://`, answering the
only question an admin actually has about it.

`mcp://<server>/<tool>` is the same shape [`PROXY_ARCHITECTURE.md`](PROXY_ARCHITECTURE.md) §10's
tier-2 `mcp` adapter produces, so a certificate scoped to `mcp://github/*` means the same thing
whether the call was seen at the tool boundary or on the wire — and "the tool list is the
certificate" becomes reachable without TLS inspection.

**A tool that reaches no resource is not a coverage gap.** `ErrNoResource` is distinct from
`ErrUnmapped` and counted separately, because a tool that will never need a mapping would otherwise
sit in the backlog forever, quietly turning "how much is still ungoverned" into a number that only
goes up. Each entry in that list is a claim that the tool touches nothing, and a wrong claim is a
permanent silent hole — so the list is short and each entry carries its own argument.

Paths are resolved to absolute and symlink-resolved **before** matching, or the scope check is
defeated by `../`. That resolution is part of the mapping, not of the caller.

**Bash is deliberately weak here.** `exec://<argv0>` does not survive `bash -c "curl … | sh"`, and
no amount of command-string parsing makes it a security boundary. Bash is gated coarsely at tier A
for intent and audit; the real control over what a shell child does is tiers B and C. The plan says
this out loud rather than shipping a parser that looks like enforcement.

### 4.2.1 Splitting `file_access`

`file_access` carries no verb, and "may read the repo, may not write it" is the first thing anyone
will ask for. Split it into **`file_read`** and **`file_write`**, both built-ins.

The verb goes in the **capability**, not in the resource. Encoding it as `fileread:///…` /
`filewrite:///…` was considered and rejected: a certificate carries `capabilities` (plural) but a
single `scope` (`Certificate.Scope *CertScope`, `sdk-go/authz/resolve.go`), so putting the verb in
the resource makes read-and-write *always* two certificates, including for the most ordinary grant
there is. It also gives one file two names, so any audit view grouping by resource splits reads from
writes; and it invents a URI scheme whose grammar and normalization we would then own. Every other
capability in the catalog already carries its verb — `process_read`, `mail_send`, `code_execution`
— so `file_access` was the outlier, not the pattern.

**Migrate by expanding at issuance, never by implying at resolution.** The control plane writes both
narrow names into new certificates; `file_access` stays valid for certificates already in the field
and is withdrawn from the issuance UI. `resolvePermission` / `Resolve` are **not** taught that
`file_access` implies `file_read` — that would change the decision function on both sides and need
new `conformance/permission-vectors.json` cases to buy what the issuance path does for free.
`hasCapability` stays an exact match.

Work items: `BuiltinCapability` + `BUILTIN_CAPABILITIES` in `packages/policy/src/types.ts`; the
`sdk-go` mirror; the issuance UI's capability list; the expansion at the issuance site. No change to
either resolver, and no conformance-vector churn.

### 4.2.2 Reserve `core` and `vaultys` as vendor names

Not a rename — a fence. `core` is a legal vendor under `CUSTOM_CAPABILITY_RE` today, so a deployment
can register `core:anything` and squat a namespace we may later want.

Namespacing the built-ins themselves as `core:file_read` was considered and rejected. The colon is
load-bearing exactly because no built-in contains one: it is what stops a custom name from shadowing
a present or future built-in. Under `core:`, a name satisfies **both** `isBuiltinCapability` and
`isCustomCapability`, and `filterAgainstRegistry` — which runs before every `cert_status_response`
is signed (`lib/ws-server.ts`) — would read a built-in as an unregistered custom name and drop it.
That is the mass-revoke hazard from CLAUDE.md, triggered by a rename, on every holder at once. The
UI can badge built-ins as "core" without the wire name changing.

So: add a reserved-vendor check to `assertValidCapabilityName`, mirror it in `sdk-go/capability`,
and add the cases to `conformance/capability-names.json` — that table decides which names a
deployment can ever register, so the cases go in first and both sides are made to pass.

### 4.3 The safety floor

A deny-only local list — `~/.ssh`, `~/.aws`, `~/.config/gcloud`, the harness's own config directory,
the sensor's own `GrantPath`/`AnchorPath`. Unsigned, because it can only ever refuse. It is a
seatbelt, not policy, and the config comment must say so.

### 4.4 Audit

Reuse `intercept.FileSpool`. `intercept.Event.Destination` is a plain string and holds a resource
URI fine, but the field is destination-shaped; add `Tool` and rename to a neutral `Resource` in the
same change, updating the proxy's writer. One spool, one event shape, both roles.

### Done when

The spool, after a week of real sessions, contains every tool call with a resolved capability, a
resolved resource, and the decision that *would* have been taken — and reading it answers "what
scope would this human's certificate actually need?" without guesswork.

## 5. Phase 1 — enforce, `explicit` mode

Add `mode: explicit` to the `supervise` config block: any tool call not covered by a certificate is
refused. `observe` stays the default, for the same reason `Intercept.Enabled` defaults false — a
component that has always been passive must not start refusing things because it was upgraded.

Scope: `file_access` and `code_execution` only. The others still fall through to `observe`
behaviour, and the startup banner must list which capabilities are actually being enforced.

### The denial channel

A denial is returned to the harness as a structured reason that reaches the model's context:
`denied: file_access not granted for file:///etc/hosts`. This is a design decision, not a log line —
a bare failure makes the agent retry-loop, a reasoned one makes it route around. The deny message
is a prompt.

### Done when — the demo

Grant: `file_access` scoped `file:///Users/fx/repo/*`, `code_execution` unscoped. Mode `explicit`.

1. Edit a file in the repo → allowed, spooled with the granting cert id.
2. Read `~/.ssh/id_ed25519` → denied **by the safety floor**.
3. Read `~/Documents/other/x` → denied **as out of scope** — a visibly different reason from (2).
4. `git status` → allowed.
5. `curl https://example.com` → allowed at tier A (`code_execution` held), and **refused by tier C**
   once phase 2 lands. Before phase 2 it simply succeeds — that gap is the whole argument for §6.
6. Same grant in `observe` mode → all five proceed, all five spooled with the counterfactual.

Distinct reasons per outcome is the acceptance criterion, exactly as it was for the tier-1 proxy.

## 6. Phase 2 — tier B, the part that makes it true

Launch the harness confined, by the supervisor that already owns the process:

| Platform | Mechanism |
|---|---|
| macOS | `sandbox-exec` seatbelt profile: deny `file-write-*` outside the workspace, deny network except the loopback proxy |
| Linux | user namespace + bwrap bind-mounts, Landlock for path rules, seccomp, per-cgroup nftables redirect into tier C |
| Windows | restricted token / AppContainer + a WFP filter |

Start with one platform end to end rather than three half-built. Egress from the confined process is
forced into the **existing** tier-1 proxy, so `internet_access` and `allowedDomains` cover the
harness's child processes with no new enforcement code.

This is also where §4.2 of the proxy doc applies double: launching someone else's processes in a
sandbox you control, with a hook reading every tool call, looks exactly like malware. Loud,
consented, visible.

### A profile that denies the harness itself is a refusal, not a launch

A deny wide enough to cover the harness binary makes the launch impossible, and the way it surfaces
unaided is `sandbox-exec: execvp() of '…/claude' failed: Operation not permitted` plus an exit code
— naming neither the deny list nor the rule behind it, while the supervisor's own preceding log line
correctly reports that confinement is in force. So the supervisor checks before launching and
refuses with the offending entry named.

`deny file:///Users/someone/*` is the way in. It reads as "keep the agent out of that home
directory" and is also, to the kernel, a deny on `~/.local/bin/claude`, the harness's state
directory and its caches. The profile is deliberately **not** adjusted to let the exec through:
carving the harness path out of an admin's signed deny would enforce something nobody authored, and
the operator would never learn their rule means more than they think.

The check tests the exec path in three forms — as written, with its directory resolved but the final
component left alone, and fully resolved. A harness is normally launched through a symlink
(`~/.local/bin/claude` → `~/.local/share/claude/versions/…`), so resolving first and checking only
the result reports such a launch as fine and then leaves the kernel to refuse it. The middle form is
the load-bearing one: `exec` traverses the directory the link sits in whatever the leaf points at.

## 7. Anti-tamper, and the advisory caveat

Three requirements, all cheap, all in phase 0:

1. Register the hook from the harness's **managed/enterprise** settings location, which outranks the
   user settings the agent can write.
2. **Refuse to launch** if the effective harness config does not show the hook live — the same
   fatal-not-degraded posture `startIntercept` takes when a grant is missing.
3. Once tier B exists, deny writes to the harness config directory. Until then, it is in the safety
   floor.

Until phase 2, the startup banner, the config comments and any UI must say **advisory** in the same
voice `startIntercept` uses for a negative `maxStatusAgeSeconds`. An operator who believes they are
enforcing something must not be quietly wrong.

## 8. Phase 3 and beyond

| Phase | Scope |
|---|---|
| 0.5 | The §4.2.1 `file_read`/`file_write` split and the §4.2.2 reserved vendors. Small, and it must land before any certificate is issued for this role. |
| ~~3a~~ | ~~Resource-form rules across `sdk-go/rules`, `lib/proxy-rules.ts` and `conformance/rules-fixture.json`~~ — **built**, see §3. |
| ~~3b~~ | ~~WebFetch, MCP and subagent mapping~~ — **built**, see §4.2. |
| ~~5a~~ | ~~The `harness` kind on the control plane, its panel, and the signed rule set it pushes~~ — **built**. |
| ~~5b~~ | ~~The supervise role's control-plane connection, so `actor_config` is received rather than hand-provisioned~~ — **built**, see §12 below. |
| 4 | `assist` mode: a denial raises an approval to the human through the portal, answered live. |
| 5 | The `harness` kind on the control plane, its panel, and `actor_config` push — replacing file provisioning. Zero new tables (§12 of the proxy doc). |
| 6 | **Per-session delegated certificates** (§9). |
| 7 | Codex, OpenClaw, Hermes shims onto the same daemon. |

## 9. Identity: this role climbs the ladder the proxy could not

The proxy resolves its subject by socket→PID — §11 rung 3, explicitly "non-cryptographic, a local
root attacker can lie". The supervisor **is the parent process**, so attribution is structural.

That unlocks what the schema is already waiting for. A human launches the harness; the supervisor
obtains a **session certificate delegated from that human's own certificate**, scoped narrower and
time-boxed to the session. `delegatedByDid`, `parentCertId`, `parentCertHash` and the
`non_delegatable` marker all exist today as groundwork. The claim it buys — *the agent can never
exceed the human who launched it, and the certificate proves it* — is the reason this role is worth
building rather than bolting more rules onto the proxy.

Deliberately phase 6: it needs the `delegation` certificate format, which nothing issues yet.

## 10. Open questions

- **Is `exec://<argv0>` worth having at all**, or should Bash be one coarse capability with the
  honest note that tier B is the control? Phase 0's spool answers this empirically.
- **Where does a session certificate come from when the host is offline?** The proxy never had to
  ask, because its identity is the host's.
- **Should a resource rule be able to carry a subject the supervisor can satisfy?** Today
  `AttributionAvailable: false` makes the Store refuse a set containing one, because this role has
  no workload vocabulary — even though it knows its subject structurally, having launched the
  harness. Giving it one would make `subject: workload` rules usable here, and is the natural
  companion to session delegation (§9).

## 11. Non-goals

- Parsing shell command strings and treating the result as a security boundary.
- Supporting every harness at tier A. Some have no pre-execution hook; those get tiers B and C only,
  and the console must show a **governed-surface indicator per harness** that says so honestly.
- A second capability vocabulary. If a tool call cannot be expressed as an existing capability plus a
  resource, that is a finding to bring back to `packages/policy`, not a local extension.


## 12. Receiving the push, and why the unsigned half can only tighten

`actor_config` reaches the supervisor over an optional control-plane connection
(`supervise.controlPlaneUrl`). The message has two halves with completely different trust
properties, and the whole of this section is about not treating them alike — which is the defect
[`PROXY_ARCHITECTURE.md`](PROXY_ARCHITECTURE.md) §9 records in the superseded proxy implementation,
which "wrote whatever arrived on the socket straight into its local database and enforced it".

| Field | Signed? | Treatment |
|---|---|---|
| `grantToken`, `ruleSetToken` | **yes**, verified offline against the pinned anchor | written to the same paths a hand-provisioned host uses; the existing `Store` verifies them identically |
| `kindConfig`, `trust` | **no** — whoever reaches the socket chooses the contents | applied as a ratchet: may make this host stricter, never looser |

Without the ratchet, the obvious implementation hands anyone who can reach the socket a switch
labelled *stop enforcing*: push `mode: observe, sandbox: off` and the host keeps running, keeps
reporting, and refuses nothing. So an unsigned setting is applied only when it raises strictness
(`observe` < `explicit`; `off` < `auto` < `require`; and for `maxStatusAgeSeconds` the ordering is
**not numeric** — `0` is the strictest value and a negative is unbounded, the same inversion the
proxy doc records getting backwards once already). Anything that would loosen is refused **and
logged loudly**, because a push that silently did not take effect is indistinguishable from one that
did.

The asymmetry has a real cost: an admin whose `explicit` mode is breaking someone's work cannot lift
it from the console, and has to touch that host's config. That is the right trade anyway — relaxing
enforcement over an unauthenticated channel *is* the attack, and a console button that performs it
is the attack with a nicer label. The failure mode here is "an admin has to SSH somewhere"; the
failure mode of the alternative is "supervision silently stopped and the console still says it is
on".

**`kindConfig` is now signed** — `actor_config` carries a `kindConfigToken` alongside the plain
copy, signed with the same `signCert` envelope as the grant and the rule set and verified offline
against the same pinned anchor. When it verifies, the settings are **authoritative in both
directions**: an admin can relax a host from the console, because a signature is what separates
their decision from anyone else's. The ratchet above survives only as the fallback for a control
plane that sends no token, and the supervisor says so when it takes that path.

A token that fails verification is an error, never a fallback to the unsigned copy: the two are
identical in content, so quietly accepting the unsigned one after a signature failure would make
forging a configuration no harder than corrupting one byte of the real one.

Pinned by `conformance/kindconfig-fixture.json`, which exists because of a specific near-miss. The
unsigned copy arrives as JSON and the signed one as the msgpack body `signCert` wraps — the same
fields in two encodings. The Go struct originally carried only `json:` tags, so the msgpack decode
produced a struct of nil pointers; every field being a pointer, nil reads as *absent*, and absent is
applied as *no change*. A valid signed configuration would have verified, decoded, and silently done
nothing, with no error on either side.

### What a policy change requires

Everything the decider reads is read **per decision**, not captured at launch — the certificate and
rules from the `Store`, mode and the staleness bound from `Settings`. So:

| Change | Takes effect |
|---|---|
| A resource rule (add, edit, remove) | **the next tool call** |
| A new or revoked certificate | **the next tool call** |
| `mode` — observe ⇄ explicit | **the next tool call** |
| `maxStatusAgeSeconds` | **the next tool call** |
| `sandbox`, and the *kernel-enforced half* of a `deny file://…` rule | the next launch |

Only OS confinement needs a restart, and not for want of trying: a seatbelt profile is applied to a
process at exec time and a running process cannot be re-confined. A file deny rule is therefore live
at the tool boundary immediately while its sandbox half waits — which is why the supervisor names
that case specifically instead of saying "settings changed, restart". Telling an operator to restart
for a change that already applied is how they learn to ignore the line that matters.

#### A launch waits for the first push

That "the next launch" row makes the launch itself load-bearing, which is why `supervise` waits for
the control plane's first `actor_config` before it compiles the profile and starts the harness
(`startupSyncTimeoutMs`, default 3000, 0 to disable).

Without the wait, the profile is compiled from whatever rule set is on disk and the push that lands
milliseconds later updates tier A only — so a session runs kernel-confined by the *previous* policy
while the console shows the current one. That failure is close to undiagnosable from the inside: a
seatbelt denial reaches the agent as a bare `EPERM` with no reason string, so a rule an admin deleted
yesterday looks exactly like a path the sensor refuses by construction. The startup log now prints
the compiled `denyAll`/`denyWrite` lists for the same reason — it is the only place a kernel refusal
can be attributed to the rule or floor entry that caused it.

The wait is bounded and non-fatal in every direction: an unreachable control plane, or an Actor with
no certificate yet, receives no push at all and must still launch on the artefacts it already
verified against the pinned anchor. A timeout says what it costs — tier A current, tier B possibly
one policy behind until the next launch — rather than warning generically.

## 13. Where rights live

`config.yaml` carries **transport and bootstrap only** — paths, the control-plane URL, the pinned
anchor. It is not where a deployment expresses policy:

| | Source of truth |
|---|---|
| What the agent may do | the **certificate** — capabilities and `CertScope` |
| What is denied outright | **signed resource rules**, authored in the console |
| Enforcement posture (mode, confinement) | the **signed `kindConfig`** |
| Paths, URL, anchor | `config.yaml` |
| The safety floor | `config.yaml`, as a default net — see below |

Signed `deny file://…` rules now also become **kernel-enforced denies** in the tier-B profile, so an
admin authors a deny once and gets both the reasoned refusal at the tool boundary and the
unbypassable one. Non-file schemes are skipped there: the kernel cannot enforce "may not call this
MCP tool".

**The floor is a union with signed rules, not something they replace** — and that distinction was
got wrong once during this work before a test caught it. Making the floor step aside once a rule set
exists means an admin adding `deny exec://docker` silently drops the `~/.ssh` protection nobody knew
they were relying on. *Adding policy must never remove protection.* The floor is still liftable
without being optional: signed rules are evaluated first, so an `allow` rule settles the call before
the floor is reached.

Two more properties, both verified: **a null token clears nothing** (the control plane sends null
when it has nothing to give, and erasing a working artefact because an unauthenticated message said
nothing is a denial of service anyone on the socket could perform), and **an unreachable control
plane changes nothing** — a supervisor is fully governed by artefacts it already verified offline,
so putting console availability on the critical path of a decision designed not to need it would be
backwards.