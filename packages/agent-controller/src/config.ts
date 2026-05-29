import type { AgentCapability, LlmConfig } from "@vaultysclaw/shared";
import path from "path";

/**
 * Environment configuration for agent controller
 *
 * LLM configuration is now primarily managed via the control plane.
 * Env vars are supported for backward compatibility.
 *
 * Data directory structure (VAULTYS_DATA_DIR):
 *   <data-dir>/
 *   ├── agent.db
 *   ├── .vaultys/agent.id
 *   ├── workspace/
 *   └── skills/
 */

export interface AgentControllerConfig {
  name: string;
  controlPlaneUrl: string;
  controlPlaneWsUrl: string;
  /** LLM config loaded from env vars (local mode). May be null if no env vars are set.
   *  Remote config pushed by the control plane takes precedence at runtime. */
  llmConfig: LlmConfig | null;
  vaultysIdPath: string;
  /** Capabilities the agent requests on first registration. The control plane assigns the actual capabilities. */
  requestedCapabilities: AgentCapability[];
  /**
   * Control plane PeerJS peer ID. When set, the agent connects via WebRTC instead of WebSocket.
   * Set via --peerjs <id> or CONTROL_PLANE_PEERJS_ID env var.
   */
  peerjsControlPlaneId?: string;
  /**
   * Custom PeerJS signaling server URL (e.g. https://my.peerserver.com).
   * When not set, the public peerjs.com server is used.
   * Set via --peerjs-server <url> or CONTROL_PLANE_PEERJS_SERVER env var.
   */
  peerjsServerUrl?: string;
  /**
   * Optional PeerJS relay server URL override for the web dashboard P2P auth.
   * When null, the default public PeerJS relay is used.
   * The control plane can also override this at runtime via the DB (peerjs_server key).
   */
  peerjsServer?: string;
  /** Root directory for file operation tools. Defaults to cwd. */
  workspaceRoot?: string;
  /** Directory to load user-defined skill plugins from. Defaults to ~/.vaultysclaw/skills */
  skillsDir?: string;
  /** Watch the skills directory and hot-reload when files change. Default false. */
  watchSkills?: boolean;
  /** How long (ms) to wait for an admin to approve a tool request before auto-rejecting. Default 10 minutes. */
  approvalTimeoutMs?: number;
}

export function loadConfig(): AgentControllerConfig {
  const dataDir = process.env.VAULTYS_DATA_DIR;
  const name = process.env.AGENT_NAME || "agent-1";
  const controlPlaneUrl =
    process.env.CONTROL_PLANE_URL || "http://localhost:3000";

  // Determine WebSocket URL based on control plane URL
  let controlPlaneWsUrl = process.env.CONTROL_PLANE_WS_URL;
  if (!controlPlaneWsUrl) {
    const wsHost = process.env.CONTROL_PLANE_WS_HOST || "localhost";
    const wsPort = process.env.CONTROL_PLANE_WS_PORT || "8080";
    const wsProtocol = process.env.NODE_ENV === "production" ? "wss" : "ws";
    controlPlaneWsUrl = `${wsProtocol}://${wsHost}:${wsPort}`;
  }

  // Build LlmConfig from env vars. Requires at minimum LLM_PROVIDER + LLM_MODEL.
  const llmProvider = process.env.LLM_PROVIDER as LlmConfig["provider"] | undefined;
  const llmModel = process.env.LLM_MODEL;
  const llmConfig: LlmConfig | null =
    llmProvider && llmModel
      ? {
        provider: llmProvider,
        model: llmModel,
        apiKey: process.env.LLM_API_KEY,
        baseUrl: process.env.LLM_BASE_URL,
        systemPrompt: process.env.LLM_SYSTEM_PROMPT,
        maxTokens: process.env.LLM_MAX_TOKENS
          ? parseInt(process.env.LLM_MAX_TOKENS, 10)
          : undefined,
      }
      : null;

  // Determine vaultys ID path (from env or derive from data dir)
  let vaultysIdPath = process.env.VAULTYS_ID_PATH;
  if (!vaultysIdPath && dataDir) {
    vaultysIdPath = path.join(dataDir, ".vaultys", "agent.id");
  }
  if (!vaultysIdPath) {
    vaultysIdPath = "./.vaultys/agent.id";
  }

  return {
    name,
    controlPlaneUrl,
    controlPlaneWsUrl,
    llmConfig,
    vaultysIdPath,
    requestedCapabilities: process.env.AGENT_CAPABILITIES
      ? (process.env.AGENT_CAPABILITIES.split(",").map((s) => s.trim()).filter(Boolean) as AgentCapability[])
      : [],
    peerjsControlPlaneId: process.env.CONTROL_PLANE_PEERJS_ID || undefined,
    peerjsServerUrl: process.env.CONTROL_PLANE_PEERJS_SERVER || undefined,
    peerjsServer: process.env.PEERJS_SERVER || undefined,
    workspaceRoot: process.env.AGENT_WORKSPACE_ROOT || undefined,
    skillsDir: process.env.SKILLS_DIR || undefined,
    watchSkills: process.env.SKILLS_WATCH === "true",
    approvalTimeoutMs: process.env.APPROVAL_TIMEOUT_MS
      ? parseInt(process.env.APPROVAL_TIMEOUT_MS, 10)
      : undefined,
  };
}
