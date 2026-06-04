/**
 * Component tests for control-plane Chat page.
 *
 * useAdminWS is mocked to provide a list of online agents.
 * fetch is mocked to simulate SSE streaming responses.
 *
 * Tests:
 *   - empty state when no agent is selected
 *   - agent selector with online agents
 *   - selecting an agent shows the input area
 *   - "no agents online" warning
 *   - sending a message calls fetch with correct payload
 *   - clear button resets messages
 *   - error display
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MOCK_AGENTS = [
  {
    id: "did:vaultys:agent1abc",
    name: "Agent Alpha",
    capabilities: ["cap_a"],
    registeredAt: "2026-01-01",
    lastSeen: "2026-05-04",
    online: true,
    connectedAt: "2026-05-04",
    lastHeartbeat: "2026-05-04",
  },
  {
    id: "did:vaultys:agent2def",
    name: "Agent Beta",
    capabilities: ["cap_b"],
    registeredAt: "2026-01-01",
    lastSeen: "2026-05-03",
    online: false,
    connectedAt: null,
    lastHeartbeat: null,
  },
];

let wsState = {
  agents: { agents: MOCK_AGENTS, total: 2, online: 1 },
  connected: true,
  registrations: { registrations: [], totalPending: 0 },
};

vi.mock("@/hooks/useAdminWS", () => ({
  useAdminWS: () => wsState,
}));

import ChatPage from "../../packages/control-plane/app/chat/page";

beforeEach(() => {
  wsState = {
    agents: { agents: MOCK_AGENTS, total: 2, online: 1 },
    connected: true,
    registrations: { registrations: [], totalPending: 0 },
  };
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Control-Plane ChatPage", () => {
  it("renders the Chat heading", () => {
    render(<ChatPage />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("shows the 'Select an online agent' placeholder when no agent is selected", () => {
    render(<ChatPage />);
    expect(screen.getByText(/select an online agent/i)).toBeInTheDocument();
  });

  it("renders the agent selector with online agents only", () => {
    render(<ChatPage />);
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option"));
    // "Select an agent…" + 1 online agent
    expect(options).toHaveLength(2);
    expect(options[1].textContent).toContain("Agent Alpha");
    // Offline Agent Beta should NOT appear
    expect(options.map((o) => o.textContent).join()).not.toContain(
      "Agent Beta"
    );
  });

  it("shows the input area after selecting an agent", async () => {
    render(<ChatPage />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "did:vaultys:agent1abc");

    // Input should appear
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it("does not show input area when no agent is selected", () => {
    render(<ChatPage />);
    expect(
      screen.queryByPlaceholderText(/type a message/i)
    ).not.toBeInTheDocument();
  });

  it("shows 'No agents online' when there are none", () => {
    wsState.agents = { agents: [], total: 0, online: 0 };
    render(<ChatPage />);
    expect(screen.getByText(/no agents online/i)).toBeInTheDocument();
  });

  it("shows 'WS disconnected' when websocket is down", () => {
    wsState.connected = false;
    render(<ChatPage />);
    expect(screen.getByText(/ws disconnected/i)).toBeInTheDocument();
  });

  it("sends a chat message when the send button is clicked", async () => {
    // Mock a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"hello"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    render(<ChatPage />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "did:vaultys:agent1abc");

    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, "test message");

    // The send button is the one next to the textarea (contains an SVG icon)
    const textarea = screen.getByPlaceholderText(/type a message/i);
    const sendBtn = textarea.parentElement?.querySelector("button");
    expect(sendBtn).toBeTruthy();
    await userEvent.click(sendBtn!);

    expect(fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
      })
    );

    // Verify the payload includes agentDid and messages
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((callArgs[1] as any).body);
    expect(body.agentDid).toBe("did:vaultys:agent1abc");
    expect(body.messages[0]).toEqual({ role: "user", content: "test message" });
  });

  it("shows the Clear button after a message is sent and clears on click", async () => {
    // Mock streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"response"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    render(<ChatPage />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "did:vaultys:agent1abc");

    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, "hi");

    const sendBtn = input.parentElement?.querySelector("button");
    await userEvent.click(sendBtn!);

    // User message should appear immediately
    await screen.findByText("hi");

    // After streaming finishes, the assistant response appears and Clear becomes visible
    const clearBtn = await screen.findByText("Clear", {}, { timeout: 3000 });
    expect(clearBtn).toBeInTheDocument();
    await userEvent.click(clearBtn);

    // After clearing, the empty state should return
    expect(screen.getByText(/send a message/i)).toBeInTheDocument();
  });
});
