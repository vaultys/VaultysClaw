import { BaseApi } from "./base";

export interface Skill {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  packageName?: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSkill extends Skill {
  enabled: boolean;
  realmId?: string;
}

export interface SkillLibraryEntry {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  packageName: string;
  category?: string;
  tags?: string[];
}

export class SkillsApi extends BaseApi {
  list(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ skills: Skill[]; total: number }>(`/api/skills${qs ? `?${qs}` : ""}`);
  }

  create(data: Pick<Skill, "name"> & Partial<Omit<Skill, "id" | "createdAt" | "updatedAt">>) {
    return this.post<Skill>("/api/skills", data);
  }

  // Library
  listLibrary(params?: { category?: string; q?: string }) {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.q) query.set("q", params.q);
    const qs = query.toString();
    return this.get<{ entries: SkillLibraryEntry[] }>(`/api/skills/library${qs ? `?${qs}` : ""}`);
  }

  getLibraryContent(params: { packageName: string; version?: string }) {
    const query = new URLSearchParams({ packageName: params.packageName });
    if (params.version) query.set("version", params.version);
    return this.get<{ content: string }>(`/api/skills/library/content?${query}`);
  }

  // Org skills
  listOrgSkills(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ skills: OrgSkill[]; total: number }>(`/api/org/skills${qs ? `?${qs}` : ""}`);
  }

  createOrgSkill(data: Pick<OrgSkill, "name"> & Partial<Omit<OrgSkill, "id" | "createdAt" | "updatedAt">>) {
    return this.post<OrgSkill>("/api/org/skills", data);
  }

  getOrgSkill(id: string) {
    return this.get<OrgSkill>(`/api/org/skills/${id}`);
  }

  updateOrgSkill(id: string, data: Partial<Pick<OrgSkill, "name" | "description" | "enabled" | "config">>) {
    return this.patch<OrgSkill>(`/api/org/skills/${id}`, data);
  }

  removeOrgSkill(id: string) {
    return this.delete<void>(`/api/org/skills/${id}`);
  }
}

export const skillsApi = new SkillsApi();
