/**
 * Minimal cookie jar — accumulates Set-Cookie values and serializes them back
 * into a single Cookie header. Enough for the NextAuth CSRF + session handshake.
 */
export class CookieJar {
  private jar = new Map<string, string>();

  /** Absorb one or more raw Set-Cookie header values. */
  addSetCookies(setCookies: string[]): void {
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.jar.set(name, value);
    }
  }

  /** Serialize the jar into a Cookie header value. */
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name: string): boolean {
    return this.jar.has(name);
  }

  get size(): number {
    return this.jar.size;
  }
}
