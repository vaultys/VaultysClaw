import { describe, it, expect, vi, beforeEach } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("./http.js", () => ({ api: apiMock }));

import { resolveAgent } from "./agents.js";

beforeEach(() => apiMock.mockReset());

describe("resolveAgent", () => {
  it("resolves a unique name to its DID + capabilities", async () => {
    apiMock.mockResolvedValue({
      items: [
        { did: "did:vaultys:1", name: "billing-bot", capabilities: ["read_database"] },
      ],
    });
    const a = await resolveAgent("http://cp", "cookie", "billing-bot");
    expect(a).toEqual({
      did: "did:vaultys:1",
      name: "billing-bot",
      capabilities: ["read_database"],
    });
    // Searches by name.
    expect(apiMock.mock.calls[0][2].query.search).toBe("billing-bot");
  });

  it("passes a DID straight through (filters by did, no search term)", async () => {
    apiMock.mockResolvedValue({
      items: [{ did: "did:vaultys:9", name: "x", capabilities: [] }],
    });
    const a = await resolveAgent("http://cp", "cookie", "did:vaultys:9");
    expect(a.did).toBe("did:vaultys:9");
    expect(apiMock.mock.calls[0][2].query.search).toBeUndefined();
  });

  it("throws when no agent matches", async () => {
    apiMock.mockResolvedValue({ items: [] });
    await expect(resolveAgent("http://cp", "cookie", "ghost")).rejects.toThrow(
      /No agent found/
    );
  });

  it("throws when the name is ambiguous", async () => {
    apiMock.mockResolvedValue({
      items: [
        { did: "did:a", name: "dup", capabilities: [] },
        { did: "did:b", name: "dup", capabilities: [] },
      ],
    });
    await expect(resolveAgent("http://cp", "cookie", "dup")).rejects.toThrow(
      /Multiple agents/
    );
  });
});
