import { randomUUID } from "crypto";
import { prisma } from "./client";
import type { CertStatusCheck } from "@prisma/client";

/** The audit trail behind a certificate's "who has queried its live status, and when"
 *  (docs/CERTIFICATE_WEB_OF_TRUST.md §4.1) — write-only from `ws-server.ts`'s `handleCertStatusRequest`. */
export class CertStatusCheckDAO {
  static async record(input: {
    certId: string;
    requesterDid: string;
    status: string;
  }): Promise<void> {
    await prisma.certStatusCheck.create({
      data: { id: randomUUID(), certId: input.certId, requesterDid: input.requesterDid, status: input.status },
    });
  }

  /**
   * Append many status checks in one statement.
   *
   * This table is append-only audit data whose write rate scales with the *fleet* rather than with
   * admin activity: every Actor re-checking its certificate produces a row, so a short staple TTL
   * across thousands of Actors makes this the busiest insert path in the system. Batching keeps it
   * one round trip per flush instead of one per check.
   *
   * `checkedAt` defaults per row at insert time, so a batched flush still records when each check
   * actually happened rather than when the batch was written — provided the caller passes the
   * timestamp it observed, which is why `checkedAt` is explicit here.
   */
  static async recordBatch(
    rows: { certId: string; requesterDid: string; status: string; checkedAt: Date }[]
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.certStatusCheck.createMany({
      data: rows.map((r) => ({
        id: randomUUID(),
        certId: r.certId,
        requesterDid: r.requesterDid,
        status: r.status,
        checkedAt: r.checkedAt,
      })),
      // A cert deleted between the check and the flush would otherwise fail the whole batch on its
      // foreign key, losing every unrelated row in it.
      skipDuplicates: true,
    });
    return result.count;
  }

  static async listForCert(certId: string): Promise<CertStatusCheck[]> {
    return prisma.certStatusCheck.findMany({
      where: { certId },
      orderBy: { checkedAt: "desc" },
    });
  }
}
