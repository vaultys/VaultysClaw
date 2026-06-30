/**
 * Thin fetch wrapper around the control-plane REST API.
 *
 * Authentication is the NextAuth session cookie captured at `login` time; it is
 * attached to every request via the Cookie header (no API keys).
 */

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Session cookie value to send. */
  cookie?: string;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

export interface RawResponse<T = unknown> {
  status: number;
  data: T;
  /** Set-Cookie values returned by the server (used by the login flow). */
  setCookies: string[];
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions["query"]
): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function readSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Perform a request and return the raw status/body without throwing on 4xx/5xx. */
export async function rawApi<T = unknown>(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {}
): Promise<RawResponse<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;

  const res = await fetch(buildUrl(baseUrl, path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data: data as T, setCookies: readSetCookies(res) };
}

/** Perform a request, throwing {@link ApiError} on any non-2xx response. */
export async function api<T = unknown>(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const res = await rawApi<T>(baseUrl, path, opts);
  if (res.status < 200 || res.status >= 300) {
    const body = res.data as { error?: string; code?: string } | string | null;
    const message =
      body && typeof body === "object" && body.error
        ? body.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, res.data);
  }
  return res.data;
}
