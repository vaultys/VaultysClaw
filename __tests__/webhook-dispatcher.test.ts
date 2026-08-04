/**
 * Unit tests for the webhook-dispatcher's delivery logic
 * (packages/webhook-dispatcher/src/{sign,delivery}.ts). Everything is exercised
 * through the pure/injectable functions — network access and the subscription
 * lookup are stubbed — so no Redis, DB or real HTTP is needed.
 */

import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import type { WebhookJob } from "@vaultysclaw/shared";
import { sign } from "../packages/webhook-dispatcher/src/sign";
import {
  buildDeadLetter,
  buildDeliveryRequest,
  deliverOne,
  processWebhookJob,
  processNotificationJob,
  selectTargets,
  selectNotificationTargets,
  shouldDeadLetter,
  type ProcessDeps,
  type NotificationDeps,
  type WebhookSubscription,
  type NotificationChannelSubscription,
} from "../packages/webhook-dispatcher/src/delivery";
import { renderNotification } from "../packages/webhook-dispatcher/src/render";

const SECRET = "whsec_test_123";

const JOB: WebhookJob = {
  eventType: "workspace.created",
  payload: { id: "ws-1", name: "Marketing" },
  occurredAt: "2026-07-16T10:00:00.000Z",
};

function sub(id: string, events: string[]): WebhookSubscription {
  return { id, url: `https://hook.example/${id}`, secret: SECRET, events };
}

function chan(id: string, events: string[]): NotificationChannelSubscription {
  return { id, appriseKey: `key-${id}`, events };
}

/** A fetch stub that resolves with a given status. */
function okFetch(status = 200): typeof fetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status })) as unknown as typeof fetch;
}

/** A fetch stub matching Apprise's actual response shape ({ error: null | string }), needed since
 *  notifyApprise always calls res.json() regardless of status. */
function okAppriseFetch(status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ error: null }),
  })) as unknown as typeof fetch;
}

// ── sign ────────────────────────────────────────────────────────────────────

describe("sign", () => {
  it("produces sha256=<hex> over `${timestamp}.${rawBody}`", () => {
    const ts = "1700000000000";
    const body = '{"hello":"world"}';
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(sign(SECRET, ts, body)).toBe(`sha256=${expected}`);
  });

  it("is deterministic and secret-dependent", () => {
    const a = sign(SECRET, "1", "x");
    expect(sign(SECRET, "1", "x")).toBe(a);
    expect(sign("other-secret", "1", "x")).not.toBe(a);
  });

  it("round-trips: a receiver recomputes the same signature", () => {
    const { headers, body } = buildDeliveryRequest({ url: "u", secret: SECRET }, JOB, 1700000000000, "d-1");
    const ts = headers["X-VaultysClaw-Timestamp"];
    const recomputed = sign(SECRET, ts, body);
    const received = headers["X-VaultysClaw-Signature"];
    expect(
      crypto.timingSafeEqual(Buffer.from(recomputed), Buffer.from(received))
    ).toBe(true);
  });
});

// ── buildDeliveryRequest ──────────────────────────────────────────────────────

describe("buildDeliveryRequest", () => {
  it("builds the {event, occurredAt, data} body and all headers", () => {
    const req = buildDeliveryRequest(sub("w1", []), JOB, 1700000000000, "delivery-abc");
    expect(JSON.parse(req.body)).toEqual({
      event: "workspace.created",
      occurredAt: "2026-07-16T10:00:00.000Z",
      data: { id: "ws-1", name: "Marketing" },
    });
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.headers["X-VaultysClaw-Event"]).toBe("workspace.created");
    expect(req.headers["X-VaultysClaw-Delivery"]).toBe("delivery-abc");
    expect(req.headers["X-VaultysClaw-Timestamp"]).toBe("1700000000000");
    expect(req.deliveryId).toBe("delivery-abc");
  });

  it("signs over the injected timestamp and the exact raw body", () => {
    const req = buildDeliveryRequest(sub("w1", []), JOB, 1700000000000, "d");
    expect(req.headers["X-VaultysClaw-Signature"]).toBe(
      sign(SECRET, "1700000000000", req.body)
    );
  });

  it("generates a unique delivery id when none is passed", () => {
    const a = buildDeliveryRequest(sub("w1", []), JOB);
    const b = buildDeliveryRequest(sub("w1", []), JOB);
    expect(a.deliveryId).not.toBe(b.deliveryId);
  });
});

// ── selectTargets ─────────────────────────────────────────────────────────────

describe("selectTargets", () => {
  const subs = [
    sub("a", ["workspace.created", "agent.created"]),
    sub("b", ["agent.created"]),
    sub("c", ["workspace.created"]),
  ];

  it("returns only subscriptions listing the event", () => {
    expect(selectTargets(subs, "workspace.created").map((s) => s.id)).toEqual(["a", "c"]);
    expect(selectTargets(subs, "agent.created").map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("returns none for an unsubscribed event", () => {
    expect(selectTargets(subs, "model.created")).toEqual([]);
  });

  it("tolerates a non-array events column", () => {
    const bad = [{ id: "x", url: "u", secret: "s", events: null }];
    expect(selectTargets(bad as WebhookSubscription[], "workspace.created")).toEqual([]);
  });
});

// ── deliverOne ────────────────────────────────────────────────────────────────

describe("deliverOne", () => {
  it("returns ok on a 2xx response", async () => {
    const out = await deliverOne({ fetch: okFetch(200), timeoutMs: 1000 }, sub("w1", []), JOB);
    expect(out).toMatchObject({ endpointId: "w1", ok: true, status: 200 });
  });

  it("returns a failure with the status on a non-2xx", async () => {
    const out = await deliverOne({ fetch: okFetch(500), timeoutMs: 1000 }, sub("w1", []), JOB);
    expect(out).toMatchObject({ endpointId: "w1", ok: false, status: 500 });
    expect(out.error).toContain("500");
  });

  it("captures a thrown network error instead of throwing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const out = await deliverOne({ fetch: failing, timeoutMs: 1000 }, sub("w1", []), JOB);
    expect(out).toMatchObject({ endpointId: "w1", ok: false });
    expect(out.error).toBe("ECONNREFUSED");
  });

  it("sends the signed request to the endpoint url", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    await deliverOne({ fetch: spy, timeoutMs: 1000 }, sub("w1", []), JOB);
    const [url, init] = (spy as any).mock.calls[0];
    expect(url).toBe("https://hook.example/w1");
    expect(init.method).toBe("POST");
    expect(init.headers["X-VaultysClaw-Signature"]).toMatch(/^sha256=/);
  });
});

// ── processWebhookJob ─────────────────────────────────────────────────────────

describe("processWebhookJob", () => {
  function deps(subs: WebhookSubscription[], fetchImpl: typeof fetch): ProcessDeps {
    return {
      fetch: fetchImpl,
      timeoutMs: 1000,
      loadActiveWebhooks: async () => subs,
    };
  }

  it("skips an unknown event without any delivery", async () => {
    const spy = okFetch();
    const r = await processWebhookJob(deps([sub("a", ["nope"])], spy), {
      ...JOB,
      eventType: "does.not.exist",
    });
    expect(r.skipped).toBe("unknown-event");
    expect(r.targets).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fans out to every matching subscription", async () => {
    const r = await processWebhookJob(
      deps([sub("a", ["workspace.created"]), sub("b", ["workspace.created"]), sub("c", ["agent.created"])], okFetch()),
      JOB
    );
    expect(r.targets).toBe(2);
    expect(r.delivered.sort()).toEqual(["a", "b"]);
    expect(r.failures).toEqual([]);
  });

  it("separates delivered from failed endpoints on a mixed run", async () => {
    // "a" succeeds, "b" 500s.
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: url.endsWith("/a"),
      status: url.endsWith("/a") ? 200 : 500,
    })) as unknown as typeof fetch;
    const r = await processWebhookJob(
      deps([sub("a", ["workspace.created"]), sub("b", ["workspace.created"])], fetchImpl),
      JOB
    );
    expect(r.delivered).toEqual(["a"]);
    expect(r.failures.map((f) => f.endpointId)).toEqual(["b"]);
  });

  it("skips endpoints already delivered on a prior attempt (retry safety)", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const r = await processWebhookJob(
      deps([sub("a", ["workspace.created"]), sub("b", ["workspace.created"])], spy),
      JOB,
      ["a"] // "a" already succeeded on a previous attempt
    );
    expect(r.targets).toBe(1);
    expect(r.failures.map((f) => f.endpointId)).toEqual(["b"]);
    // only "b" was re-attempted, "a" was not re-delivered
    expect((spy as any).mock.calls).toHaveLength(1);
    expect((spy as any).mock.calls[0][0]).toBe("https://hook.example/b");
  });
});

// ── Notification Channels ───────────────────────────────────────────────────

describe("renderNotification", () => {
  it("renders a template for a known event with matching payload fields", () => {
    const r = renderNotification(JOB);
    expect(r).not.toBeNull();
    expect(r!.title).toMatch(/workspace/i);
    expect(r!.body).toContain("Marketing");
    expect(["info", "success", "warning", "failure"]).toContain(r!.type);
  });

  it("returns null for an event type with no template", () => {
    expect(renderNotification({ ...JOB, eventType: "does.not.exist" })).toBeNull();
  });
});

describe("selectNotificationTargets", () => {
  it("matches only channels subscribed to the event", () => {
    const targets = selectNotificationTargets(
      [chan("a", ["workspace.created"]), chan("b", ["actor.approved"])],
      "workspace.created"
    );
    expect(targets.map((t) => t.id)).toEqual(["a"]);
  });

  it("tolerates a non-array events column instead of throwing", () => {
    const targets = selectNotificationTargets(
      [{ id: "a", appriseKey: "key-a", events: null }],
      "workspace.created"
    );
    expect(targets).toEqual([]);
  });
});

describe("processNotificationJob", () => {
  function deps(channels: NotificationChannelSubscription[], fetchImpl: typeof fetch): NotificationDeps {
    return {
      fetch: fetchImpl,
      appriseApiUrl: "http://apprise.internal:8000",
      loadActiveNotificationChannels: async () => channels,
    };
  }

  it("skips when Apprise isn't configured, without touching the DB dependency", async () => {
    const spy = okAppriseFetch();
    const loadActiveNotificationChannels = vi.fn(async () => [chan("a", ["workspace.created"])]);
    const r = await processNotificationJob(
      { fetch: spy, appriseApiUrl: undefined, loadActiveNotificationChannels },
      JOB
    );
    expect(r.skipped).toBe("apprise-not-configured");
    expect(loadActiveNotificationChannels).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips an unknown event without any notification", async () => {
    const spy = okAppriseFetch();
    const r = await processNotificationJob(deps([chan("a", ["does.not.exist"])], spy), {
      ...JOB,
      eventType: "does.not.exist",
    });
    expect(r.skipped).toBe("unknown-event");
    expect(spy).not.toHaveBeenCalled();
  });

  it("fans out to every matching channel with the rendered notification", async () => {
    const spy = okAppriseFetch();
    const r = await processNotificationJob(
      deps([chan("a", ["workspace.created"]), chan("b", ["workspace.created"]), chan("c", ["actor.approved"])], spy),
      JOB
    );
    expect(r.targets).toBe(2);
    expect(r.delivered.sort()).toEqual(["a", "b"]);
    expect(spy).toHaveBeenCalledTimes(2);
    const [url, init] = (spy as any).mock.calls[0];
    expect(url).toBe("http://apprise.internal:8000/notify/key-a");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ title: expect.any(String), body: expect.any(String) });
  });

  it("separates delivered from failed channels on a mixed run", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: url.endsWith("/key-a"),
      status: url.endsWith("/key-a") ? 200 : 500,
      json: async () => ({ error: null }),
    })) as unknown as typeof fetch;
    const r = await processNotificationJob(
      deps([chan("a", ["workspace.created"]), chan("b", ["workspace.created"])], fetchImpl),
      JOB
    );
    expect(r.delivered).toEqual(["a"]);
    expect(r.failures.map((f) => f.channelId)).toEqual(["b"]);
  });

  it("skips channels already notified on a prior attempt (retry safety)", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: null }) })) as unknown as typeof fetch;
    const r = await processNotificationJob(
      deps([chan("a", ["workspace.created"]), chan("b", ["workspace.created"])], spy),
      JOB,
      ["a"] // "a" already succeeded on a previous attempt
    );
    expect(r.targets).toBe(1);
    expect(r.failures.map((f) => f.channelId)).toEqual(["b"]);
    expect((spy as any).mock.calls).toHaveLength(1);
    expect((spy as any).mock.calls[0][0]).toBe("http://apprise.internal:8000/notify/key-b");
  });
});

// ── dead-letter helpers ───────────────────────────────────────────────────────

describe("shouldDeadLetter", () => {
  it("dead-letters only once the retry budget is exhausted", () => {
    expect(shouldDeadLetter(1, 5)).toBe(false);
    expect(shouldDeadLetter(4, 5)).toBe(false);
    expect(shouldDeadLetter(5, 5)).toBe(true);
    expect(shouldDeadLetter(6, 5)).toBe(true);
  });
});

describe("buildDeadLetter", () => {
  it("wraps the job with failure metadata and delivered endpoints", () => {
    const dead = buildDeadLetter(JOB, {
      attemptsMade: 5,
      error: "2/2 webhook deliveries failed",
      deliveredEndpointIds: ["a"],
      failedAt: "2026-07-16T11:00:00.000Z",
    });
    expect(dead).toEqual({
      job: JOB,
      attemptsMade: 5,
      error: "2/2 webhook deliveries failed",
      deliveredEndpointIds: ["a"],
      failedAt: "2026-07-16T11:00:00.000Z",
    });
  });

  it("defaults deliveredEndpointIds and stamps failedAt", () => {
    const dead = buildDeadLetter(JOB, { attemptsMade: 5, error: "boom" });
    expect(dead.deliveredEndpointIds).toEqual([]);
    expect(() => new Date(dead.failedAt).toISOString()).not.toThrow();
  });
});
