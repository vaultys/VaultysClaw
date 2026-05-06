import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { Agent, AgentInfo, LogEntry, IntentEntry } from "../agent";
import type { LlmConfig } from "@vaultysclaw/shared";

// ---- Sub-components ----

function StatusBar({ info }: { info: AgentInfo }) {
  const statusColor: Record<string, string> = {
    connected: "green",
    connecting: "yellow",
    pending_approval: "cyan",
    disconnected: "red",
    initializing: "gray",
  };
  const color = statusColor[info.status] ?? "white";
  const uptime = `${Math.floor(info.uptime / 60)}m ${info.uptime % 60}s`;
  const llm = info.activeLlmProvider
    ? `${info.activeLlmProvider}/${info.activeLlmModel}`
    : "none";

  return (
    <Box borderStyle="single" paddingX={1} flexDirection="row" gap={3}>
      <Text bold>VaultysClaw Agent</Text>
      <Text> </Text>
      <Text color={color}>● {info.status.toUpperCase()}</Text>
      <Text> </Text>
      <Text dimColor>name:</Text>
      <Text>{info.name}</Text>
      <Text dimColor>id:</Text>
      <Text>{info.id || "—"}</Text>
      <Text dimColor>uptime:</Text>
      <Text>{uptime}</Text>
      <Text dimColor>llm:</Text>
      <Text>{llm}</Text>
    </Box>
  );
}

function LogPanel({ logs, height }: { logs: LogEntry[]; height: number }) {
  const levelColor = (l: string) => l === "error" ? "red" : l === "warn" ? "yellow" : l === "debug" ? "gray" : "white";
  const visible = logs.slice(-height);
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
      <Text bold dimColor>LOGS</Text>
      {visible.map((e, i) => (
        <Text key={i} color={levelColor(e.level)} wrap="truncate">
          <Text dimColor>{e.ts.slice(11, 19)}</Text>
          {" "}<Text bold>[{e.level.toUpperCase()}]</Text>
          {" "}{e.message}
        </Text>
      ))}
    </Box>
  );
}

function IntentPanel({ intents, height }: { intents: IntentEntry[]; height: number }) {
  const statusColor = (s: string) => s === "success" ? "green" : s === "failed" ? "red" : "yellow";
  const visible = intents.slice(-height);
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
      <Text bold dimColor>INTENTS</Text>
      {visible.map((e, i) => (
        <Text key={i} wrap="truncate">
          <Text color={statusColor(e.status)}>■ </Text>
          <Text dimColor>{e.receivedAt.slice(11, 19)}</Text>
          {" "}<Text bold>{e.action}</Text>
          {" "}
          {e.status === "failed"
            ? <Text color="red">{e.error}</Text>
            : <Text dimColor>{e.status}</Text>}
        </Text>
      ))}
    </Box>
  );
}

function CapabilityList({ caps }: { caps: string[] }) {
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {caps.map((c) => (
        <Text key={c} backgroundColor="blue" color="white"> {c} </Text>
      ))}
    </Box>
  );
}

function HelpBar({ configEditing }: { configEditing: boolean }) {
  return (
    <Box paddingX={1}>
      <Text dimColor>q quit  </Text>
      {!configEditing && <Text dimColor>c config  </Text>}
      {configEditing && <Text dimColor>Esc cancel  Enter save field  Tab next  </Text>}
    </Box>
  );
}

// ---- LLM Config Editor ----

type ConfigField = "provider" | "model" | "apiKey" | "baseUrl" | "systemPrompt" | "maxTokens";
const CONFIG_FIELDS: ConfigField[] = ["provider", "model", "apiKey", "baseUrl", "systemPrompt", "maxTokens"];
const PROVIDERS = ["openai", "anthropic", "google", "ollama", "openai-compatible"] as const;

function ConfigEditor({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const safe = agent.getLlmConfigSafe();
  const [fields, setFields] = useState({
    provider: safe?.provider ?? "openai",
    model: safe?.model ?? "",
    apiKey: "",
    baseUrl: safe?.baseUrl ?? "",
    systemPrompt: safe?.systemPrompt ?? "",
    maxTokens: safe?.maxTokens ? String(safe.maxTokens) : "",
  });
  const [activeField, setActiveField] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>(
    safe?.hasApiKey ? "(current API key is set — leave blank to clear)" : ""
  );

  const nextField = () => setActiveField((f) => (f + 1) % CONFIG_FIELDS.length);
  const prevField = () => setActiveField((f) => (f - 1 + CONFIG_FIELDS.length) % CONFIG_FIELDS.length);

  useInput(async (input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.tab) { nextField(); return; }
    if (key.upArrow) { prevField(); return; }
    if (key.downArrow) { nextField(); return; }
    if (key.return && !saving) {
      const fieldName = CONFIG_FIELDS[activeField];
      if (fieldName === "provider") {
        // Cycle providers on Enter
        const idx = PROVIDERS.indexOf(fields.provider as typeof PROVIDERS[number]);
        const next = PROVIDERS[(idx + 1) % PROVIDERS.length];
        setFields((f) => ({ ...f, provider: next }));
      }
      return;
    }
    if (input === "s" && !saving) {
      setSaving(true);
      setStatusMsg("Saving…");
      try {
        const config: LlmConfig = {
          provider: fields.provider as LlmConfig["provider"],
          model: fields.model.trim(),
          apiKey: fields.apiKey.trim() || undefined,
          baseUrl: fields.baseUrl.trim() || undefined,
          systemPrompt: fields.systemPrompt.trim() || undefined,
          maxTokens: fields.maxTokens ? parseInt(fields.maxTokens, 10) : undefined,
        };
        if (!config.model) { setStatusMsg("Error: model is required"); setSaving(false); return; }
        await agent.updateLlmConfig(config);
        setStatusMsg("Saved ✓");
      } catch (err) {
        setStatusMsg("Error: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (input === "x") {
      setSaving(true);
      setStatusMsg("Clearing…");
      try {
        await agent.updateLlmConfig(null);
        setStatusMsg("Cleared ✓ (using env config)");
        setFields({ provider: "openai", model: "", apiKey: "", baseUrl: "", systemPrompt: "", maxTokens: "" });
      } catch (err) {
        setStatusMsg("Error: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setSaving(false);
      }
      return;
    }
  });

  const fieldLabel = (f: ConfigField) => {
    const labels: Record<ConfigField, string> = {
      provider: "Provider (Enter to cycle)", model: "Model", apiKey: "API Key (masked)",
      baseUrl: "Base URL", systemPrompt: "System Prompt", maxTokens: "Max Tokens",
    };
    return labels[f];
  };

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Text bold color="cyan">LLM Configuration Editor</Text>
      <Text dimColor>s=save  x=clear  Tab=next field  Esc=cancel</Text>
      <Box height={1} />
      {CONFIG_FIELDS.map((f, i) => {
        const isActive = i === activeField;
        const isMasked = f === "apiKey";
        return (
          <Box key={f} flexDirection="row" gap={1} marginBottom={0}>
            <Text color={isActive ? "cyan" : "gray"} bold={isActive}>
              {isActive ? "▶ " : "  "}{fieldLabel(f)}:
            </Text>
            {isActive ? (
              <TextInput
                value={fields[f]}
                onChange={(v) => setFields((prev) => ({ ...prev, [f]: v }))}
                mask={isMasked ? "*" : undefined}
                focus={isActive}
              />
            ) : (
              <Text>{isMasked && fields[f] ? "***" : fields[f] || (f === "provider" ? fields.provider : "")}</Text>
            )}
          </Box>
        );
      })}
      <Box height={1} />
      {statusMsg ? <Text color={statusMsg.startsWith("Error") ? "red" : statusMsg.includes("✓") ? "green" : "yellow"}>{statusMsg}</Text> : null}
    </Box>
  );
}

// ---- Main Dashboard ----

export function Dashboard({ agent }: { agent: Agent }) {
  const { exit } = useApp();

  const [info, setInfo] = useState<AgentInfo>(agent.getInfo());
  const [configEditing, setConfigEditing] = useState(false);

  const refresh = useCallback(() => {
    setInfo(agent.getInfo());
  }, [agent]);

  useEffect(() => {
    // Listen to all agent events to trigger re-renders
    const events = ["status_changed", "log", "heartbeat", "intent_received", "intent_result", "config_updated"];
    for (const ev of events) agent.on(ev, refresh);
    const timer = setInterval(refresh, 2000);
    return () => {
      for (const ev of events) agent.off(ev, refresh);
      clearInterval(timer);
    };
  }, [agent, refresh]);

  useInput((input) => {
    if (configEditing) return; // config editor handles its own input
    if (input === "q" || input === "Q") {
      agent.stop();
      exit();
    }
    if (input === "c" || input === "C") {
      setConfigEditing(true);
    }
  });

  if (configEditing) {
    return (
      <Box flexDirection="column" padding={0}>
        <StatusBar info={info} />
        <ConfigEditor agent={agent} onClose={() => { setConfigEditing(false); refresh(); }} />
        <HelpBar configEditing={true} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={0}>
      <StatusBar info={info} />
      <Box flexDirection="row" gap={0} flexGrow={1}>
        <LogPanel logs={info.recentLogs} height={20} />
        <IntentPanel intents={info.recentIntents} height={20} />
      </Box>
      <Box paddingX={1}>
        <Text dimColor>Capabilities: </Text>
        <CapabilityList caps={info.capabilities} />
      </Box>
      <HelpBar configEditing={false} />
    </Box>
  );
}
