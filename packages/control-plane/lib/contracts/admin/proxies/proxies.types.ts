import type {
  Proxy,
  ProxyUpstream,
  ProxyRule,
  ProxyPrincipal,
  ProxyActivityLog,
} from "@prisma/client";
import { z } from "zod";
import {
  ListProxyLogsQuerySchema,
  CreateUpstreamBodySchema,
  UpdateUpstreamBodySchema,
  CreateRuleBodySchema,
  UpdateRuleBodySchema,
  UpdatePrincipalBodySchema,
  UpdateProxyBodySchema,
} from "./proxies.schemas";

// The persisted rows are owned by Prisma — reuse them directly, same pattern
// as PendingRegistration in the registrations contract.
export type { ProxyUpstream, ProxyRule, ProxyPrincipal, ProxyActivityLog };

export type ProxyInfo = Proxy & {
  online: boolean;
  connectedAt: Date | null;
  lastHeartbeat: Date | null;
  transport: "ws" | "peerjs" | null;
};

export type ListProxyLogsQuery = z.infer<typeof ListProxyLogsQuerySchema>;
export interface ProxyLogsResponse {
  entries: ProxyActivityLog[];
  total: number;
}

export type UpdateProxyBody = z.infer<typeof UpdateProxyBodySchema>;
export type CreateUpstreamBody = z.infer<typeof CreateUpstreamBodySchema>;
export type UpdateUpstreamBody = z.infer<typeof UpdateUpstreamBodySchema>;
export type CreateRuleBody = z.infer<typeof CreateRuleBodySchema>;
export type UpdateRuleBody = z.infer<typeof UpdateRuleBodySchema>;
export type UpdatePrincipalBody = z.infer<typeof UpdatePrincipalBodySchema>;
