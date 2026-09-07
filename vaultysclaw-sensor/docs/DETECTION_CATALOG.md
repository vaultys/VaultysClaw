# The detection catalog

What the sensor recognises as AI is **data, not code** — including the defaults.
Five catalogs of rules live in
[`internal/config/default-catalog.yaml`](../internal/config/default-catalog.yaml),
compiled into the binary with `//go:embed`, and are extended by a second YAML
file that can be edited while the sensor is running.

Both files are the same format, parsed by the same code and held to the same
validation. Adding a provider upstream and adding one in a deployment are the
same edit; `catalog dump` output pastes straight back as a catalog.

| Catalog | Matches | Contributes |
|---|---|---|
| `providers` | remote hosts of a known AI API | AI confidence, and the reported provider |
| `aiApplications` | installed apps and CLIs, by process name / executable path / command line | AI confidence; `harness` also gives agent confidence |
| `localRuntimes` | locally-served models (Ollama, vLLM, llama.cpp, …) | AI confidence |
| `mcpServers` | MCP server command lines, on the process or a child | agent confidence |
| `agentFrameworks` | agent libraries in a command line (LangChain, CrewAI, …) | agent confidence |

`aiApplications` has three kinds, and the distinction is the point of the whole
design — AI *usage* is not an AI *agent*:

- **`harness`** — an agentic coding/automation tool that reads and writes files
  and runs commands (Codex, Claude Code, Cursor, aider, goose). AI **and** agent.
- **`assistant`** — a chat surface (Kimi, ChatGPT.app, Claude Desktop). AI only,
  the same line a browser tab sits on.
- **`ide`** — an AI-capable editor. **No** weight alone; "VS Code is installed"
  is not AI usage. It scores only when that same process is also talking to a
  provider, which is what an inline completion looks like from outside.

## The two files

| | |
|---|---|
| **Built-in defaults** | `internal/config/default-catalog.yaml`, embedded in the binary. Editing it changes what the project ships — reviewed as a normal diff, not buried in a Go composite literal. Don't edit it for one deployment. |
| **Your catalog** | `catalogPath` in config.yaml, or `VCS_CATALOG_PATH` (default `~/.vaultysclaw-sensor/catalog.yaml`). Merged additively over the defaults, reloaded without a restart. |

Detection rules can also still be set directly in `config.yaml` — but there they
**replace** the built-in catalog instead of extending it, because plain YAML
unmarshalling has no other behaviour available. That is almost never what
someone adding a rule wants, and the symptom is coverage quietly getting worse,
so the sensor names those keys at startup and points at the catalog. Nothing is
refused; a deployment that meant it keeps working.

## Adding a rule

New harnesses ship every few weeks. Adding one takes a file, not a release:

```bash
# The effective rule set, generated from the binary, so it can't drift from what
# the sensor actually uses. With no override in place this is the embedded
# default verbatim, comments and all — including the notes on which rules must
# precede which, and which tempting broad matcher was left out on purpose.
vaultysclaw-sensor catalog dump > ~/.vaultysclaw-sensor/catalog.yaml
```

You rarely need the whole document. A catalog is merged **additively** over the
built-ins, so a file containing only your additions is the normal way to use it:

```yaml
# ~/.vaultysclaw-sensor/catalog.yaml
providers:
  - name: acme_internal_llm
    hosts: ["llm.acme.internal", "api.acme-ai.com"]
  - name: openai                    # reusing a built-in name EXTENDS it
    hosts: ["api.eu.openai.com"]    # ...the other five hosts stay

aiApplications:
  - name: acme_devbot
    kind: harness
    processNames: ["devbot"]                 # exact, case-insensitive basename
    executableSubstrings: ["devbot.app/"]    # catches an app bundle's helpers
    cmdlineSubstrings: ["@acme/devbot"]      # for CLIs run via node/python

  - name: kimi_cli
    kind: harness
    priority: 10                    # evaluated before the built-ins
    cmdlineSubstrings: ["kimi-cli"]

agentFrameworks:
  - name: acme_orchestrator
    cmdlineSubstrings: ["acme-orchestrator"]

disable:                            # correct a built-in without forking it
  aiApplications: ["xcode"]
```

Then check what it does before deploying it:

```bash
vaultysclaw-sensor catalog check
```

```
catalog: /Users/you/.vaultysclaw-sensor/catalog.yaml (valid)

                   built-in effective
providers                38       39   added acme_internal_llm
aiApplications           31       32   added acme_devbot, kimi_cli; disabled xcode
localRuntimes            15       15
mcpServers                8        8
agentFrameworks          17       18   added acme_orchestrator
```

## Rules of the merge

- **Additive by default.** Adding one provider adds one provider. Plain YAML
  unmarshalling replaces slices wholesale, which is why the catalog is a
  separate file with its own merge rather than a key in `config.yaml`.
- **A name that already exists extends that rule.** Matcher lists are unioned
  and deduplicated; `kind` and `priority` are single-valued, so setting either
  overrides — the only way to reclassify a built-in.
- **`disable:` removes a built-in** by name, per catalog.
- **`priority` breaks ties.** The first matching application rule wins, and the
  built-in list is ordered most-specific-first (Claude Code lives inside
  Claude.app's tree; Codex inside ChatGPT.app's). A positive priority lifts your
  rule above them; equal priorities keep their order.
- **`replace: true`** makes the file the entire rule set. For a locked-down
  deployment that ships its own vetted list and does not want an upgrade to
  widen what the sensor looks at. Every omitted catalog is then genuinely empty.

## Reloading

The file is re-read when its mtime or size changes, checked once per poll cycle.
A valid change takes effect on the next cycle — no restart, no redeploy — and is
logged with the new counts:

```
INFO sensor: detection catalog reloaded catalog=... providers=39 applications=32 ...
```

An invalid catalog is **refused** and the running rule set kept, with the reason
logged. This is deliberate: the one failure mode a detection sensor must not
have is silently detecting less. Nothing latches, so a file caught mid-write
costs one cycle, and saving a fix recovers on the next one. Deleting the file
reverts to the built-ins, which is a legitimate way to back out a bad catalog.

Validation refuses rules that cannot work — an unnamed rule, a rule with no
matchers, an unknown `kind` — and matcher fragments under three characters,
which would match most of the process table and produce a flood of false
positives far harder to diagnose than a startup error.

## Why provider matching needs the IP index

On macOS and Windows the OS reports a bare peer IP for every connection, and the
major AI APIs publish no PTR record: `api.anthropic.com` is `160.79.104.10`, and
asking that address for its name returns nothing. Reverse DNS alone therefore
matches **no** provider on a laptop running Codex, Claude Code and Kimi.

So `internal/collector.ProviderIndex` resolves the `providers` catalog *forward*
every 15 minutes and inverts it into an IP→provider map, rebuilt immediately
when the catalog is reloaded. An IP-index hit is weighted below a hostname match
on purpose: CDN address space is shared, so it is good evidence of the provider,
not proof.

Hosts are matched as an exact name, as a suffix when the entry starts with a dot
(`.openai.azure.com`), or as a substring for a bare fragment (`bedrock-runtime`).
Only real names are forward-resolved; the pattern forms are skipped.

## Paths

| | |
|---|---|
| Catalog file | `catalogPath` in config.yaml, or `VCS_CATALOG_PATH` (default `~/.vaultysclaw-sensor/catalog.yaml`) |
| Built-in rules | [`internal/config/default-catalog.yaml`](../internal/config/default-catalog.yaml), embedded by [`catalog_default.go`](../internal/config/catalog_default.go) |
| Rule types | [`internal/config/config.go`](../internal/config/config.go) |
| Merge, validation, reload | [`internal/config/catalog.go`](../internal/config/catalog.go), [`watch.go`](../internal/config/watch.go) |
| Matching | [`internal/collector/apps.go`](../internal/collector/apps.go), [`software.go`](../internal/collector/software.go), [`dnsindex.go`](../internal/collector/dnsindex.go) |
| Weighting | [`internal/detector/ai.go`](../internal/detector/ai.go), [`agent.go`](../internal/detector/agent.go) |
