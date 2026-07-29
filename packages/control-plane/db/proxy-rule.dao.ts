import { prisma } from "./client";
import type { ProxyRule } from "@prisma/client";
import type { ProxyPrincipalIdSource } from "@vaultysclaw/shared";
import { Prisma } from "@prisma/client";

export class ProxyRuleDAO {
  static async create(data: {
    proxyDid: string;
    method: string;
    urlPattern: string;
    mode: "no_check" | "governed";
    governanceRule?: string;
    principalIdSource?: ProxyPrincipalIdSource;
  }): Promise<ProxyRule> {
    return prisma.proxyRule.create({
      data: {
        proxyDid: data.proxyDid,
        method: data.method,
        urlPattern: data.urlPattern,
        mode: data.mode,
        governanceRule: data.governanceRule ?? null,
        principalIdSource: (data.principalIdSource ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  static async listByProxy(proxyDid: string): Promise<ProxyRule[]> {
    return prisma.proxyRule.findMany({ where: { proxyDid } });
  }

  static async update(
    id: string,
    data: {
      method?: string;
      urlPattern?: string;
      mode?: "no_check" | "governed";
      governanceRule?: string | null;
      principalIdSource?: ProxyPrincipalIdSource | null;
    }
  ): Promise<ProxyRule> {
    const { principalIdSource, ...rest } = data;
    return prisma.proxyRule.update({
      where: { id },
      data: {
        ...rest,
        ...(principalIdSource !== undefined
          ? { principalIdSource: (principalIdSource ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.proxyRule.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
