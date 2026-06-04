/**
 * Component tests for agent-controller ChatPanel.
 *
 * The useChat hook is mocked so we can test pure UI behaviour:
 *   - rendering messages, empty state, error banner
 *   - typing + sending a message via button / Enter key
 *   - clearing history
 *   - disabled state while streaming
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock useChat – default: idle with no messages
// ---------------------------------------------------------------------------

const mockSendMessage = vi.fn();
const mockClearHistory = vi.fn();

const defaultChat = {
  messages: [] as Array<{ role: "user" | "assistant"; content: string }>,
  isStreaming: false,
  error: null as string | null,
  sendMessage: mockSendMessage,
  clearHistory: mockClearHistory,
};

let chatState = { ...defaultChat };

vi.mock("@webapp/hooks/useChat", () => ({
  useChat: () => chatState,
}));

// Import AFTER the mock so the module picks up our stub
import ChatPanel from "../../packages/agent-controller/web-app/src/pages/ChatPanel";

beforeEach(() => {
  chatState = {
    ...defaultChat,
    sendMessage: mockSendMessage,
    clearHistory: mockClearHistory,
  };
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatPanel", () => {
  it("renders the empty-state placeholder when there are no messages", () => {
    render(<ChatPanel />);
    expect(screen.getByText(/send a message/i)).toBeInTheDocument();
  });

  it("does not show the Clear button when there are no messages", () => {
    render(<ChatPanel />);
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });

  it("renders user and assistant message bubbles", () => {
    chatState.messages = [
      { role: "user", content: "Hello agent" },
      { role: "assistant", content: "Hi there!" },
    ];
    render(<ChatPanel />);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows the Clear button when messages exist", () => {
    chatState.messages = [{ role: "user", content: "hi" }];
    render(<ChatPanel />);
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls clearHistory when Clear is clicked", async () => {
    chatState.messages = [{ role: "user", content: "hi" }];
    render(<ChatPanel />);
    await userEvent.click(screen.getByText("Clear"));
    expect(mockClearHistory).toHaveBeenCalledOnce();
  });

  it("calls sendMessage with input text when Send is clicked", async () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText(/type a message/i);
    const sendBtn = screen.getByRole("button", { name: /send/i });

    await userEvent.type(input, "test message");
    await userEvent.click(sendBtn);

    expect(mockSendMessage).toHaveBeenCalledWith("test message");
  });

  it("calls sendMessage when Enter is pressed", async () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText(/type a message/i);

    await userEvent.type(input, "via enter{enter}");
    expect(mockSendMessage).toHaveBeenCalledWith("via enter");
  });

  it("does not send on Shift+Enter", async () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText(/type a message/i);

    await userEvent.type(input, "no send{shift>}{enter}{/shift}");
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("disables the Send button when input is empty", () => {
    render(<ChatPanel />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("disables input and Send button while streaming", () => {
    chatState.isStreaming = true;
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText(/waiting/i);
    expect(input).toBeDisabled();
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("displays an error banner when error is set", () => {
    chatState.error = "Connection lost";
    render(<ChatPanel />);
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });
});
