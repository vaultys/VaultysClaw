# vaultysclaw-hooks

OS-agnostic tool-call gate for coding harnesses. Design and rationale: `docs/HARNESS_HOOKS.md`.

```bash
go test ./...                                   # from this directory
go build -o vaultysclaw-hooks ./cmd/vaultysclaw-hooks
./vaultysclaw-hooks install --scope=user        # trial; --scope=machine (sudo) to actually govern
./vaultysclaw-hooks doctor
./vaultysclaw-hooks uninstall --scope=user
./vaultysclaw-hooks enroll --url=ws://localhost:8081 --control-plane-id=<base64> --scope=user
./vaultysclaw-hooks agent --scope=user          # then approve + issue a packcert in the console
```

## Layout

| Path | Role |
|---|---|
| `cmd/vaultysclaw-hooks` | CLI: `hook`, `install`, `uninstall`, `doctor`, `enroll`, `agent`. |
| `internal/adapter` | The **only** harness-specific layer: parse a payload into an `Event`, write a `Verdict` back. One sub-package per harness. |
| `internal/hook` | The hot path, run once per hook event. Decides pre-tool events with `sdk-go/toolgate`; everything else is audit only. |
| `internal/state` | Per-OS paths, `config.json`, and verification of the signed anchor/grant/rule set on every invocation. |
| `internal/install` | Writes/removes our registrations in each harness's settings; `Check` feeds `doctor`. |
| `internal/audit` | JSONL spool, one line per invocation, each with an `id`. |
| `internal/agent` | `enroll`, the push handler (`ApplyPush`), the spool `Outbox` and the `StatusRefresher`; never on a decision path. |

The decision itself is not here: it is `sdk-go/toolgate`, shared with `vaultysclaw-sensor`'s supervisor.

## Rules that must hold

- **Never answer "allow".** A non-denying verdict produces *no output*. In Claude Code a `PreToolUse`
  "allow" skips the user's permission prompt, so emitting it would turn this gate into a way of
  removing the harness's own approvals. Every adapter must keep this property.
- **Failure posture follows the mode.** Observe: anything broken passes silently, error recorded.
  Enforce: a pre-tool event that cannot be evaluated (bad payload, unverifiable policy, unreadable
  config, panic) is **refused**. An unreadable config is treated as enforce. Non-pre-tool events
  never block.
- **A present-but-unverifiable artefact is an error, never "no policy".** Dropping a rule set that
  fails to verify would silently drop every deny it carried.
- **Never write tool input, prompts or file contents to the audit spool** — only the decision and
  the resource. `TestAuditNeverContainsToolInput` pins it.
- **Uninstall removes exactly what install added.** Ours are recognised by the argument signature
  (`IsOurs`), not the binary name; a settings file that does not parse is never rewritten.
- **Tool names are toolgate's canonical (Claude Code) vocabulary.** A new adapter renames its
  harness's tools inside the adapter; it never adds a second mapping table.
- **A push is verified whole before any of it is written.** One bad token in an `actor_config`
  means nothing is applied; a nil token never erases a file. Unsigned settings only tighten.
- **Status comes from a signed response, and only narrows.** `status.token` is the control plane's
  signed `cert_status_response` for the *current* grant. Its status wins over the push (a non-active
  one is final), its capabilities are intersected with the grant's, and an unverifiable file is an
  error. The refresher never writes an older response over a newer one.
- **The spool is claimed, never read live.** Rename aside, wait out the grace period, delete only
  on ack. Records carry ids; the control plane dedupes on `(actorDid, eventId)`.

## Adding a harness

1. `internal/adapter/<vendor>/`: implement `adapter.Adapter`, register in `init`, import it from
   `cmd/vaultysclaw-hooks/main.go`.
2. `internal/install/<vendor>.go`: `Target` per scope (admin-managed location for machine scope),
   `Install`/`Uninstall`/`Check`.
3. Tests mirroring `internal/hook/hook_test.go` and `internal/install/install_test.go`.
4. Verify the hook format against the vendor's current release, and update the vendor table in
   `docs/HARNESS_HOOKS.md` §7 with what its hooks can and cannot see.
