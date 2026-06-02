/**
 * Component tests for control-plane Sidebar.
 *
 * Tests:
 *   - renders all nav items including Chat
 *   - Chat nav item links to /chat
 *   - highlights the active route
 *   - collapse toggle works
 *   - shows labels when expanded, hides when collapsed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Mock the cn utility
vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) =>
    args
      .flat()
      .filter((x: any) => typeof x === "string")
      .join(" "),
}));

import Sidebar from "../../packages/control-plane/components/layout/Sidebar";

const onToggle = vi.fn();

beforeEach(() => {
  mockUsePathname.mockReturnValue("/");
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sidebar", () => {
  it("renders the VaultysClaw brand label when expanded", () => {
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    expect(screen.getByText("VaultysClaw")).toBeInTheDocument();
  });

  it("hides the brand label when collapsed", () => {
    render(<Sidebar collapsed={true} onToggle={onToggle} />);
    expect(screen.queryByText("VaultysClaw")).not.toBeInTheDocument();
  });

  it("renders all main navigation items", () => {
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const expectedLabels = [
      "Dashboard",
      "Agents",
      "Registrations",
      "Users",
      "Realms",
      "Graph",
      "Chat",
      "Server",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders the Settings item", () => {
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("includes a Chat link pointing to /chat", () => {
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const chatLink = screen.getByText("Chat").closest("a");
    expect(chatLink).toHaveAttribute("href", "/chat");
  });

  it("includes a chat icon (SVG) for the Chat nav item", () => {
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const chatLink = screen.getByText("Chat").closest("a");
    // lucide-react renders an <svg> inside the link
    expect(chatLink?.querySelector("svg")).toBeInTheDocument();
  });

  it("highlights the Dashboard item when on /", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const dashLink = screen.getByText("Dashboard").closest("a");
    // Active link has indigo class
    expect(dashLink?.className).toContain("indigo");
  });

  it("highlights the Chat item when on /chat", () => {
    mockUsePathname.mockReturnValue("/chat");
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const chatLink = screen.getByText("Chat").closest("a");
    expect(chatLink?.className).toContain("indigo");
  });

  it("does not highlight Chat when on a different route", () => {
    mockUsePathname.mockReturnValue("/agents");
    render(<Sidebar collapsed={false} onToggle={onToggle} />);
    const chatLink = screen.getByText("Chat").closest("a");
    expect(chatLink?.className).not.toContain("indigo");
  });

  it("hides labels when collapsed", () => {
    const { container } = render(
      <Sidebar collapsed={true} onToggle={onToggle} />
    );
    // Labels should not be visible text
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    // Icons (SVGs) still render — nav links are still present
    const navLinks = container.querySelectorAll("a");
    expect(navLinks.length).toBeGreaterThanOrEqual(8);
  });

  it("calls onToggle when the collapse button is clicked", async () => {
    const { container } = render(
      <Sidebar collapsed={false} onToggle={onToggle} />
    );
    // The toggle button is a standalone button (not inside an <a>)
    // It's positioned after all the nav links
    const allButtons = container.querySelectorAll("button");
    // The collapse toggle is the last button in the sidebar
    const toggleBtn = allButtons[allButtons.length - 1];
    expect(toggleBtn).toBeTruthy();
    await userEvent.click(toggleBtn!);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
