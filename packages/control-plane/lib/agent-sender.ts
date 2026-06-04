import { WebSocket } from "ws";
import type { DataConnection } from "peerjs";
import pino from "pino";

const logger = pino({ name: "agent-sender" });

/** Transport-agnostic send abstraction over a single agent connection. */
export interface AgentSender {
  sendRaw(data: string): void;
  isOpen(): boolean;
  close(code?: number, reason?: string): void;
  ping?(): void;
  readonly transport: "ws" | "peerjs";
}

export class WsSender implements AgentSender {
  readonly transport = "ws" as const;
  constructor(readonly ws: WebSocket) {}

  sendRaw(data: string): void {
    if (this.isOpen()) {
      this.ws.send(data);
    }
  }

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  ping(): void {
    if (this.isOpen()) {
      this.ws.ping();
    }
  }
}

export class PeerjsSender implements AgentSender {
  readonly transport = "peerjs" as const;
  private _open = true;

  constructor(readonly conn: DataConnection) {}

  sendRaw(data: string): void {
    if (this.isOpen()) {
      try {
        this.conn.send(data);
      } catch (err) {
        logger.error({ err }, "PeerJS send error");
      }
    }
  }

  isOpen(): boolean {
    return this._open && this.conn.open;
  }

  close(): void {
    this._open = false;
    try {
      this.conn.close();
    } catch {
      // ignore close errors
    }
  }
}
