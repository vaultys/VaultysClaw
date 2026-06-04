#!/usr/bin/env node

/**
 * VaultysClaw Agent Controller CLI
 *
 * Data directory structure (--data-dir):
 *   <data-dir>/
 *   ├── agent.db
 *   ├── .env
 *   ├── .env.local
 *   ├── .vaultys/agent.id
 *   ├── workspace/
 *   └── skills/
 *
 * Usage:
 *   agent-controller --name <name> --data-dir <dir> [options]
 *
 * Options:
 *   --name, -n <name>          Agent name (REQUIRED)
 *   --data-dir, -d <dir>       Data directory (default: .vaultys/<name>)
 *   --mode headless|tui|web    Run mode (default: headless)
 *   --port N                   Web UI port (default: 3002, web mode only)
 *   --no-browser               Don't auto-open browser (web mode only)
 *   --ws, -w <url>             WebSocket URL (mutually exclusive with --peerjs)
 *   --peerjs <peer-id>         Control plane PeerJS peer ID (alternative to --ws)
 *   --peerjs-server <url>      Custom PeerJS signaling server URL (optional, used with --peerjs)
 *   --spawn, -s <count>        Spawn multiple headless agents
 *   --prefix, -p <prefix>      Name prefix for spawned agents (default: agent)
 *   --install-service          Install as a system service (macOS/Linux/Windows)
 *   --help, -h                 Show this help message
 */

import { fork } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { loadConfig } from "./config";
import { Agent } from "./agent";

type RunMode = "headless" | "tui" | "web";

interface CliArgs {
  mode: RunMode;
  port: number;
  noBrowser: boolean;
  spawn: number;
  prefix: string;
  name?: string;
  dataDir?: string;
  ws?: string;
  peerjsId?: string;
  peerjsServer?: string;
  installService: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    mode: "headless",
    port: 3002,
    noBrowser: false,
    spawn: 0,
    prefix: "agent",
    installService: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mode":
      case "-m":
        result.mode = args[++i] as RunMode;
        if (!["headless", "tui", "web"].includes(result.mode)) {
          console.error(`Error: --mode must be headless, tui, or web`);
          process.exit(1);
        }
        break;
      case "--port":
        result.port = parseInt(args[++i], 10);
        if (isNaN(result.port) || result.port < 1 || result.port > 65535) {
          console.error("Error: --port must be a valid port number");
          process.exit(1);
        }
        break;
      case "--no-browser":
        result.noBrowser = true;
        break;
      case "--spawn":
      case "-s":
        result.spawn = parseInt(args[++i], 10);
        if (isNaN(result.spawn) || result.spawn < 1) {
          console.error("Error: --spawn requires a positive integer");
          process.exit(1);
        }
        break;
      case "--prefix":
      case "-p":
        result.prefix = args[++i];
        break;
      case "--name":
      case "-n":
        result.name = args[++i];
        break;
      case "--ws":
      case "-w":
        result.ws = args[++i];
        break;
      case "--peerjs":
        result.peerjsId = args[++i];
        break;
      case "--peerjs-server":
        result.peerjsServer = args[++i];
        break;
      case "--data-dir":
      case "-d":
        result.dataDir = args[++i];
        break;
      case "--install-service":
        result.installService = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
VaultysClaw Agent Controller

Usage: agent-controller --name <name> [--data-dir <dir>] [options]

Modes:
  --mode headless    Run silently (default, structured JSON logs to stdout)
  --mode tui         Interactive terminal dashboard (requires TTY)
  --mode web         Start web dashboard — open http://localhost:<port>

Options:
  --name, -n <name>          Agent name (REQUIRED)
  --data-dir, -d <dir>       Data directory (default: .vaultys/<name>)
                             Contains: agent.db, .env, .vaultys/agent.id, workspace/, skills/
  --ws, -w <url>             Control plane WebSocket URL
  --peerjs <peer-id>         Connect via PeerJS/WebRTC (alternative to --ws)
                             Use the peer ID logged by the control plane on startup
  --peerjs-server <url>      Custom PeerJS signaling server (default: public peerjs.com)
  --port <N>                 Web UI port (default: 3002, web mode only)
  --no-browser               Don't auto-open browser in web mode
  --spawn, -s <N>            Spawn N headless agents (auto-names: <prefix>-1 … <prefix>-N)
  --prefix, -p <str>         Name prefix when spawning (default: agent)
  --install-service          Install as auto-start system service
  --help, -h                 This help message

Examples:
  agent-controller --name researcher --ws ws://localhost:8080
  agent-controller --name researcher --peerjs abc123def456 --peerjs-server https://my.peerjs.com
  agent-controller --name analyst --mode tui --ws ws://localhost:8080
  agent-controller --spawn 3 --prefix worker --data-dir .agents --ws ws://localhost:8080

Data directory structure:
  <data-dir>/agent.db              — SQLite database
  <data-dir>/.env                  — Environment config
  <data-dir>/.vaultys/agent.id     — Agent identity
  <data-dir>/workspace/            — File operations root
  <data-dir>/skills/               — Custom skill plugins
`);
}

// ---- Service installation ----

function installService(args: CliArgs): void {
  const execPath = process.execPath; // path to this binary
  const platform = os.platform();

  if (platform === "darwin") {
    installMacOSLaunchAgent(execPath, args);
  } else if (platform === "linux") {
    installLinuxSystemd(execPath, args);
  } else if (platform === "win32") {
    installWindowsTask(execPath, args);
  } else {
    console.error(`Service installation not supported on ${platform}`);
    process.exit(1);
  }
}

function installMacOSLaunchAgent(execPath: string, args: CliArgs): void {
  const label = "com.vaultysclaw.agent";
  const plistDir = path.join(os.homedir(), "Library", "LaunchAgents");
  const plistPath = path.join(plistDir, `${label}.plist`);

  const agentArgs = buildAgentArgs(args, execPath);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    ${agentArgs.map((a) => `<string>${escXml(a)}</string>`).join("\n    ")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), "Library", "Logs", "vaultysclaw-agent.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), "Library", "Logs", "vaultysclaw-agent.err")}</string>
</dict>
</plist>`;

  fs.mkdirSync(plistDir, { recursive: true });
  fs.writeFileSync(plistPath, plist, "utf-8");
  console.log(`✅ LaunchAgent installed: ${plistPath}`);
  console.log(`   Start now:  launchctl load ${plistPath}`);
  console.log(`   Stop:       launchctl unload ${plistPath}`);
}

function installLinuxSystemd(execPath: string, args: CliArgs): void {
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  const unitPath = path.join(unitDir, "vaultysclaw-agent.service");
  const agentArgs = buildAgentArgs(args, execPath);
  const execLine = agentArgs
    .map((a) => `"${a.replace(/"/g, '\\"')}"`)
    .join(" ");

  const unit = `[Unit]
Description=VaultysClaw Agent Controller
After=network.target

[Service]
Type=simple
ExecStart=${execLine}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;

  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(unitPath, unit, "utf-8");
  console.log(`✅ systemd unit installed: ${unitPath}`);
  console.log(
    `   Enable & start: systemctl --user enable --now vaultysclaw-agent`
  );
  console.log(`   Stop:           systemctl --user stop vaultysclaw-agent`);
  console.log(`   Logs:           journalctl --user -u vaultysclaw-agent -f`);
}

function installWindowsTask(execPath: string, args: CliArgs): void {
  const agentArgs = buildAgentArgs(args, execPath);
  const scriptPath = path.join(os.homedir(), "vaultysclaw-agent-install.bat");
  const cmdArgs = agentArgs
    .slice(1)
    .map((a) => `"${a.replace(/"/g, '""')}"`)
    .join(" ");
  const bat = `@echo off
schtasks /create /tn "VaultysClaw Agent" /tr "${agentArgs[0]} ${cmdArgs}" /sc onlogon /ru "%USERNAME%" /f
echo Service task created. It will start on next logon.
pause
`;
  fs.writeFileSync(scriptPath, bat, "utf-8");
  console.log(`✅ Windows Task Scheduler script written: ${scriptPath}`);
  console.log(`   Run it as Administrator to register the task.`);
}

function buildAgentArgs(args: CliArgs, execPath: string): string[] {
  const argv: string[] = [execPath, "--mode", args.mode];
  if (args.name) argv.push("--name", args.name);
  if (args.ws) argv.push("--ws", args.ws);
  if (args.peerjsId) argv.push("--peerjs", args.peerjsId);
  if (args.peerjsServer) argv.push("--peerjs-server", args.peerjsServer);
  // Determine data directory: explicit --data-dir or default .vaultys/<name>
  const dataDir = args.dataDir
    ? path.resolve(args.dataDir)
    : args.name
      ? path.resolve(".vaultys", args.name)
      : path.resolve(".vaultys", "agent-1");
  argv.push("--data-dir", dataDir);
  if (args.mode === "web") {
    argv.push("--port", String(args.port), "--no-browser");
  }
  return argv;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Single agent runners ----

function runHeadless(args: CliArgs): void {
  const env = buildEnv(args);
  // Apply env to the current process before loading config/agent, just as fork() would do.
  Object.assign(process.env, env);

  const agentName = (env.AGENT_NAME as string) || "agent-1";
  console.log(`Starting agent "${agentName}" in headless mode`);

  // Ensure data directory exists
  const dataDir = process.env.VAULTYS_DATA_DIR;
  if (dataDir && !fs.existsSync(dataDir))
    fs.mkdirSync(dataDir, { recursive: true });

  // ── Process-level crash guards ────────────────────────────────────────────
  // Run in the same process (no fork) so tsx cannot send SIGTERM to us.
  // Unhandled errors keep the agent alive and retrying rather than crashing.
  process.on("uncaughtException", (err: Error) => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] Uncaught exception — continuing:`,
      err
    );
  });
  process.on("unhandledRejection", (reason: unknown) => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] Unhandled rejection — continuing:`,
      reason
    );
  });
  // Ignore signals that a parent process / shell might send during cleanup.
  for (const sig of ["SIGHUP", "SIGPIPE"] as NodeJS.Signals[]) {
    try {
      process.on(sig, () => {});
    } catch {
      /* platform may not support */
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const agent = new Agent(loadConfig());

  agent.on(
    "log",
    ({
      level,
      message,
      data,
    }: {
      level: string;
      message: string;
      data?: unknown;
    }) => {
      const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
      if (data) {
        console[
          level === "error" ? "error" : level === "warn" ? "warn" : "log"
        ](`${prefix} ${message}`, data);
      } else {
        console[
          level === "error" ? "error" : level === "warn" ? "warn" : "log"
        ](`${prefix} ${message}`);
      }
    }
  );

  agent.start().catch((err) => {
    console.error("Failed to start agent:", err);
    process.exit(1);
  });

  // Keep the event loop alive so PeerJS reconnect timers always have something to fire into.
  const keepAlive = setInterval(() => {
    /* event-loop anchor */
  }, 30_000);

  const shutdown = (sig: string) => () => {
    console.log(
      `[${new Date().toISOString()}] [INFO] Received ${sig} — shutting down`
    );
    clearInterval(keepAlive);
    agent.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));
}

function runTui(args: CliArgs): void {
  const env = buildEnv(args);
  const tuiPath = path.resolve(__dirname, "tui.tsx");
  const child = fork(tuiPath, [], {
    env,
    execArgv: process.execArgv,
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function runWeb(args: CliArgs): void {
  const env = buildEnv(args);
  env.WEB_PORT = String(args.port);
  env.WEB_NO_BROWSER = args.noBrowser ? "1" : "0";
  const webPath = path.resolve(__dirname, "web-launcher.ts");
  const child = fork(webPath, [], {
    env,
    execArgv: process.execArgv,
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function buildEnv(args: CliArgs): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  if (args.name) env.AGENT_NAME = args.name;
  if (args.ws) env.CONTROL_PLANE_WS_URL = args.ws;
  if (args.peerjsId) env.CONTROL_PLANE_PEERJS_ID = args.peerjsId;
  if (args.peerjsServer) env.CONTROL_PLANE_PEERJS_SERVER = args.peerjsServer;

  // Determine data directory: explicit --data-dir or default .vaultys/<name>
  let dataDir: string;
  if (args.dataDir) {
    dataDir = path.resolve(args.dataDir);
  } else if (args.name) {
    dataDir = path.resolve(".vaultys", args.name);
  } else {
    dataDir = path.resolve(".vaultys", "agent-1");
  }

  // Set up environment variables for the agent
  env.VAULTYS_DATA_DIR = dataDir;
  env.VAULTYS_ID_PATH = path.join(dataDir, ".vaultys", "agent.id");
  env.SKILLS_DIR = path.join(dataDir, "skills");
  env.AGENT_WORKSPACE_ROOT = path.join(dataDir, "workspace");

  return env;
}

// ---- Multi-spawn ----

function spawnMultiple(args: CliArgs): void {
  console.log(
    `Spawning ${args.spawn} agent(s) [headless] with prefix "${args.prefix}"`
  );
  const indexPath = path.resolve(__dirname, "index.ts");
  const agents: ReturnType<typeof fork>[] = [];

  // Base directory for multiple agents (either --data-dir or .vaultys)
  const baseDir = args.dataDir
    ? path.resolve(args.dataDir)
    : path.resolve(".vaultys");

  for (let i = 1; i <= args.spawn; i++) {
    const name = `${args.prefix}-${i}`;
    const dataDir = path.join(baseDir, name);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AGENT_NAME: name,
      VAULTYS_DATA_DIR: dataDir,
      VAULTYS_ID_PATH: path.join(dataDir, ".vaultys", "agent.id"),
      SKILLS_DIR: path.join(dataDir, "skills"),
      AGENT_WORKSPACE_ROOT: path.join(dataDir, "workspace"),
    };
    if (args.ws) env.CONTROL_PLANE_WS_URL = args.ws;
    if (args.peerjsId) env.CONTROL_PLANE_PEERJS_ID = args.peerjsId;
    if (args.peerjsServer) env.CONTROL_PLANE_PEERJS_SERVER = args.peerjsServer;
    console.log(`  [${i}/${args.spawn}] Starting "${name}" (data: ${dataDir})`);
    const child = fork(indexPath, [], {
      env,
      execArgv: process.execArgv,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout?.on("data", (d: Buffer) =>
      d
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((l) => console.log(`[${name}] ${l}`))
    );
    child.stderr?.on("data", (d: Buffer) =>
      d
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((l) => console.error(`[${name}] ${l}`))
    );
    child.on("exit", (code) => console.log(`[${name}] exited (code ${code})`));
    agents.push(child);
  }

  console.log(`\n${args.spawn} agent(s) spawned. Ctrl+C to stop all.\n`);

  const shutdown = () => {
    console.log("Shutting down...");
    for (const c of agents) c.kill("SIGTERM");
    setTimeout(() => {
      for (const c of agents) if (!c.killed) c.kill("SIGKILL");
      process.exit(0);
    }, 3000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ---- Entry point ----

function main(): void {
  const args = parseArgs();

  if (args.installService) {
    installService(args);
    return;
  }

  if (args.spawn > 0) {
    spawnMultiple(args);
    return;
  }

  if (!args.name) {
    console.error("Error: --name <name> is required.");
    console.error(
      "  Each agent needs a unique name so it can maintain an isolated environment."
    );
    console.error(
      "  Example: agent-controller --name my-agent --ws ws://localhost:8080"
    );
    console.error("  Run with --help for full usage.");
    process.exit(1);
  }

  switch (args.mode) {
    case "headless":
      runHeadless(args);
      break;
    case "tui":
      runTui(args);
      break;
    case "web":
      runWeb(args);
      break;
  }
}

main();
