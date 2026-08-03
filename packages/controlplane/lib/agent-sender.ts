import { WebSocket } from "ws";

/**
 * Transport-agnostic send abstraction over a single Principal connection.
 * Only `WsSender` exists so far — WebRTC/PeerJS (trust doc §4.4) is deferred,
 * but the interface is shaped so adding a `PeerjsSender` later doesn't touch
 * `ws-server.ts`'s dispatch logic, mirroring `packages/control-plane`'s
 * existing `AgentSender` pattern.
 */
export interface AgentSender {
  sendRaw(data: string): void;
  isOpen(): boolean;
  close(code?: number, reason?: string): void;
  readonly transport: "ws";
}

export class WsSender implements AgentSender {
  readonly transport = "ws" as const;
  constructor(private readonly ws: WebSocket) {}

  sendRaw(data: string): void {
    if (this.isOpen()) this.ws.send(data);
  }

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }
}
