import { Prisma } from "@prisma/client";
import { ListAgentsQuerySchema } from "./agents.schemas";
import z from "zod";
import { VaultysCertificate } from "@/types";
import { LlmConfig, VaultysIDInfo } from "@vaultysclaw/shared";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AgentWithInfo = Prisma.AgentGetPayload<{
  select: {
    did: true;
    name: true;
    capabilities: true;
    registeredAt: true;
    lastSeen: true;
    locationLat: true;
    locationLon: true;
    locationLabel: true;
    tokenBudgetDaily: true;
    tokenBudgetMonthly: true;
    publicKey: true;
    llmConfig: true;
    litellmAllowedModels: true;
    litellmDailyBudget: true;
    litellmKeyUpdatedAt: true;
    litellmVirtualKey: true;
  };
  include: {
    tokenHistory: true;
    agentRealms: {
      include: {
        realm: {
          select: {
            id: true;
            name: true;
            slug: true;
            color: true;
            isDefault: true;
          };
        };
      };
    };
    tokenUsage: {
      select: {
        promptTokens: true;
        completionTokens: true;
        updatedAt: true;
      };
    };
  };
}>;

export type AgentInfo = AgentWithInfo & {
  online: boolean;
  connectedAt: Date | null;
  lastHeartbeat: Date | null;
  reportedLlm: { provider: string; model: string } | null;
  transport: "ws" | "peerjs" | null;
} & {
  certificateInfo?: VaultysCertificate | null;
  agentVaultysId?: VaultysIDInfo | null;
};

export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;

export type SafeLlmConfig = Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean };
