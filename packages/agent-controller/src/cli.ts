#!/usr/bin/env node

/**
 * VaultysClaw Agent Controller CLI
 *
 * Usage:
 *   agent-controller [options]
 *
 * Options:
 *   --mode headless|tui|web    Run mode (default: headless)
 *   --port N                   Web UI port (default: 3002, web mode only)
 *   --no-browser               Don't auto-open browser (web mode only)
 *   --name, -n <name>          Agent name
 *   --ws, -w <url>             WebSocket URL
 *   --data-dir, -d <dir>       Base directory for agent data (default: .vaultys)
 *   --spawn, -s <count>        Spawn multiple headless agents
 *   --prefix, -p <prefix>      Name prefix for spawned agents (default: agent)
 *   --install-service          Install as a system service (macOS/Linux/Windows)
 *   --help, -h                 Show this help message
 */

import { fork } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

type RunMode = "headless" | "tui" | "web";

interface CliArgs {
  mode: RunMode;
  port: number;
  noBrowser: boolean;
  spawn: number;
  prefix: string;
  name?: string;
  ws?: string;
  dataDir: string;
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
    dataDir: ".vaultys",
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

Usage: agent-controller [options]

Modes:
  --mode headless    Run silently (default, structured JSON logs to stdout)
  --mode tui         Interactive terminal dashboard (requires TTY)
  --mode web         Start web dashboard — open http://localhost:<port>

Options:
  --name, -n <name>     Agent name (default: agent-1 or AGENT_NAME env var)
  --ws, -w <url>        Control plane WebSocket URL
  --data-dir, -d <dir>  Data directory for identity and DB (default: .vaultys)
  --port <N>            Web UI port (default: 3002, web mode only)
  --no-browser          Don't auto-open browser in web mode
  --spawn, -s <N>       Spawn N headless agent processes
  --prefix, -p <str>    Name prefix when spawning (default: agent)
  --install-service     Install as auto-start system service
  --help, -h            This help message

Examples:
  agent-controller                         # headless, single agent
  agent-controller --mode tui              # terminal dashboard
  agent-controller --mode web --port 3002  # web dashboard
  agent-controller --spawn 3               # 3 headless agents
  agent-controller --install-service       # install as system service
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
  const execLine = agentArgs.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");

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
  console.log(`   Enable & start: systemctl --user enable --now vaultysclaw-agent`);
  console.log(`   Stop:           systemctl --user stop vaultysclaw-agent`);
  console.log(`   Logs:           journalctl --user -u vaultysclaw-agent -f`);
}

function installWindowsTask(execPath: string, args: CliArgs): void {
  const agentArgs = buildAgentArgs(args, execPath);
  const scriptPath = path.join(os.homedir(), "vaultysclaw-agent-install.bat");
  const cmdArgs = agentArgs.slice(1).map((a) => `"${a.replace(/"/g, '""')}"`).join(" ");
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
  argv.push("--data-dir", path.resolve(args.dataDir));
  if (args.mode === "web") {
    argv.push("--port", String(args.port), "--no-browser");
  }
  return argv;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Single agent runners ----

function runHeadless(args: CliArgs): void {
  const env = buildEnv(args);
  const agentName = args.name || (env.AGENT_NAME as string) || "agent-1";
  console.log(`Starting agent "${agentName}" in headless mode`);
  const indexPath = path.resolve(__dirname, "index.ts");
  const child = fork(indexPath, [], { env, execArgv: process.execArgv, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function runTui(args: CliArgs): void {
  const env = buildEnv(args);
  const tuiPath = path.resolve(__dirname, "tui.tsx");
  const child = fork(tuiPath, [], { env, execArgv: process.execArgv, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function runWeb(args: CliArgs): void {
  const env = buildEnv(args);
  env.WEB_PORT = String(args.port);
  env.WEB_NO_BROWSER = args.noBrowser ? "1" : "0";
  const webPath = path.resolve(__dirname, "web-launcher.ts");
  const child = fork(webPath, [], { env, execArgv: process.execArgv, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function buildEnv(args: CliArgs): NodeJS.ProcessEnv {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (args.name) env.AGENT_NAME = args.name;
  if (args.ws) env.CONTROL_PLANE_WS_URL = args.ws;
  const agentName = args.name || env.AGENT_NAME || "agent-1";
  env.VAULTYS_ID_PATH = path.join(args.dataDir, `${agentName}.id`);
  return env;
}

// ---- Multi-spawn ----

function spawnMultiple(args: CliArgs): void {
  console.log(`Spawning ${args.spawn} agent(s) [headless] with prefix "${args.prefix}"`);
  const indexPath = path.resolve(__dirname, "index.ts");
  const agents: ReturnType<typeof fork>[] = [];

  for (let i = 1; i <= args.spawn; i++) {
    const name = `${args.prefix}-${i}`;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AGENT_NAME: name,
      VAULTYS_ID_PATH: path.join(args.dataDir, `${name}.id`),
    };
    if (args.ws) env.CONTROL_PLANE_WS_URL = args.ws;
    console.log(`  [${i}/${args.spawn}] Starting "${name}"`);
    const child = fork(indexPath, [], { env, execArgv: process.execArgv, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.stdout?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`)));
    child.stderr?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach((l) => console.error(`[${name}] ${l}`)));
    child.on("exit", (code) => console.log(`[${name}] exited (code ${code})`));
    agents.push(child);
  }

  console.log(`\n${args.spawn} agent(s) spawned. Ctrl+C to stop all.\n`);

  const shutdown = () => {
    console.log("Shutting down...");
    for (const c of agents) c.kill("SIGTERM");
    setTimeout(() => { for (const c of agents) if (!c.killed) c.kill("SIGKILL"); process.exit(0); }, 3000);
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

  switch (args.mode) {
    case "headless": runHeadless(args); break;
    case "tui":      runTui(args);     break;
    case "web":      runWeb(args);     break;
  }
}

main();
