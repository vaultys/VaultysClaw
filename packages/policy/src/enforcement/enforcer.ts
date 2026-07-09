/**
 * Runtime policy enforcement.
 *
 * `PolicyEnforcer` gates a single agent's intent execution against its active
 * policy: capability grant, policy expiry, daily token budget, and hourly
 * request rate. It is pure and side-effect-free apart from the rolling hourly
 * counter it owns, and takes its clock and token-usage source as injected
 * dependencies so it can be unit-tested without a running agent.
 */
import type { AgentCapability, ResourceLimits } from "../types";

/** Today's token usage, as read from the agent's local accounting. */
export interface DailyTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface PolicyEnforcerDeps {
  /** Returns today's token usage for the daily-budget gate. */
  getDailyTokenUsage: () => DailyTokenUsage | null | undefined;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** Snapshot of the active policy an intent is checked against. */
export interface PolicyContext {
  capabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  policyId: string | null;
  policyExpiresAt: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The legacy action name `"agent"` maps to the `"agent_communication"`
 * capability. Callers that need the resolved capability name (e.g. for
 * delegation checks) should use this so the mapping lives in one place.
 */
export function resolveEffectiveAction(action: string): string {
  return action === "agent" ? "agent_communication" : action;
}

export class PolicyEnforcer {
  /** Rolling hourly request counter for the maxRequestsPerHour gate. */
  private requestsThisHour = { count: 0, hourStart: 0 };
  private readonly now: () => number;

  constructor(private readonly deps: PolicyEnforcerDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Run every policy gate for `action` against `ctx`, in order:
   *   capability → policy expiry → daily token budget → hourly request rate.
   *
   * Throws an `Error` (with a user-facing message) on the first failing gate.
   * On success the hourly request counter is incremented.
   */
  enforce(action: string, ctx: PolicyContext): void {
    this.checkCapability(action, ctx.capabilities);
    this.checkPolicyExpiry(ctx.policyId, ctx.policyExpiresAt);
    this.checkDailyTokenBudget(ctx.resourceLimits);
    this.checkHourlyRequestRate(ctx.resourceLimits);
  }

  /** Reject if the action's capability is not granted. */
  checkCapability(action: string, capabilities: AgentCapability[]): void {
    const effectiveAction = resolveEffectiveAction(action);
    if (!capabilities.includes(effectiveAction as AgentCapability)) {
      throw new Error(`Capability '${action}' not granted`);
    }
  }

  /** Reject if the governing policy has expired. */
  checkPolicyExpiry(
    policyId: string | null,
    policyExpiresAt: string | null
  ): void {
    if (policyExpiresAt) {
      const expiry = new Date(policyExpiresAt).getTime();
      if (!isNaN(expiry) && this.now() > expiry) {
        throw new Error(
          `Policy '${policyId ?? "unknown"}' has expired — action blocked`
        );
      }
    }
  }

  /** Reject if the daily token budget is exhausted. */
  checkDailyTokenBudget(resourceLimits: ResourceLimits | null): void {
    if (resourceLimits?.maxTokensPerDay != null) {
      const daily = this.deps.getDailyTokenUsage();
      const usedToday =
        (daily?.promptTokens ?? 0) + (daily?.completionTokens ?? 0);
      if (usedToday >= resourceLimits.maxTokensPerDay) {
        throw new Error(
          `Daily token budget exhausted (used ${usedToday} / limit ${resourceLimits.maxTokensPerDay})`
        );
      }
    }
  }

  /**
   * Reject if the hourly request rate is exceeded. Rolls the counter window
   * over when an hour has elapsed, and increments it on each successful pass.
   */
  checkHourlyRequestRate(resourceLimits: ResourceLimits | null): void {
    if (resourceLimits?.maxRequestsPerHour != null) {
      const now = this.now();
      if (now - this.requestsThisHour.hourStart > HOUR_MS) {
        // Roll over to a fresh window
        this.requestsThisHour = { count: 0, hourStart: now };
      }
      if (this.requestsThisHour.count >= resourceLimits.maxRequestsPerHour) {
        const resetIn = Math.ceil(
          (this.requestsThisHour.hourStart + HOUR_MS - now) / 1000
        );
        throw new Error(
          `Hourly request limit reached (${resourceLimits.maxRequestsPerHour} req/h) — resets in ${resetIn}s`
        );
      }
      this.requestsThisHour.count++;
    }
  }
}
