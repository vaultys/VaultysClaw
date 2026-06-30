import { Command } from "commander";
import { loadConfig, requireSession } from "../lib/config.js";
import { resolveAgent } from "../lib/agents.js";
import { rawApi } from "../lib/http.js";
import { ok, fail, sub, render } from "../lib/output.js";

interface IntentResponse {
  intentId: string;
  action: string;
  agent: string;
  decision: "ALLOW" | "DENY";
  reason?: string | null;
  sentTo?: string[];
  count?: number;
}

export function registerIntentCommand(program: Command): void {
  const intent = program.command("intent").description("Run intents against agents");

  intent
    .command("run <agent>")
    .description("Attempt an action on an agent (deny-by-default, audited)")
    .requiredOption("--action <action>", "action / capability to invoke")
    .option("--params <json>", "JSON params for the action", "{}")
    .action(
      async (agentRef: string, opts: { action: string; params: string }) => {
        const cfg = loadConfig();
        const session = requireSession(cfg);

        let params: unknown;
        try {
          params = JSON.parse(opts.params);
        } catch {
          throw new Error(`--params must be valid JSON (got: ${opts.params})`);
        }

        const agent = await resolveAgent(cfg.controlPlaneUrl, session.cookie, agentRef);

        const res = await rawApi<IntentResponse>(cfg.controlPlaneUrl, "/api/intents", {
          method: "POST",
          cookie: session.cookie,
          body: { agentId: agent.did, action: opts.action, params },
        });

        const data = res.data;
        const when = new Date().toISOString();

        if (res.status === 403 && data?.decision === "DENY") {
          process.exitCode = 1;
          render(
            {
              decision: "DENY",
              reason: data.reason,
              intentId: data.intentId,
              agent: agent.name,
              action: opts.action,
            },
            () => {
              fail(`DENIED  reason: ${data.reason} (deny-by-default)`);
              sub(
                `audit: intent_id=${data.intentId}  signed=ECDSA  who=${agent.name}  when=${when}`
              );
            }
          );
          return;
        }

        if (res.status >= 200 && res.status < 300 && data?.decision === "ALLOW") {
          const dispatched = (data.sentTo ?? []).length > 0;
          render(
            {
              decision: "ALLOW",
              intentId: data.intentId,
              agent: agent.name,
              action: opts.action,
              dispatched,
            },
            () => {
              ok(`ALLOWED  action "${opts.action}" → ${agent.name}`);
              sub(
                dispatched
                  ? `dispatched  intent_id=${data.intentId}  signed=ECDSA`
                  : `agent offline — decision recorded  intent_id=${data.intentId}`
              );
            }
          );
          return;
        }

        // Anything else is an unexpected error.
        process.exitCode = 1;
        const message =
          (data as { error?: string } | null)?.error ??
          `Unexpected response (${res.status})`;
        throw new Error(message);
      }
    );
}
