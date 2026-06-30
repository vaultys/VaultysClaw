import { Command } from "commander";
import { loadConfig, requireSession } from "../lib/config.js";
import { createAgentIdentity, vidLabel } from "../lib/identity.js";
import { api } from "../lib/http.js";
import { ok, sub, render } from "../lib/output.js";

interface CreatedAgent {
  did: string;
  name: string;
  capabilities: string[];
}

export function registerAgentCommand(program: Command): void {
  const agent = program.command("agent").description("Manage agent identities");

  agent
    .command("create")
    .description("Give an agent a cryptographic identity (ECDSA keypair)")
    .requiredOption("--name <name>", "agent name")
    .option("--realm <slug>", "realm to attach the agent to")
    .option(
      "--allow <caps>",
      "comma-separated capabilities to grant at creation",
      ""
    )
    .action(async (opts: { name: string; realm?: string; allow?: string }) => {
      const cfg = loadConfig();
      const session = requireSession(cfg);

      // 1. Generate + persist a fresh keypair locally (the "passport").
      const identity = await createAgentIdentity(opts.name);
      const capabilities = (opts.allow ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      // 2. Provision the agent record on the control plane.
      const created = await api<CreatedAgent>(cfg.controlPlaneUrl, "/api/agents", {
        method: "POST",
        cookie: session.cookie,
        body: {
          did: identity.did,
          name: opts.name,
          publicKey: identity.publicKey,
          realmSlug: opts.realm,
          capabilities,
        },
      });

      render(
        {
          name: created.name,
          did: created.did,
          vid: vidLabel(identity.fingerprint),
          realm: opts.realm ?? null,
          capabilities: created.capabilities,
        },
        () => {
          ok(`agent "${created.name}" created`);
          sub(`VaultysId: ${vidLabel(identity.fingerprint)}  (ECDSA keypair generated)`);
          sub(`DID: ${created.did}`);
          if (opts.realm) sub(`realm: ${opts.realm}`);
        }
      );
    });
}
