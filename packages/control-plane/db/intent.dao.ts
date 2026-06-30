import { prisma } from "./client";
import type { IntentLog, ActivityLog, Prisma } from "@prisma/client";

export class IntentDAO {
  static async log(
    intentId: string,
    agentDid: string | undefined,
    action: string,
    params: Record<string, unknown>,
    signature?: string | null
  ): Promise<void> {
    await prisma.intentLog.upsert({
      where: { intentId },
      create: {
        intentId,
        agentDid: agentDid ?? null,
        action,
        params: params as Prisma.InputJsonValue,
        signature: signature ?? null,
      },
      update: {},
    });
  }

  /**
   * Record a deny-by-default policy decision (ALLOW or DENY) for an intent.
   * The signature is the server-signed audit envelope so the record is
   * non-repudiable and independently verifiable.
   */
  static async logDecision(opts: {
    intentId: string;
    agentDid: string | undefined;
    action: string;
    params: Record<string, unknown>;
    decision: "ALLOW" | "DENY";
    reason?: string | null;
    signature?: string | null;
    status?: string;
    /** DID of the linked device / identity that initiated this intent. */
    initiatorDid?: string | null;
  }): Promise<void> {
    const data = {
      agentDid: opts.agentDid ?? null,
      action: opts.action,
      params: opts.params as Prisma.InputJsonValue,
      decision: opts.decision,
      reason: opts.reason ?? null,
      signature: opts.signature ?? null,
      initiatorDid: opts.initiatorDid ?? null,
      status: opts.status ?? (opts.decision === "DENY" ? "denied" : "pending"),
    };
    await prisma.intentLog.upsert({
      where: { intentId: opts.intentId },
      create: { intentId: opts.intentId, ...data },
      update: data,
    });
  }

  /** All intents initiated by a specific linked device / identity, newest first. */
  static async findByInitiator(
    initiatorDid: string,
    limit = 100
  ): Promise<IntentLog[]> {
    return prisma.intentLog.findMany({
      where: { initiatorDid },
      orderBy: { sentAt: "desc" },
      take: limit,
    });
  }

  static async updateResult(
    intentId: string,
    status: "success" | "failed",
    output?: unknown,
    error?: string
  ): Promise<void> {
    await prisma.intentLog.update({
      where: { intentId },
      data: {
        status,
        output:
          output !== undefined ? (output as Prisma.InputJsonValue) : undefined,
        error: error ?? null,
        completedAt: new Date(),
      },
    });
  }

  static async findAll(
    limit = 100,
    agentDid?: string,
    /** When set, only return intents sent to one of these agent DIDs. */
    allowedAgentDids?: Set<string>,
    /** Optional status filter (e.g. "success" | "failed" | "pending"). */
    status?: string
  ): Promise<IntentLog[]> {
    if (allowedAgentDids !== undefined && allowedAgentDids.size === 0)
      return []; // user has no accessible agents
    const where: Prisma.IntentLogWhereInput = {};
    if (agentDid) {
      // Single-agent filter: only return if it's in the allowed set (when set)
      if (allowedAgentDids && !allowedAgentDids.has(agentDid)) return [];
      where.agentDid = agentDid;
    } else if (allowedAgentDids) {
      where.agentDid = { in: Array.from(allowedAgentDids) };
    }
    if (status) where.status = status;
    return prisma.intentLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
    });
  }
}

export class ActivityLogDAO {
  static async log(
    event: string,
    agentDid?: string,
    agentName?: string,
    details?: string
  ): Promise<void> {
    await prisma.activityLog.create({
      data: {
        event,
        agentDid: agentDid ?? null,
        agentName: agentName ?? null,
        details: details ?? null,
      },
    });
  }

  static async findAll(limit = 100): Promise<ActivityLog[]> {
    return prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async findByEvent(event: string, limit = 50): Promise<ActivityLog[]> {
    return prisma.activityLog.findMany({
      where: { event },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async findByAgent(
    agentDid: string,
    limit = 100
  ): Promise<ActivityLog[]> {
    return prisma.activityLog.findMany({
      where: { agentDid },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
