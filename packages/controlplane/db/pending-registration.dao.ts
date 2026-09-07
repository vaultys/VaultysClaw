import { prisma } from "./client";
import type { PendingRegistration } from "@prisma/client";

export class PendingRegistrationDAO {
  static async create(input: {
    id: string;
    did: string;
    publicKey?: string | null;
    sessionId: string;
    name: string;
    kind: string;
    requestedCapabilities: string[];
  }): Promise<PendingRegistration> {
    return prisma.pendingRegistration.create({
      data: {
        id: input.id,
        did: input.did,
        publicKey: input.publicKey ?? null,
        sessionId: input.sessionId,
        name: input.name,
        kind: input.kind,
        requestedCapabilities: input.requestedCapabilities as never,
      },
    });
  }

  static async findById(id: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findUnique({ where: { id } });
  }

  static async findPendingByDid(did: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findFirst({ where: { did, status: "pending" } });
  }

  /** Approved but not yet delivered via the live service:"certificate" exchange (trust doc §3.2b). */
  static async findApprovedUndelivered(did: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findFirst({
      where: { did, status: "approved", deliveredAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Approved-but-undelivered registrations for any of these DIDs.
   *
   * Backs the delivery sweep in `ws-server.ts`: an approval that happened outside this process —
   * a script, a second control-plane instance, direct SQL — never calls
   * `deliverApprovedCapabilities`, so without a sweep the Actor waits until it happens to
   * reconnect. Scoped to the DIDs actually connected right now, since delivery needs a live
   * connection anyway.
   */
  static async findApprovedUndeliveredForDids(dids: string[]): Promise<PendingRegistration[]> {
    if (dids.length === 0) return [];
    return prisma.pendingRegistration.findMany({
      where: { did: { in: dids }, status: "approved", deliveredAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  static async listPending(): Promise<PendingRegistration[]> {
    return prisma.pendingRegistration.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Approved but not yet delivered, across all Actors — surfaced on the Actors page so an
   *  admin can see a grant is "waiting for the agent to be connected" rather than assuming it already landed. */
  static async listApprovedUndelivered(): Promise<PendingRegistration[]> {
    return prisma.pendingRegistration.findMany({
      where: { status: "approved", deliveredAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  /** A connected, already-known Actor asking for more capabilities, or an unknown one
   *  reporting what it wants right after the auth handshake — same row, same approval flow. */
  static async updateRequestedCapabilities(id: string, capabilities: string[]): Promise<void> {
    await prisma.pendingRegistration.update({
      where: { id },
      data: { requestedCapabilities: capabilities as never },
    });
  }

  static async approve(
    id: string,
    assignedCapabilities: string[],
    approvedBy: string,
    targetWorkspaceId?: string | null
  ): Promise<PendingRegistration> {
    return prisma.pendingRegistration.update({
      where: { id },
      data: {
        status: "approved",
        assignedCapabilities: assignedCapabilities as never,
        approvedBy,
        targetWorkspaceId: targetWorkspaceId ?? null,
      },
    });
  }

  static async deny(id: string): Promise<PendingRegistration> {
    return prisma.pendingRegistration.update({
      where: { id },
      data: { status: "denied" },
    });
  }

  static async markDelivered(id: string): Promise<void> {
    await prisma.pendingRegistration.update({
      where: { id },
      data: { deliveredAt: new Date() },
    });
  }
}
