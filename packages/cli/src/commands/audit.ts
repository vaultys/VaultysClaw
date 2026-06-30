import { Command } from "commander";
import { loadConfig, requireSession } from "../lib/config.js";
import { api } from "../lib/http.js";
import { printJson, isJsonMode, info } from "../lib/output.js";

interface AuditRecord {
  intentId: string;
  agentDid: string | null;
  action: string;
  status: string;
  decision: string | null;
  reason: string | null;
  signature: string | null;
  verified: boolean;
  sentAt: string;
}

interface ListResponse {
  intents: AuditRecord[];
}

export function registerAuditCommand(program: Command): void {
  const audit = program.command("audit").description("Inspect the signed audit trail");

  audit
    .command("tail")
    .description("Pull the most recent signed, non-repudiable audit records")
    .option("--last <n>", "number of records to show", "10")
    .option("--agent <did>", "filter by agent DID")
    .action(async (opts: { last: string; agent?: string }) => {
      const cfg = loadConfig();
      const session = requireSession(cfg);

      const res = await api<ListResponse>(cfg.controlPlaneUrl, "/api/intents", {
        cookie: session.cookie,
        query: { last: opts.last, agentDid: opts.agent },
      });

      const records = res.intents.map((r) => ({
        action: r.action,
        decision: r.decision ?? r.status,
        agent: r.agentDid,
        intentId: r.intentId,
        signature: r.signature ? `${r.signature.slice(0, 16)}…` : null,
        verified: r.verified,
        when: r.sentAt,
      }));

      if (isJsonMode()) {
        printJson(records);
        return;
      }
      if (records.length === 0) {
        info("(no audit records)");
        return;
      }
      for (const rec of records) printJson(rec);
    });
}
