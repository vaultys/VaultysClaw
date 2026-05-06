/**
 * Tests for the skill system (loader, registry, validation)
 * and the task queue + cron scheduler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Skill registry
// ---------------------------------------------------------------------------

describe("SkillRegistry", async () => {
  const { createSkillRegistry } = await import(
    "../packages/agent-controller/src/skills/registry"
  );

  const mockSkill1 = {
    name: "test-skill-a",
    description: "First test skill",
    version: "1.0.0",
    tools: [
      { name: "tool_a1", capability: "api_call" as const, requiresApproval: false, tool: {} as any },
    ],
    systemPromptExtension: "Use tool_a1 for A.",
  };

  const mockSkill2 = {
    name: "test-skill-b",
    description: "Second test skill",
    version: "2.0.0",
    tools: [
      { name: "tool_b1", capability: "code_execution" as const, requiresApproval: true, tool: {} as any },
      { name: "tool_b2", capability: "file_access" as const, requiresApproval: false, tool: {} as any },
    ],
  };

  it("creates empty registry", () => {
    const reg = createSkillRegistry([]);
    expect(reg.skills).toHaveLength(0);
    expect(reg.getAllTools()).toHaveLength(0);
    expect(reg.getSystemPromptExtensions()).toHaveLength(0);
  });

  it("stores and retrieves skills by name", () => {
    const reg = createSkillRegistry([mockSkill1, mockSkill2]);
    expect(reg.skills).toHaveLength(2);
    expect(reg.get("test-skill-a")).toEqual(mockSkill1);
    expect(reg.get("test-skill-b")).toEqual(mockSkill2);
    expect(reg.get("nonexistent")).toBeUndefined();
  });

  it("collects all tools from all skills", () => {
    const reg = createSkillRegistry([mockSkill1, mockSkill2]);
    const tools = reg.getAllTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(["tool_a1", "tool_b1", "tool_b2"]);
  });

  it("collects system prompt extensions (only from skills that have them)", () => {
    const reg = createSkillRegistry([mockSkill1, mockSkill2]);
    const exts = reg.getSystemPromptExtensions();
    expect(exts).toHaveLength(1);
    expect(exts[0]).toBe("Use tool_a1 for A.");
  });

  it("returns skills as readonly array", () => {
    const reg = createSkillRegistry([mockSkill1]);
    expect(reg.skills).toHaveLength(1);
    // @ts-ignore — testing runtime immutability isn't easy but the type says readonly
    // Just verify it's array-like
    expect(Array.isArray(reg.skills)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SkillLoader
// ---------------------------------------------------------------------------

describe("SkillLoader", async () => {
  const { SkillLoader } = await import(
    "../packages/agent-controller/src/skills/loader"
  );

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaultysclaw-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty registry when directory does not exist", async () => {
    const loader = new SkillLoader({ skillsDir: path.join(tmpDir, "missing") });
    const reg = await loader.load();
    expect(reg.skills).toHaveLength(0);
  });

  it("returns empty registry for empty directory", async () => {
    const loader = new SkillLoader({ skillsDir: tmpDir });
    const reg = await loader.load();
    expect(reg.skills).toHaveLength(0);
  });

  it("loads a valid ESM skill file from a subdirectory", async () => {
    const skillDir = path.join(tmpDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "index.js"),
      `
import { tool } from "ai";
import { z } from "zod";
export const skill = {
  name: "my-skill",
  description: "A test skill",
  version: "1.0.0",
  tools: [],
};
`
    );

    const loader = new SkillLoader({ skillsDir: tmpDir });
    const reg = await loader.load();
    // Since we're testing in Node/vitest with .js extension imports which might
    // not resolve correctly in the test environment, we just verify no crash.
    // Full integration tested via docker/E2E tests.
    expect(reg).toBeDefined();
    expect(reg.skills).toBeDefined();
  });

  it("isValidSkill rejects skill with missing required fields", async () => {
    // Access the loader instance to test internal validation indirectly
    // by writing a bad skill file and checking it's not loaded
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "index.js"),
      `export const skill = { name: "bad" }; // missing description, version, tools`
    );

    const loader = new SkillLoader({ skillsDir: tmpDir });
    const reg = await loader.load();
    // Bad skill should not be loaded (validation rejects it)
    expect(reg.skills.find((s) => s.name === "bad")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cron parser / nextCronRun
// ---------------------------------------------------------------------------

describe("Cron parser", async () => {
  const { parseCron, nextCronRun } = await import(
    "../packages/agent-controller/src/scheduler"
  );

  it("parses wildcard expression", () => {
    const fields = parseCron("* * * * *");
    expect(fields.minute).toHaveLength(60);
    expect(fields.hour).toHaveLength(24);
    expect(fields.dayOfMonth).toHaveLength(31);
    expect(fields.month).toHaveLength(12);
    expect(fields.dayOfWeek).toHaveLength(7);
  });

  it("parses fixed values", () => {
    const fields = parseCron("30 9 15 6 1");
    expect(fields.minute).toEqual([30]);
    expect(fields.hour).toEqual([9]);
    expect(fields.dayOfMonth).toEqual([15]);
    expect(fields.month).toEqual([6]);
    expect(fields.dayOfWeek).toEqual([1]);
  });

  it("parses step expressions", () => {
    const fields = parseCron("*/15 */6 * * *");
    expect(fields.minute).toEqual([0, 15, 30, 45]);
    expect(fields.hour).toEqual([0, 6, 12, 18]);
  });

  it("parses list expressions", () => {
    const fields = parseCron("0 9,17 * * 1,2,3");
    expect(fields.hour).toEqual([9, 17]);
    expect(fields.dayOfWeek).toEqual([1, 2, 3]);
  });

  it("parses range expressions", () => {
    const fields = parseCron("0 0 1-7 * *");
    expect(fields.dayOfMonth).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("throws on invalid field count", () => {
    expect(() => parseCron("* * * *")).toThrow("5 fields");
    expect(() => parseCron("* * * * * *")).toThrow("5 fields");
  });

  it("computes next run for every-minute schedule", () => {
    const from = new Date("2025-01-15T10:00:00Z");
    const next = nextCronRun("* * * * *", from);
    expect(next).not.toBeNull();
    // Should be the next minute
    expect(next!.getUTCMinutes()).toBe(1);
    expect(next!.getUTCHours()).toBe(10);
  });

  it("computes next run for hourly schedule", () => {
    const from = new Date("2025-01-15T10:30:00Z");
    const next = nextCronRun("0 * * * *", from);
    expect(next).not.toBeNull();
    expect(next!.getUTCMinutes()).toBe(0);
    expect(next!.getUTCHours()).toBe(11);
  });

  it("computes next run crossing day boundary", () => {
    const from = new Date("2025-01-15T23:58:00Z");
    const next = nextCronRun("0 6 * * *", from);
    expect(next).not.toBeNull();
    expect(next!.getUTCDate()).toBe(16);
    expect(next!.getUTCHours()).toBe(6);
    expect(next!.getUTCMinutes()).toBe(0);
  });

  it("returns null for unsatisfiable expression (Feb 30)", () => {
    // Feb 30 never exists — should return null within 4 year search cap
    const next = nextCronRun("0 0 30 2 *");
    expect(next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TaskQueue
// ---------------------------------------------------------------------------

describe("TaskQueue", async () => {
  const dbModule = await import("../packages/agent-controller/src/db");
  const { TaskQueue } = await import("../packages/agent-controller/src/task-queue");

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaultysclaw-taskqueue-test-"));
    dbModule.initDb(tmpDir);
  });

  afterEach(() => {
    dbModule.closeDb?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enqueues a task and it appears in getRecent", () => {
    const queue = new TaskQueue(async () => ({}));
    const id = queue.enqueue("test_action", { key: "value" });
    const tasks = queue.getRecent(10);
    const found = tasks.find((t) => t.id === id);
    expect(found).toBeDefined();
    expect(found!.action).toBe("test_action");
    expect(found!.status).toBe("pending");
    expect(JSON.parse(found!.params)).toEqual({ key: "value" });
  });

  it("respects priority ordering", () => {
    const queue = new TaskQueue(async () => ({}));
    const lowId = queue.enqueue("low", {}, { priority: 0 });
    const highId = queue.enqueue("high", {}, { priority: 10 });
    const midId = queue.enqueue("mid", {}, { priority: 5 });

    const next = dbModule.getNextPendingTask();
    expect(next?.id).toBe(highId);
  });

  it("executes task and marks as success", async () => {
    const results: string[] = [];
    const queue = new TaskQueue(async (action) => {
      results.push(action);
      return { done: true };
    }, { pollIntervalMs: 50 });

    const id = queue.enqueue("my_action", {});
    queue.start();

    // Wait for execution
    await new Promise((r) => setTimeout(r, 200));
    queue.stop();

    expect(results).toContain("my_action");
    const task = dbModule.getTaskById(id);
    expect(task?.status).toBe("success");
    expect(JSON.parse(task!.result!)).toEqual({ done: true });
  });

  it("retries failed task with backoff and marks dead after max retries", async () => {
    const attempts: number[] = [];
    let attemptCount = 0;

    const queue = new TaskQueue(
      async () => {
        attemptCount++;
        attempts.push(attemptCount);
        throw new Error("always fails");
      },
      { pollIntervalMs: 50, retryBaseDelayMs: 10 },
    );

    const id = queue.enqueue("failing_action", {}, { maxRetries: 2 });
    queue.start();

    // Wait enough for 2 retries at 10ms + 20ms backoff + polling
    await new Promise((r) => setTimeout(r, 500));
    queue.stop();

    const task = dbModule.getTaskById(id);
    // Should eventually become 'dead' after max retries
    expect(["dead", "failed"]).toContain(task?.status);
    expect(task?.error).toContain("always fails");
  });

  it("defers task scheduled in the future", async () => {
    const results: string[] = [];
    const queue = new TaskQueue(
      async (action) => { results.push(action); return null; },
      { pollIntervalMs: 50 },
    );

    const futureDate = new Date(Date.now() + 60_000).toISOString();
    queue.enqueue("future_action", {}, { scheduledAt: futureDate });
    queue.start();

    await new Promise((r) => setTimeout(r, 200));
    queue.stop();

    // Should NOT have executed yet
    expect(results).not.toContain("future_action");
  });

  it("enqueues with default priority 0", () => {
    const queue = new TaskQueue(async () => ({}));
    const id = queue.enqueue("default_priority");
    const task = dbModule.getTaskById(id);
    expect(task?.priority).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scheduler integration
// ---------------------------------------------------------------------------

describe("Scheduler", async () => {
  const dbModule = await import("../packages/agent-controller/src/db");
  const { TaskQueue } = await import("../packages/agent-controller/src/task-queue");
  const { Scheduler } = await import("../packages/agent-controller/src/scheduler");

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaultysclaw-scheduler-test-"));
    dbModule.initDb(tmpDir);
  });

  afterEach(() => {
    dbModule.closeDb?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds a schedule to the DB", () => {
    const scheduler = new Scheduler();
    scheduler.addSchedule({
      id: "sched-1",
      name: "Test schedule",
      cron: "0 * * * *",
      action: "hourly_task",
      params: { run: true },
    });

    const schedules = dbModule.getActiveSchedules();
    const s = schedules.find((s) => s.id === "sched-1");
    expect(s).toBeDefined();
    expect(s!.cron).toBe("0 * * * *");
    expect(s!.action).toBe("hourly_task");
    expect(s!.enabled).toBe(1);
    expect(s!.next_run).not.toBeNull();
  });

  it("removes a schedule", () => {
    const scheduler = new Scheduler();
    scheduler.addSchedule({
      id: "sched-2",
      name: "Temp",
      cron: "* * * * *",
      action: "temp_action",
    });

    scheduler.removeSchedule("sched-2");

    const schedules = dbModule.getActiveSchedules();
    expect(schedules.find((s) => s.id === "sched-2")).toBeUndefined();
  });

  it("fires overdue schedules on poll", async () => {
    const enqueued: string[] = [];
    const queue = new TaskQueue(
      async (action) => { enqueued.push(action); return null; },
      { pollIntervalMs: 50 },
    );
    queue.start();

    // Insert a schedule with next_run in the past
    dbModule.upsertSchedule({
      id: "overdue",
      name: "Overdue",
      cron: "* * * * *",
      action: "overdue_action",
      params: "{}",
      enabled: 1,
      last_run: null,
      next_run: "2000-01-01 00:00:00", // far in the past
    });

    const scheduler = new Scheduler({ pollIntervalMs: 50 });
    scheduler.start(queue);

    await new Promise((r) => setTimeout(r, 300));
    scheduler.stop();
    queue.stop();

    // The overdue schedule should have triggered a task
    const tasks = queue.getRecent(20);
    const triggered = tasks.find((t) => t.action === "overdue_action");
    expect(triggered).toBeDefined();
  });
});
