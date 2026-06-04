import { BaseApi } from "./base";

export interface AgentRegistration {
  id: string;
  agentDid: string;
  name: string;
  publicKey: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  metadata?: Record<string, unknown>;
}

export class RegistrationsApi extends BaseApi {
  list() {
    return this.get<{ registrations: AgentRegistration[] }>("/api/registrations");
  }

  approve(id: string) {
    return this.post<{ registration: AgentRegistration }>(`/api/registrations/${id}/approve`);
  }

  reject(id: string, reason?: string) {
    return this.post<{ registration: AgentRegistration }>(`/api/registrations/${id}/reject`, { reason });
  }
}

export const registrationsApi = new RegistrationsApi();
