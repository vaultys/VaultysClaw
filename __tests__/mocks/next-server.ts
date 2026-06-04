/**
 * Vitest stub for "next/server".
 * Aliased via vitest.config.mjs so route-handler tests can inspect responses
 * without spinning up a real Next.js server.
 */

export const NextResponse = {
  json(body: unknown, init?: { status?: number }) {
    const status = init?.status ?? 200;
    return {
      _body: body,
      _status: status,
      status,
      async json() {
        return body;
      },
    };
  },
};

// Re-export NextRequest as a no-op class so imports don't break
export class NextRequest {
  url: string;
  nextUrl: { searchParams: URLSearchParams };
  private _body: unknown;

  constructor(url = "http://localhost/api", init?: { body?: unknown }) {
    this.url = url;
    this.nextUrl = { searchParams: new URL(url).searchParams };
    this._body = init?.body ?? {};
  }

  async json() {
    return this._body;
  }
}
