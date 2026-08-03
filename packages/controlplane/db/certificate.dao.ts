import { prisma } from "./client";
import type { CapabilityCertificate } from "@prisma/client";
import type { AgentCapability, CertScope, ResourceLimits } from "@vaultysclaw/policy";
import type { CapabilityCertificateLite, CertificateStatus } from "@vaultysclaw/trust";

/** Maps a DB row to the lite shape `resolvePermission` needs — the DB-aware/pure boundary. */
export function toLite(row: CapabilityCertificate): CapabilityCertificateLite {
  return {
    id: row.id,
    agentDid: row.agentDid,
    capabilities: row.capabilities as AgentCapability[],
    resourceLimits: row.resourceLimits as ResourceLimits | null,
    scope: row.scope as CertScope | null,
    status: row.status as CertificateStatus,
    issuedAt: row.issuedAt.getTime(),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
  };
}

export class CapabilityCertificateDAO {
  static async create(input: {
    id: string;
    agentDid: string;
    workspaceId?: string | null;
    capabilities: AgentCapability[];
    resourceLimits?: ResourceLimits | null;
    scope?: CertScope | null;
    certificate: string;
    requestCertificate: string;
    /** null = does not auto-expire (rare — docs/CERTIFICATE_WEB_OF_TRUST.md §3.3). */
    expiresAt: number | null;
    issuedBy?: string | null;
  }): Promise<CapabilityCertificate> {
    return prisma.capabilityCertificate.create({
      data: {
        id: input.id,
        agentDid: input.agentDid,
        workspaceId: input.workspaceId ?? null,
        capabilities: input.capabilities as never,
        resourceLimits: (input.resourceLimits ?? null) as never,
        scope: (input.scope ?? null) as never,
        certificate: input.certificate,
        requestCertificate: input.requestCertificate,
        expiresAt: input.expiresAt !== null ? new Date(input.expiresAt) : null,
        issuedBy: input.issuedBy ?? null,
      },
    });
  }

  static async findById(id: string): Promise<CapabilityCertificate | null> {
    return prisma.capabilityCertificate.findUnique({ where: { id } });
  }

  /** Every certificate for a Principal, active or not — the caller (packages/trust) decides usability. */
  static async findAllForPrincipal(agentDid: string): Promise<CapabilityCertificateLite[]> {
    const rows = await prisma.capabilityCertificate.findMany({ where: { agentDid } });
    return rows.map(toLite);
  }

  /**
   * Whether any Principal anywhere holds a current, active certificate for
   * `capability` — the bootstrap-admin existence check
   * (docs/REBUILD_ARCHITECTURE.md §4.5) and, more generally, any "does this
   * capability exist at all yet" query.
   */
  static async existsActiveWithCapability(capability: string): Promise<boolean> {
    const count = await prisma.capabilityCertificate.count({
      where: {
        status: "active",
        capabilities: { array_contains: capability } as never,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return count > 0;
  }

  static async revoke(
    id: string,
    revokedBy: string,
    reason: string
  ): Promise<CapabilityCertificate> {
    return prisma.capabilityCertificate.update({
      where: { id },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason,
      },
    });
  }

  static async list(filter?: {
    agentDid?: string;
    status?: string;
  }): Promise<CapabilityCertificate[]> {
    return prisma.capabilityCertificate.findMany({
      where: { agentDid: filter?.agentDid, status: filter?.status },
      orderBy: { issuedAt: "desc" },
    });
  }
}
