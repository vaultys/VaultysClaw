import { describe, it, expect } from "vitest";
import { buildWebhookEventDocs } from "@/lib/webhook-docs";

/** buildWebhookEventDocs returns groups whose events carry a serialized
 *  `{ event, occurredAt, data }` body — flatten to the `data` an admin reads. */
const examples = buildWebhookEventDocs().flatMap((g) =>
  g.events.map((e) => ({ type: e.type, data: JSON.parse(e.exampleBody).data as Record<string, unknown> }))
);

describe("webhook docs", () => {
  it("gives every documented event a non-empty example", () => {
    // Root CLAUDE.md: a new event with no EXAMPLE_PAYLOADS entry falls back to
    // {} in the docs, and that is a bug rather than an acceptable default.
    for (const e of examples) {
      expect(Object.keys(e.data), `${e.type} has an empty example`).not.toHaveLength(0);
    }
  });

  it("documents actor.deleted with the certificates it revoked", () => {
    // The ids are the point: those certificate rows cascade away with the Actor,
    // so this payload is the only surviving record that they existed.
    const doc = examples.find((e) => e.type === "actor.deleted");
    expect(doc).toBeDefined();
    expect(doc!.data.revokedCertificateCount).toBe(2);
    expect(doc!.data.revokedCertificateIds).toHaveLength(2);
  });

  it("documents harness.config_updated with its real payload shape", () => {
    const doc = examples.find((e) => e.type === "harness.config_updated");
    expect(doc).toBeDefined();
    expect(doc!.data).toMatchObject({ kind: "harness", mode: "explicit", sandbox: "require" });
    expect(doc!.data.resourceRuleCount).toBe(2);
  });

  it("carries no secret-shaped field in any example", () => {
    // stripSensitive is defence in depth; an example is written by hand and has
    // no such backstop, so a secret here would ship straight into the docs page.
    const forbidden = /secret|token|password|apikey|credential/i;
    for (const e of examples) {
      for (const key of Object.keys(e.data)) {
        expect(forbidden.test(key), `${e.type}.${key} looks like a secret`).toBe(false);
      }
    }
  });
});
