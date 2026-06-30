import os from "node:os";
import { Command } from "commander";
import qrcode from "qrcode-terminal";
import { loadConfig, saveConfig, clearSession } from "../lib/config.js";
import { loadOrCreateCliIdentity, vidLabel } from "../lib/identity.js";
import {
  requestDeviceLink,
  pollLinkApproval,
  acquireSession,
} from "../lib/login-flow.js";
import { api } from "../lib/http.js";
import { ok, sub, info, render } from "../lib/output.js";

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Link this CLI's VaultysId to your user profile and start a session")
    .option("--name <name>", "device name shown to the approver", os.hostname())
    .action(async (opts: { name: string }) => {
      const cfg = loadConfig();
      const identity = await loadOrCreateCliIdentity();

      info(`Linking ${vidLabel(identity.fingerprint)} to your account on ${cfg.controlPlaneUrl}`);

      // 1. Request a device link and show the approval URL.
      const link = await requestDeviceLink(cfg.controlPlaneUrl, {
        did: identity.did,
        publicKey: identity.publicKey,
        name: opts.name,
      });

      info("");
      info("Open this link while signed in to approve the device:");
      info(`  ${link.approvalUrl}`);
      qrcode.generate(link.approvalUrl, { small: true }, (qr) => info(qr));
      info("Waiting for approval…");

      // 2. Wait for the user to approve in the browser.
      await pollLinkApproval(cfg.controlPlaneUrl, link.id);
      ok("device linked");

      // 3. Acquire a session as the now-linked identity.
      const result = await acquireSession(cfg.controlPlaneUrl, identity);
      cfg.session = { cookie: result.cookie, did: result.did, name: opts.name };
      saveConfig(cfg);

      render(
        { did: result.did, vid: vidLabel(identity.fingerprint), device: opts.name },
        () => {
          ok("logged in");
          sub(`identity: ${vidLabel(identity.fingerprint)} (${opts.name})`);
          sub(`acting as: ${result.did || "(unknown)"}`);
        }
      );
    });

  program
    .command("logout")
    .description("Clear the stored session")
    .action(() => {
      clearSession();
      ok("logged out");
    });

  program
    .command("whoami")
    .description("Show the current session identity")
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg.session?.cookie) {
        info('Not logged in. Run "vaultysclaw login".');
        process.exitCode = 1;
        return;
      }
      const session = await api<{ user?: { did?: string; name?: string } }>(
        cfg.controlPlaneUrl,
        "/api/auth/session",
        { cookie: cfg.session.cookie }
      );
      render(session.user ?? {}, () => {
        ok(`logged in as ${session.user?.did ?? cfg.session?.did ?? "(unknown)"}`);
        if (cfg.session?.name) sub(`device: ${cfg.session.name}`);
      });
    });
}
