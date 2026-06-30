#!/usr/bin/env node
/**
 * vaultysclaw — CLI for agent identity, policy, intent and audit.
 *
 * Connects to the control plane using a VaultysId-based session (no API keys):
 *   vaultysclaw login
 *   vaultysclaw agent create --name billing-bot --realm finance
 *   vaultysclaw policy grant billing-bot --allow read_database --window "Mon-Fri 09:00-17:00"
 *   vaultysclaw intent run billing-bot --action delete_database
 *   vaultysclaw audit tail --last 1
 */

import { Command } from "commander";
import { setJsonMode } from "./lib/output.js";
import { ApiError } from "./lib/http.js";
import { registerAuthCommands } from "./commands/login.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerPolicyCommand } from "./commands/policy.js";
import { registerIntentCommand } from "./commands/intent.js";
import { registerAuditCommand } from "./commands/audit.js";

const program = new Command();

program
  .name("vaultysclaw")
  .description("VaultysClaw control-plane CLI — give agents a passport, not a password")
  .version("0.0.1")
  .option("--json", "machine-readable JSON output", false)
  .option(
    "--url <url>",
    "control plane URL (overrides config / VC_CONTROL_PLANE_URL)"
  )
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<{ json?: boolean; url?: string }>();
    if (opts.json) setJsonMode(true);
    if (opts.url) process.env.VC_CONTROL_PLANE_URL = opts.url;
  });

registerAuthCommands(program);
registerAgentCommand(program);
registerPolicyCommand(program);
registerIntentCommand(program);
registerAuditCommand(program);

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg =
    err instanceof ApiError
      ? `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(` ✗ ${msg}`);
  process.exit(1);
});
