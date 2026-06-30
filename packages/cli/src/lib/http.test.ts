import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, rawApi, ApiError } from "./http.js";

const origFetch = global.fetch;

function jsonResponse(
  status: number,
  body: unknown,
  setCookies: string[] = []
): Response {
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

describe("rawApi", () => {
  it("sends cookie + JSON body and returns parsed data without throwing on 4xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(403, { decision: "DENY", reason: 'no capability "x"' })
    );

    const res = await rawApi("http://cp", "/api/intents", {
      method: "POST",
      cookie: "next-auth.session-token=S",
      body: { agentId: "did:x", action: "x" },
    });

    expect(res.status).toBe(403);
    expect((res.data as { decision: string }).decision).toBe("DENY");

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Cookie"]).toBe("next-auth.session-token=S");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ agentId: "did:x", action: "x" });
  });

  it("captures Set-Cookie headers", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { ok: true }, ["next-auth.session-token=ABC; Path=/"])
    );
    const res = await rawApi("http://cp", "/api/auth/csrf");
    expect(res.setCookies.some((c) => c.includes("next-auth.session-token=ABC"))).toBe(
      true
    );
  });

  it("encodes query params (skipping undefined)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, {})
    );
    await rawApi("http://cp", "/api/intents", {
      query: { last: 5, agentDid: undefined },
    });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("http://cp/api/intents?last=5");
  });
});

describe("api", () => {
  it("returns the body on 2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { items: [1, 2] })
    );
    const data = await api<{ items: number[] }>("http://cp", "/api/agents");
    expect(data.items).toEqual([1, 2]);
  });

  it("throws ApiError with the server's error message on non-2xx", async () => {
    // Fresh Response per call (a Response body can only be read once).
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () =>
      jsonResponse(403, { error: "Forbidden", code: "FORBIDDEN" })
    );
    const err = await api("http://cp", "/api/policies", { method: "POST" }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Forbidden");
    expect((err as ApiError).status).toBe(403);
  });
});
