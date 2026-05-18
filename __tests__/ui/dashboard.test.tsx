/**
 * Component tests for agent-controller Dashboard.
 *
 * Both useAgentData and useChat are mocked — we test:
 *   - loading spinner when info is null
 *   - top bar shows brand + agent name separately
 *   - active LLM model badge in top bar
 *   - default tab is "agent" (AgentOverview)
 *   - tab switching (agent / chat / runs / logs)
 *   - logout button fires callback
 *   - capability badges in sidebar
 *   - pending-runs badge on Runs nav item
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const AGENT_INFO = {
  id: "did:vaultys:test123456789",
  name: "Test Agent",
  status: "connected" as const,
  uptime: 125,
  capabilities: ["cap_a", "cap_b"],
  activeLlmProvider: "openai",
  activeLlmModel: "gpt-4o-mini",
  version: "0.0.1",
  recentLogs: [],
  recentIntents: [],
  lastHeartbeat: null,
};

vi.mock("@webapp/hooks/useAgentData", () => ({
  useAgentData: vi.fn(() => ({
    info: AGENT_INFO,
    logs: [
      { ts: "2026-05-04T10:00:00Z", level: "info", message: "Started" },
    ],
    intents: [],
    sseConnected: true,
  })),
}));

vi.mock("@webapp/hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    isStreaming: false,
    error: null,
    sendMessage: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));

// Stub fetch for SettingsPanel (/api/config/llm), ToolsPanel, MemoryPanel, TasksPanel, ApprovalsPanel
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ none: true, tools: [], skills: [], entries: [], tasks: [], schedules: [], memories: [], approvals: [] }),
}));

// Stub EventSource (used by ApprovalsBanner and TasksPanel)
vi.stubGlobal("EventSource", class {
  addEventListener() {}
  close() {}
});

import Dashboard from "../../packages/agent-controller/web-app/src/pages/Dashboard";
import { useAgentData } from "../../packages/agent-controller/web-app/src/hooks/useAgentData";

const onLogout = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (vi.mocked(useAgentData) as ReturnType<typeof vi.fn>).mockReturnValue({
    info: AGENT_INFO,
    logs: [{ ts: "2026-05-04T10:00:00Z", level: "info", message: "Started" }],
    intents: [],
    sseConnected: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dashboard", () => {
  it("shows a loading spinner when info is null", () => {
    vi.mocked(useAgentData).mockReturnValue({
      info: null,
      logs: [],
      intents: [],
      sseConnected: false,
    });

    const { container } = render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the VaultysClaw brand and agent name separately in the top bar", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("VaultysClaw")).toBeInTheDocument();
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
  });

  it("renders the connected status", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("renders the LLM model badge", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("openai/gpt-4o-mini")).toBeInTheDocument();
  });

  it("defaults to the Agent tab (shows AgentOverview)", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    // AgentOverview is the default panel — the log entry text should NOT be visible
    // (that's in the Logs panel which is a different tab)
    const agentTab = screen.getByRole("button", { name: /^agent$/i });
    expect(agentTab.className).toContain("text-fg");
  });

  it("switches to the Logs tab and shows log entries", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const logsTab = screen.getByRole("button", { name: /^logs$/i });
    await userEvent.click(logsTab);
    expect(screen.getByText("Started")).toBeInTheDocument();
  });

  it("switches to the Chat tab", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const chatTab = screen.getByRole("button", { name: /^chat$/i });
    await userEvent.click(chatTab);
    // ChatPanel shows the empty-state text
    expect(screen.getByText(/send a message/i)).toBeInTheDocument();
  });

  it("switches to the Runs tab", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const runsTab = screen.getByRole("button", { name: /^runs$/i });
    await userEvent.click(runsTab);
    // Logs entry should not be visible in the Runs panel
    expect(screen.queryByText("Started")).not.toBeInTheDocument();
  });

  it("renders capability badges in the sidebar", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("cap_a")).toBeInTheDocument();
    expect(screen.getByText("cap_b")).toBeInTheDocument();
  });

  it("calls onLogout when the logout button is clicked", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const logoutBtn = screen.getByRole("button", { name: /log out/i });
    await userEvent.click(logoutBtn);
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows a pending-runs badge when there are pending intents", () => {
    (vi.mocked(useAgentData) as ReturnType<typeof vi.fn>).mockReturnValue({
      info: AGENT_INFO,
      logs: [],
      intents: [{ intentId: "i1", action: "test", params: {}, status: "pending", receivedAt: new Date().toISOString() }],
      sseConnected: true,
    });

    render(<Dashboard did="did:test" onLogout={onLogout} />);
    // Badge "1" should appear next to the Runs nav item
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
