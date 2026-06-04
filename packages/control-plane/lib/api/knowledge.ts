import { BaseApi } from "./base";

export interface KnowledgeSource {
  id: string;
  name: string;
  type: "file" | "url" | "database" | string;
  config?: Record<string, unknown>;
  syncStatus?: "idle" | "syncing" | "error";
  lastSyncedAt?: string;
  realmId?: string;
  createdAt: string;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sourceId?: string;
  uploadedAt: string;
}

export class KnowledgeApi extends BaseApi {
  list(params?: { realmId?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.realmId) query.set("realmId", params.realmId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ sources: KnowledgeSource[]; total: number }>(`/api/knowledge${qs ? `?${qs}` : ""}`);
  }

  create(data: Pick<KnowledgeSource, "name" | "type"> & Partial<Pick<KnowledgeSource, "config" | "realmId">>) {
    return this.post<KnowledgeSource>("/api/knowledge", data);
  }

  getOne(id: string) {
    return this.get<KnowledgeSource>(`/api/knowledge/${id}`);
  }

  remove(id: string) {
    return this.delete<void>(`/api/knowledge/${id}`);
  }

  sync(id: string) {
    return this.post<{ jobId: string }>(`/api/knowledge/${id}/sync`);
  }

  // Files
  listFiles(params?: { sourceId?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.sourceId) query.set("sourceId", params.sourceId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ files: KnowledgeFile[]; total: number }>(`/api/knowledge/files${qs ? `?${qs}` : ""}`);
  }

  uploadFile(formData: FormData) {
    return this.request<KnowledgeFile>("/api/knowledge/files", {
      method: "POST",
      body: formData,
    });
  }

  removeFile(fileId: string) {
    return this.delete<void>(`/api/knowledge/files/${fileId}`);
  }
}

export const knowledgeApi = new KnowledgeApi();
