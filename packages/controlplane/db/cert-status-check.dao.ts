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

  static async listForCert(certId: string): Promise<CertStatusCheck[]> {
    return prisma.certStatusCheck.findMany({
      where: { certId },
      orderBy: { checkedAt: "desc" },
    });
  }
}
