export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BaseApi {
  protected async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(path, options);
    if (!res.ok) {
      let body: { error?: string; code?: string; details?: Record<string, unknown> } = {};
      try {
        body = await res.json();
      } catch {
        // ignore parse errors
      }
      throw new ApiError(
        res.status,
        body.code ?? "UNKNOWN_ERROR",
        body.error ?? res.statusText,
        body.details
      );
    }
    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  protected get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  protected post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  protected patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  protected put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  protected delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}
