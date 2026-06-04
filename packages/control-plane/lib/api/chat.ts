import { BaseApi } from "./base";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  agentDid: string;
  messages: ChatMessage[];
  sessionId?: string;
  stream?: boolean;
}

export class ChatApi extends BaseApi {
  // Returns a streaming Response — callers handle the stream directly.
  stream(data: ChatRequest, signal?: AbortSignal): Promise<Response> {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, stream: true }),
      signal,
    });
  }

  // Non-streaming variant for simple one-shot responses.
  send(data: Omit<ChatRequest, "stream">) {
    return this.post<{ message: ChatMessage; sessionId?: string }>("/api/chat", {
      ...data,
      stream: false,
    });
  }
}

export const chatApi = new ChatApi();
