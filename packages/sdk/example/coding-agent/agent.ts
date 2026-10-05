/**
 * A coding agent whose authority comes from VaultysClaw, not from its prompt.
 *
 * agent = model + harness. The model (Claude) decides; this file is the harness: it owns the
 * loop, the tools, the history, and — the point of the example — the gate in front of every
 * tool call. The agent is an Actor with its own VaultysId: an admin approves it, chooses what it
 * may do, and can narrow, revoke or suspend that at any time; the next tool call feels it.
 *
 *   VC_WORKSPACE=/path/to/repo pnpm --filter @vaultysclaw/sdk example:agent "Add a like button to posts"
 *
 * Env:
 *   VC_WORKSPACE             repository the agent works in (default: cwd)
 *   VC_TEST_CMD              test command, split on spaces (default: "pnpm test")
 *   VC_CONTROL_PLANE_WS_URL  default ws://localhost:8081
 *   VC_ACTOR_NAME            default "coding-agent"
 *   VC_MAX_TURNS             model calls before handing back to the human (default 40)
 *   VC_MAX_TOKENS            input+output tokens for the whole task (default 2,000,000)
 *   VC_AUTO_APPROVE=1        skip the terminal confirmation for writes and execution
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ActorRuntime } from "../../src/index.js";
import { Guard } from "./guard.js";
import { TOOLS, execute, toGateRequest, type ToolContext } from "./tools.js";

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('usage: example:agent "<task>"');
  process.exit(2);
}

const workspaceRoot = fs.realpathSync(process.env.VC_WORKSPACE ?? process.cwd());
const name = process.env.VC_ACTOR_NAME ?? "coding-agent";
const stateDir = path.join(os.homedir(), ".vaultysclaw", name);
const maxTurns = Number(process.env.VC_MAX_TURNS ?? 40);
const maxTokens = Number(process.env.VC_MAX_TOKENS ?? 2_000_000);
const ctx: ToolContext = {
  workspaceRoot,
  testCommand: (process.env.VC_TEST_CMD ?? "pnpm test").split(/\s+/).filter(Boolean),
};

// ── Identity and grant ───────────────────────────────────────────────────────────────────────

const actor = new ActorRuntime({
  name,
  kind: "openclaw",
  controlPlaneWsUrl: process.env.VC_CONTROL_PLANE_WS_URL ?? "ws://localhost:8081",
  identityPath: path.join(stateDir, "identity.secret"),
  capabilityStatePath: path.join(stateDir, "capabilities.json"),
  // A request. The admin decides — and should scope each one, e.g. file_write to
  // `file:///path/to/repo/src/*` and code_execution to `exec://pnpm`.
  requestedCapabilities: ["file_read", "file_write", "code_execution"],
  logger: { debug() {}, info() {}, warn: console.warn, error: console.error },
});

actor.on("pending", ({ registrationId }) =>
  console.log(`[vaultysclaw] waiting for an admin to approve "${name}" (registration ${registrationId})`)
);
actor.onCapabilityChange(({ reason, current }) =>
  console.log(`[vaultysclaw] ${reason}: holding [${current.join(", ") || "nothing"}]`)
);

const guard = new Guard(actor, {
  workspaceRoot,
  tracePath: path.join(stateDir, "traces", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`),
  confirm: new Set(process.env.VC_AUTO_APPROVE === "1" ? [] : ["file_write", "code_execution"]),
});

await actor.start();
console.log(`[vaultysclaw] ${name} is ${actor.getDid()}`);
await waitForGrant(actor, 10 * 60_000);

// ── The loop ─────────────────────────────────────────────────────────────────────────────────

const client = new Anthropic();
const system = [
  "You are a coding agent working in a repository. Use the tools to inspect and change it.",
  "Your permissions are enforced outside of you by VaultysClaw. When a tool result says an",
  "action was denied, do not retry it or look for a workaround: continue with what you are",
  "allowed to do, or stop and explain what permission you would need and why.",
  "When the change is done, run the tests. Finish with a short summary of what you changed",
  "and how you verified it.",
].join(" ");

const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
let tokensUsed = 0;
let consecutiveTestFailures = 0;
let outcome = "max_turns";

guard.note("task_started", { task, workspaceRoot, did: actor.getDid() });

for (let turn = 1; turn <= maxTurns; turn++) {
  if (guard.suspended) {
    outcome = "kill_switch";
    break;
  }
  if (tokensUsed >= maxTokens) {
    outcome = "token_budget";
    break;
  }

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "high" },
    system,
    tools: TOOLS,
    messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  guard.note("model_turn", { turn, stop_reason: response.stop_reason, tokensUsed });

  for (const block of response.content) {
    if (block.type === "text" && block.text.trim()) console.log(`\n${block.text}`);
  }
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason === "end_turn") {
    outcome = "done";
    break;
  }
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    outcome = response.stop_reason;
    break;
  }

  const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const results: Anthropic.ToolResultBlockParam[] = [];

  for (const call of calls) {
    const input = call.input as Record<string, string>;
    const gate = toGateRequest(ctx, call.name, input);
    if (!gate) {
      results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `unknown tool ${call.name}` });
      continue;
    }

    const decision = await guard.check(gate);
    if (!decision.allowed) {
      console.log(`[denied:${decision.layer}] ${gate.summary} — ${decision.reason}`);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        is_error: true,
        content: `DENIED by ${decision.layer}: ${decision.reason}`,
      });
      continue;
    }

    console.log(`[allowed] ${gate.summary}`);
    try {
      const output = await execute(ctx, gate, input);
      if (gate.tool === "run_tests") {
        consecutiveTestFailures = output.startsWith("exit 0") ? 0 : consecutiveTestFailures + 1;
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: output });
    } catch (err) {
      results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: String(err) });
    }
  }

  messages.push({ role: "user", content: results });

  // Retrying is what an agent is for; retrying the same failure is not. Hand back to the human.
  if (consecutiveTestFailures >= 5) {
    outcome = "stuck_on_tests";
    break;
  }
}

guard.note("task_finished", { outcome, tokensUsed });
console.log(`\n[harness] outcome=${outcome} tokens=${tokensUsed}`);
actor.stop();
process.exit(outcome === "done" ? 0 : 1);

// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Resolves once a certificate is held. Starting without one would only produce denials. */
function waitForGrant(runtime: ActorRuntime, timeoutMs: number): Promise<void> {
  if (runtime.capabilities().length > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no certificate was issued in time")), timeoutMs);
    runtime.on("capabilities", (caps) => {
      if (caps.length > 0) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
