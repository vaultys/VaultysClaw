import { BaseApi } from "./base";

export interface NetworkTopology {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface NetworkNode {
  id: string;
  type: "agent" | "user" | "realm" | string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

export interface GraphData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export class NetworkApi extends BaseApi {
  getTopology(params?: { realm?: string }) {
    const query = new URLSearchParams();
    if (params?.realm) query.set("realm", params.realm);
    const qs = query.toString();
    return this.get<NetworkTopology>(`/api/network${qs ? `?${qs}` : ""}`);
  }

  updateTopology(data: Partial<NetworkTopology>) {
    return this.post<NetworkTopology>("/api/network", data);
  }

  getGraph(params?: { realm?: string }) {
    const query = new URLSearchParams();
    if (params?.realm) query.set("realm", params.realm);
    const qs = query.toString();
    return this.get<GraphData>(`/api/graph${qs ? `?${qs}` : ""}`);
  }
}

export const networkApi = new NetworkApi();
