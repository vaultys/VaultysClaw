/**
 * Detection of a unique-constraint violation on a human's email address.
 *
 * Worth its own test because the check is easy to write in a way that silently never fires. Prisma
 * documents the offending fields as `meta.target`; with the `pg` driver adapter this codebase
 * actually uses, `meta.target` is **undefined** and the fields arrive nested under
 * `meta.driverAdapterError.cause.constraint.fields`. A guard written to the documented shape alone
 * reads as though duplicates were handled while the raw P2002 escapes exactly as before — which is
 * how an invitation redemption came to 500 halfway through the handshake.
 *
 * The first fixture below is the real error object captured from Postgres, not an invention.
 */
import { describe, it, expect } from "vitest";
import { DuplicateEmailError, isUniqueEmailViolation } from "@/db/user.dao";

/** The shape the pg adapter actually produces — captured from a live Postgres. */
const PG_ADAPTER_ERROR = {
  code: "P2002",
  meta: {
    modelName: "Actor",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage: 'duplicate key value violates unique constraint "User_email_key"',
        kind: "UniqueConstraintViolation",
        constraint: { fields: ["email"] },
      },
    },
  },
};

/** The shape Prisma's documentation describes. */
const DOCUMENTED_ERROR = { code: "P2002", meta: { target: ["email"] } };

describe("DuplicateEmailError", () => {
  it("names the address, so a caller can report it back", () => {
    const err = new DuplicateEmailError("someone@example.com");
    expect(err.email).toBe("someone@example.com");
    expect(err.message).toContain("someone@example.com");
    expect(err.name).toBe("DuplicateEmailError");
  });

  it("is catchable as itself, distinct from a generic Error", () => {
    expect(new DuplicateEmailError("a@b.c")).toBeInstanceOf(DuplicateEmailError);
    expect(new DuplicateEmailError("a@b.c")).toBeInstanceOf(Error);
  });
});

describe("isUniqueEmailViolation", () => {
  it("detects the pg adapter's nested shape — the one that actually occurs", () => {
    expect(isUniqueEmailViolation(PG_ADAPTER_ERROR)).toBe(true);
  });

  it("detects the documented meta.target shape too", () => {
    expect(isUniqueEmailViolation(DOCUMENTED_ERROR)).toBe(true);
  });

  it("ignores a unique violation on some other column", () => {
    expect(
      isUniqueEmailViolation({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              originalMessage: 'duplicate key value violates unique constraint "Actor_pkey"',
              constraint: { fields: ["did"] },
            },
          },
        },
      })
    ).toBe(false);
  });

  it("ignores errors that are not P2002 at all", () => {
    expect(isUniqueEmailViolation({ code: "P2025", meta: { target: ["email"] } })).toBe(false);
    expect(isUniqueEmailViolation(new Error("email"))).toBe(false);
    expect(isUniqueEmailViolation(null)).toBe(false);
  });
});
