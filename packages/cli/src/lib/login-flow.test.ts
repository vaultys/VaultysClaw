import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  requestDeviceLink,
  pollLinkApproval,
  completeNextAuthSignIn,
} from "./login-flow.js";

const origFetch = global.fetch;

function json(status: number, body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const sc of setCookies) headers.append("set-cookie", sc);
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers,
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});
afterEach(() => {
  global.fetch = origFetch;
  vi.restoreAllMocks();
});

describe("requestDeviceLink", () => {
  it("posts the device identity and builds the approval URL", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      json(201, { id: "LINK1", expiresAt: "2026-06-24T00:10:00.000Z" })
    );
    const link = await requestDeviceLink("http://cp", {
      did: "did:vaultys:cli",
      publicKey: "pk",
      name: "laptop",
    });
    expect(link.id).toBe("LINK1");
    expect(link.approvalUrl).toBe("http://cp/devices/link/LINK1");

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("http://cp/api/user/devices/link");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ did: "did:vaultys:cli", name: "laptop" });
  });
});

describe("pollLinkApproval", () => {
  it("resolves once the request is approved", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(json(200, { status: "pending" }))
      .mockResolvedValueOnce(json(200, { status: "approved" }));
    await expect(
      pollLinkApproval("http://cp", "LINK1", { intervalMs: 1 })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the request is rejected", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      json(200, { status: "rejected" })
    );
    await expect(
      pollLinkApproval("http://cp", "LINK1", { intervalMs: 1 })
    ).rejects.toThrow(/rejected/);
  });

  it("throws on expiry", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      json(200, { status: "expired" })
    );
    await expect(
      pollLinkApproval("http://cp", "LINK1", { intervalMs: 1 })
    ).rejects.toThrow(/expired/);
  });
});

describe("completeNextAuthSignIn", () => {
  it("does CSRF → credentials callback → session, capturing the cookie", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        json(200, { csrfToken: "CSRF" }, ["next-auth.csrf-token=CSRF%7Cx; Path=/"])
      )
      .mockResolvedValueOnce(
        json(200, { url: "http://cp" }, [
          "next-auth.session-token=SESSION; Path=/; HttpOnly",
        ])
      )
      .mockResolvedValueOnce(json(200, { user: { did: "did:vaultys:user" } }));

    const result = await completeNextAuthSignIn("http://cp", "KEY123");
    expect(result.did).toBe("did:vaultys:user");
    expect(result.cookie).toContain("next-auth.session-token=SESSION");

    const callbackCall = fetchMock.mock.calls[1];
    expect(String(callbackCall[0])).toContain("/api/auth/callback/credentials");
    expect(callbackCall[1].headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(callbackCall[1].body).toContain("token=KEY123");
  });

  it("throws when no session cookie is returned", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        json(200, { csrfToken: "CSRF" }, ["next-auth.csrf-token=CSRF; Path=/"])
      )
      .mockResolvedValueOnce(json(401, { error: "bad" }));
    await expect(completeNextAuthSignIn("http://cp", "KEY")).rejects.toThrow(
      /no session cookie/i
    );
  });
});
