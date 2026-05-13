/**
 * Component tests for agent-controller Dashboard.
 *
 * Both useAgentData and useChat are mocked — we test:
 *   - loading spinner when info is null
 *   - tab switching (logs / intents / chat)
 *   - top bar shows agent info
 *   - logout button fires callback
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

// Stub fetch for LlmConfigPanel (it fetches /api/config/llm on mount)
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ config: null }),
}));

import Dashboard from "../../packages/agent-controller/web-app/src/pages/Dashboard";
import { useAgentData } from "../../packages/agent-controller/web-app/src/hooks/useAgentData";

const onLogout = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default info
  (vi.mocked(useAgentData) as any).mockReturnValue({
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
    // Spinner is an animated div — no text content
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the agent name and status in the top bar", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("VaultysClaw Agent")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("renders the LLM info", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    expect(screen.getByText("openai/gpt-4o-mini")).toBeInTheDocument();
  });

  it("defaults to the logs tab", () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    // The log entry text should be visible
    expect(screen.getByText("Started")).toBeInTheDocument();
  });

  it("switches to the chat tab when clicked", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const chatTab = screen.getByRole("button", { name: /chat/i });
    await userEvent.click(chatTab);

    // ChatPanel shows the empty-state text
    expect(screen.getByText(/send a message/i)).toBeInTheDocument();
    // Log entry should be gone
    expect(screen.queryByText("Started")).not.toBeInTheDocument();
  });

  it("switches to intents tab", async () => {
    render(<Dashboard did="did:test" onLogout={onLogout} />);
    const intentsTab = screen.getByRole("button", { name: /intents/i });
    await userEvent.click(intentsTab);

    // Logs should not be visible
    expect(screen.queryByText("Started")).not.toBeInTheDocument();
  });

  it("renders capability badges", () => {
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
});
