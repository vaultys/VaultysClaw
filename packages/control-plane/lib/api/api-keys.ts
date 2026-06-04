import {
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreatedResponse,
  ApiKeyUpdateRequest,
} from "@/lib/api-types";
import { BaseApi } from "./base";

export class ApiKeysApi extends BaseApi {
  list() {
    return this.get<{ apiKeys: ApiKey[] }>("/api/api-keys");
  }

  create(data: ApiKeyCreateRequest) {
    return this.post<ApiKeyCreatedResponse>("/api/api-keys", data);
  }

  update(id: string, data: ApiKeyUpdateRequest) {
    return this.patch<ApiKey>(`/api/api-keys/${id}`, data);
  }

  revoke(id: string) {
    return this.delete<void>(`/api/api-keys/${id}`);
  }
}

export const apiKeysApi = new ApiKeysApi();
