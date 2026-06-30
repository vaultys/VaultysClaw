import { Command } from "commander";
import { loadConfig, requireSession } from "../lib/config.js";
import { resolveAgent } from "../lib/agents.js";
import { parseWindow } from "../lib/window-parse.js";
import { api } from "../lib/http.js";
import { ok, sub, render } from "../lib/output.js";

interface PolicyResponse {
  policy: {
    id: string;
    agentDid: string | null;
    capabilities: string[];
    resourceLimits: Record<string, unknown> | null;
    expiresAt: string | null;
  };
  sentTo: string[];
}

export function registerPolicyCommand(program: Command): void {
  const policy = program.command("policy").description("Manage agent policies");

  policy
    .command("grant <agent>")
    .description("Grant a narrow, signed capability to an agent")
    .requiredOption(
      "--allow <capability>",
      "capability to allow (repeatable, or comma-separated)",
      collect,
      [] as string[]
    )
    .option(
      "--window <spec>",
      'time window, e.g. "Mon-Fri 09:00-17:00" (stored & signed; not yet runtime-enforced)'
    )
    .option("--expires <iso>", "ISO-8601 expiry timestamp")
    .action(
      async (
        agentRef: string,
        opts: { allow: string[]; window?: string; expires?: string }
      ) => {
        const cfg = loadConfig();
        const session = requireSession(cfg);

        const capabilities = opts.allow
          .flatMap((c) => c.split(","))
          .map((c) => c.trim())
          .filter(Boolean);
        if (capabilities.length === 0) {
          throw new Error("At least one --allow <capability> is required");
        }

        const agent = await resolveAgent(cfg.controlPlaneUrl, session.cookie, agentRef);

        const resourceLimits: Record<string, unknown> = {};
        if (opts.window) {
          resourceLimits.timeWindow = parseWindow(opts.window);
        }

        const res = await api<PolicyResponse>(cfg.controlPlaneUrl, "/api/policies", {
          method: "POST",
          cookie: session.cookie,
          body: {
            agentDid: agent.did,
            capabilities,
            resourceLimits: Object.keys(resourceLimits).length ? resourceLimits : undefined,
            expiresAt: opts.expires,
          },
        });

        const pushed = res.sentTo.includes(agent.did);
        render(
          {
            policyId: res.policy.id,
            agent: agent.name,
            agentDid: agent.did,
            capabilities: res.policy.capabilities,
            timeWindow: (res.policy.resourceLimits as { timeWindow?: unknown } | null)
              ?.timeWindow ?? null,
            pushed,
          },
          () => {
            ok(`policy signed & ${pushed ? "pushed to" : "stored for"} ${agent.name}`);
            sub(`allow: ${res.policy.capabilities.join(", ")}`);
            if (opts.window) sub(`window: ${opts.window}`);
          }
        );
      }
    );
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
