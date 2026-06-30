import { describe, it, expect } from "vitest";
import { CookieJar } from "./cookies.js";

describe("CookieJar", () => {
  it("absorbs Set-Cookie values and serializes a Cookie header", () => {
    const jar = new CookieJar();
    jar.addSetCookies([
      "next-auth.csrf-token=abc%7Cdef; Path=/; HttpOnly; SameSite=Lax",
      "next-auth.callback-url=http%3A%2F%2Flocalhost; Path=/",
    ]);
    jar.addSetCookies([
      "next-auth.session-token=THE_SESSION; Path=/; HttpOnly; SameSite=Lax",
    ]);

    expect(jar.has("next-auth.session-token")).toBe(true);
    expect(jar.size).toBe(3);
    const header = jar.header();
    expect(header).toContain("next-auth.csrf-token=abc%7Cdef");
    expect(header).toContain("next-auth.session-token=THE_SESSION");
  });

  it("later values overwrite earlier ones for the same name", () => {
    const jar = new CookieJar();
    jar.addSetCookies(["next-auth.session-token=OLD; Path=/"]);
    jar.addSetCookies(["next-auth.session-token=NEW; Path=/"]);
    expect(jar.header()).toBe("next-auth.session-token=NEW");
  });

  it("ignores malformed Set-Cookie entries", () => {
    const jar = new CookieJar();
    jar.addSetCookies(["", "novalue", "=leadingeq"]);
    expect(jar.size).toBe(0);
  });
});
