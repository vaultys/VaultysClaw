import { RealmSummary } from "@/lib/api-types";
import { BaseApi } from "./base";

export interface Realm extends RealmSummary {
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RealmSkill {
  id: string;
  skillId: string;
  realmId: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  createdAt: string;
}

export interface RealmCredential {
  id: string;
  realmId: string;
  type: string;
  label: string;
  createdAt: string;
  expiresAt?: string;
}

export interface RealmModel {
  id: string;
  name: string;
  provider: string;
  isDefault?: boolean;
}

export class RealmsApi extends BaseApi {
  list(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ realms: Realm[]; total: number }>(`/api/realms${qs ? `?${qs}` : ""}`);
  }

  create(data: Pick<Realm, "name" | "slug"> & Partial<Pick<Realm, "description">>) {
    return this.post<Realm>("/api/realms", data);
  }

  getOne(id: string) {
    return this.get<Realm>(`/api/realms/${id}`);
  }

  update(id: string, data: Partial<Pick<Realm, "name" | "slug" | "description">>) {
    return this.patch<Realm>(`/api/realms/${id}`, data);
  }

  remove(id: string) {
    return this.delete<void>(`/api/realms/${id}`);
  }

  setDefault(id: string) {
    return this.post<Realm>(`/api/realms/${id}/default`);
  }

  listMine() {
    return this.get<{ realms: Realm[] }>("/api/me/realms");
  }

  // Members
  addAgent(id: string, agentDid: string) {
    return this.post<void>(`/api/realms/${id}/agents`, { agentDid });
  }

  removeAgent(id: string, agentDid: string) {
    return this.delete<void>(`/api/realms/${id}/agents`, { agentDid });
  }

  addUser(id: string, data: { userDid: string; role?: string }) {
    return this.post<void>(`/api/realms/${id}/users`, data);
  }

  updateUser(id: string, data: { userDid: string; role: string }) {
    return this.patch<void>(`/api/realms/${id}/users`, data);
  }

  removeUser(id: string, userDid: string) {
    return this.delete<void>(`/api/realms/${id}/users`, { userDid });
  }

  // Skills
  listSkills(id: string) {
    return this.get<{ skills: RealmSkill[] }>(`/api/realms/${id}/skills`);
  }

  addSkill(id: string, data: Pick<RealmSkill, "skillId"> & Partial<Pick<RealmSkill, "config">>) {
    return this.post<RealmSkill>(`/api/realms/${id}/skills`, data);
  }

  getSkill(id: string, skillId: string) {
    return this.get<RealmSkill>(`/api/realms/${id}/skills/${skillId}`);
  }

  updateSkill(id: string, skillId: string, data: Partial<Pick<RealmSkill, "enabled" | "config">>) {
    return this.patch<RealmSkill>(`/api/realms/${id}/skills/${skillId}`, data);
  }

  removeSkill(id: string, skillId: string) {
    return this.delete<void>(`/api/realms/${id}/skills/${skillId}`);
  }

  // Models
  listModels(id: string) {
    return this.get<{ models: RealmModel[] }>(`/api/realms/${id}/models`);
  }

  // Credentials
  listCredentials(id: string) {
    return this.get<{ credentials: RealmCredential[] }>(`/api/realms/${id}/credentials`);
  }

  createCredential(id: string, data: Pick<RealmCredential, "type" | "label"> & { secret: string }) {
    return this.post<RealmCredential>(`/api/realms/${id}/credentials`, data);
  }

  deleteCredential(id: string, credId: string) {
    return this.delete<void>(`/api/realms/${id}/credentials`, { credId });
  }

  getCredential(id: string, credId: string) {
    return this.get<RealmCredential>(`/api/realms/${id}/credentials/${credId}`);
  }

  // Social media
  setSocialMedia(id: string, config: Record<string, unknown>) {
    return this.post<void>(`/api/realms/${id}/social-media`, config);
  }
}

export const realmsApi = new RealmsApi();
