/**
 * Unit tests for the rich notification email renderer
 * (packages/notifier/src/email.ts). Pure function — no Prisma / SMTP.
 */

import { describe, it, expect } from "vitest";
import { buildEmail, escapeHtml } from "../packages/notifier/src/email";

const BASE = "https://vc.example.com";

describe("buildEmail", () => {
  it("builds an absolute deep-link action button", () => {
    const email = buildEmail(
      "workspace.agent_added",
      { workspaceId: "ws-1", workspaceName: "Ops", agentName: "Bot" },
      BASE
    );
    expect(email.subject).toBe("Agent added");
    expect(email.html).toContain(`${BASE}/workspaces/ws-1`);
    expect(email.html).toContain("View workspace");
    // details present
    expect(email.html).toContain("Ops");
    expect(email.html).toContain("Bot");
    // text fallback carries the link
    expect(email.text).toContain(`${BASE}/workspaces/ws-1`);
  });

  it("includes the error and a run link for workflow.failed", () => {
    const email = buildEmail(
      "workflow.failed",
      { workflowName: "Nightly Sync", runId: "run-9", error: "boom" },
      BASE
    );
    expect(email.html).toContain("Nightly Sync");
    expect(email.html).toContain("boom");
    expect(email.html).toContain(`${BASE}/admin/workflows/runs/run-9`);
  });

  it("omits the CTA button for events with no meaningful action", () => {
    const removed = buildEmail(
      "workspace.member_removed",
      { workspaceName: "Ops" },
      BASE
    );
    // The CTA button uses this exact padding; the footer prefs link does not.
    expect(removed.html).not.toContain("padding:12px 28px");
    const del = buildEmail("agent.deleted", { agentName: "Bot" }, BASE);
    expect(del.html).not.toContain("padding:12px 28px");
  });

  it("escapes HTML in payload values", () => {
    const email = buildEmail(
      "agent.created",
      { agentDid: "did:x", agentName: "<script>alert(1)</script>" },
      BASE
    );
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("normalises a trailing slash in the base URL", () => {
    const email = buildEmail(
      "agent.pending",
      { agentName: "Bot", agentDid: "did:x" },
      "https://vc.example.com/"
    );
    expect(email.html).toContain("https://vc.example.com/admin/registrations");
    expect(email.html).not.toContain("com//admin");
  });

  it("uses the resolved actor name when provided", () => {
    const email = buildEmail(
      "workspace.created",
      { workspaceId: "ws-2", workspaceName: "Sales" },
      BASE,
      "Alice"
    );
    expect(email.html).toContain("Alice");
    expect(email.html).toContain(`${BASE}/workspaces/ws-2`);
  });

  it("always links to notification preferences in the footer", () => {
    const email = buildEmail("user.joined", { name: "Bob" }, BASE);
    expect(email.html).toContain(`${BASE}/app/settings/notifications`);
  });
});

describe("escapeHtml", () => {
  it("escapes the dangerous characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
    );
    expect(escapeHtml(null)).toBe("");
  });
});
