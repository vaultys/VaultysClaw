/**
 * Simulator configuration.
 *
 * Uses `node:util`'s `parseArgs` rather than a CLI library: the surface is a dozen flags, and a
 * simulator that pulls in a dependency tree to read them is a simulator whose install is a reason
 * not to run it.
 */

import { parseArgs } from "node:util";
import path from "node:path";

export interface SimConfig {
  /** Non-agent Actors: the estate the agents run on (sensors, devices, proxies). */
  actors: number;
  /** Agent-kind Actors: the things doing work (openclaw, mcp). */
  agents: number;
  wsUrl: string;
  databaseUrl: string | undefined;
  dataDir: string;
  /** New connections started per second during ramp-up. */
  ratePerSecond: number;
  /** Ceiling on simultaneously in-flight handshakes. */
  maxInFlight: number;
  /**
   * Reconnections per second after a bulk approval.
   *
   * Separate from `ratePerSecond` because they bound different things: the ramp rate is what the
   * simulator can start, this is what the control plane can finish while still working through the
   * tail of that ramp. Defaults to half the ramp rate.
   */
  reconnectRatePerSecond: number;
  /** How long to hold the fleet up and let it generate activity, in seconds. 0 = until Ctrl-C. */
  durationSeconds: number;
  /** Approve every pending registration before connecting, so the run reaches certified actors. */
  autoApprove: boolean;
  /**
   * Force every Actor to re-check its certificate status this often, in ms; 0 leaves each persona's
   * own cadence alone.
   *
   * Exists because the org's default staple TTL is measured in hours, so a two-minute demo shows
   * zero status checks and the fail-closed machinery looks like it isn't there. This is the knob
   * that makes a revocation — or a deleted custom capability — visibly propagate across the fleet
   * while someone is watching.
   */
  statusRefreshMs: number;
  /**
   * Cycle connections after a bulk approval instead of waiting for the control plane's delivery
   * sweep.
   *
   * Off by default, and only useful against a control plane old enough to lack
   * `sweepUndeliveredGrants` — reconnecting is a second handshake storm on top of the ramp's tail,
   * and the sweep delivers over the connection the Actor already has.
   */
  reconnectAfterApprove: boolean;
  command: "run" | "approve" | "stats" | "reset" | "admin";
  /** `admin` only: display name for the minted human. Re-running with the same name reuses it. */
  adminName: string;
  /** `admin` only: optional email for the human profile. */
  adminEmail: string | null;
  /** `admin` only: passphrase encrypting the exported backup file. */
  adminPassphrase: string | null;
  /** `admin` only: where to write the backup. Defaults next to the identities directory. */
  adminOut: string | null;
}

const USAGE = `
vaultysclaw simulator — drives a fleet of real-VaultysId Actors at a live control plane

  pnpm simulator run [options]        bring a fleet up and keep it active
  pnpm simulator approve [options]    approve every pending registration (bulk, via the database)
  pnpm simulator stats                what the control plane currently holds
  pnpm simulator reset                delete simulated actors and their identities
  pnpm simulator admin [options]      mint an admin human and export its VaultysID as an
                                      encrypted backup you can restore in the browser

Options
  --actors <n>       estate Actors: sensors, devices, proxies      (default 2000)
  --agents <n>       agent Actors: openclaw, mcp                   (default 5000)
  --url <ws>         control plane WebSocket                       (default ws://localhost:8081)
  --data-dir <path>  where identities live; reused across runs     (default .simdata)
  --rate <n>         new connections per second while ramping      (default 100)
  --max-in-flight <n> simultaneous handshakes ceiling              (default 250)
  --reconnect-rate <n> reconnects/second after approval            (default: half of --rate)
  --duration <s>     hold the fleet this long, 0 = until Ctrl-C    (default 120)
  --auto-approve     approve pending registrations mid-run, then reconnect to collect certificates

Options for "admin"
  --passphrase <s>   encrypts the backup file (required, min 8 chars — it holds a private key)
  --name <s>         display name for the human                    (default "Demo Admin")
  --email <s>        optional email for the profile
  --out <path>       where to write the backup    (default <data-dir>/<generated backup name>)
  --status-refresh <ms>  force every Actor to re-check its certificate this often (0 = persona default)
  --reconnect-after-approve  cycle connections after approving, instead of letting the control
                             plane's delivery sweep hand out grants over existing connections
  --help

Scale note: the defaults total 7,000 Actors, which one machine handles comfortably. Identity
generation is ~1.5 ms each; the real limits are file descriptors (raise with \`ulimit -n\`),
the control plane's handshake throughput, and Postgres write throughput — in that order.
`;

export function parseConfig(argv: string[]): SimConfig {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      actors: { type: "string" },
      agents: { type: "string" },
      url: { type: "string" },
      "data-dir": { type: "string" },
      rate: { type: "string" },
      "max-in-flight": { type: "string" },
      "reconnect-rate": { type: "string" },
      duration: { type: "string" },
      "auto-approve": { type: "boolean" },
      name: { type: "string" },
      email: { type: "string" },
      passphrase: { type: "string" },
      out: { type: "string" },
      "status-refresh": { type: "string" },
      "reconnect-after-approve": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const command = (positionals[0] ?? "run") as SimConfig["command"];
  if (!["run", "approve", "stats", "reset", "admin"].includes(command)) {
    process.stderr.write(`Unknown command "${command}"\n${USAGE}`);
    process.exit(1);
  }

  return {
    actors: int(values.actors, 2000),
    agents: int(values.agents, 5000),
    wsUrl: values.url ?? process.env.CONTROLPLANE_WS_URL ?? "ws://localhost:8081",
    databaseUrl: process.env.DATABASE_URL,
    dataDir: path.resolve(values["data-dir"] ?? ".simdata"),
    ratePerSecond: int(values.rate, 100),
    maxInFlight: int(values["max-in-flight"], 250),
    reconnectRatePerSecond: int(
      values["reconnect-rate"],
      Math.max(1, Math.floor(int(values.rate, 100) / 2))
    ),
    durationSeconds: int(values.duration, 120),
    autoApprove: values["auto-approve"] ?? false,
    adminName: values.name ?? "Demo Admin",
    adminEmail: values.email ?? null,
    adminPassphrase: values.passphrase ?? null,
    adminOut: values.out ?? null,
    statusRefreshMs: int(values["status-refresh"], 0),
    reconnectAfterApprove: values["reconnect-after-approve"] ?? false,
    command,
  };
}

function int(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    process.stderr.write(`Expected a non-negative integer, got "${raw}"\n`);
    process.exit(1);
  }
  return n;
}
