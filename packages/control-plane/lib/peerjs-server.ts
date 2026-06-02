/**
 * PeerJS/WebRTC server for agent connections.
 *
 * Provides an alternative transport to WebSocket: agents connect via WebRTC
 * data channels brokered through a PeerJS signaling server. The same JSON
 * message protocol and auth flow (auth_challenge → register / SRP exchange →
 * auth_complete) are used — only the transport layer changes.
 *
 * The control plane's PeerJS peer ID is derived as sha256(serverDid) so it is
 * stable and predictable. Agents connect with:
 *   agent-controller --peerjs <control-plane-peer-id> [--peerjs-server <url>]
 */

import { createHash } from "crypto";
import pino from "pino";
import { VaultysId } from "@vaultys/id";
import { Peer, type DataConnection, type PeerOptions } from "peerjs";
import { getSetting } from "./db";
import { PeerjsSender } from "./agent-sender";
import type { AgentWSServer } from "./ws-server";

const logger = pino({ name: "peerjs-server" });

/** Derive a stable PeerJS peer ID from a DID. */
function peerIdForDid(did: string): string {
  return createHash("sha256").update(did).digest("hex");
}

/** Parse a URL string into PeerJS PeerOptions fields. */
function parsePeerjsServerUrl(
  url: string
): Pick<PeerOptions, "host" | "port" | "path" | "secure"> {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port
        ? parseInt(parsed.port, 10)
        : parsed.protocol === "https:"
          ? 443
          : 80,
      path: parsed.pathname || "/",
      secure: parsed.protocol === "https:",
    };
  } catch {
    logger.warn({ url }, "Invalid PeerJS server URL — using as host only");
    return { host: url, secure: true };
  }
}

/** Global singleton so Next.js module re-evaluation doesn't create multiple servers. */
const globalForPeerjs = globalThis as unknown as {
  __peerjsServer?: AgentPeerjsServer;
};

export class AgentPeerjsServer {
  private peer: Peer | null = null;
  private peerId: string = "";
  private wsServer: AgentWSServer;
  private serverUrl?: string;
  private _running = false;
  private _startedAt: Date | null = null;

  constructor(wsServer: AgentWSServer, serverUrl?: string) {
    this.wsServer = wsServer;
    this.serverUrl = serverUrl;
  }

  get isRunning(): boolean {
    return this._running;
  }
  get startedAt(): string | null {
    return this._startedAt?.toISOString() ?? null;
  }
  get peerjsId(): string {
    return this.peerId;
  }
  get signalingServerUrl(): string | undefined {
    return this.serverUrl;
  }

  /** Derive and return the control plane's stable PeerJS peer ID. */
  static getServerPeerId(): string | null {
    const secret = getSetting("serverSecret");
    if (!secret) return null;
    try {
      const vid = VaultysId.fromSecret(secret, "base64");
      return peerIdForDid(vid.toVersion(1).did);
    } catch {
      return null;
    }
  }

  async start(): Promise<string> {
    const peerId = AgentPeerjsServer.getServerPeerId();
    if (!peerId) {
      throw new Error(
        "Server identity not initialized — call initServerIdentity() first"
      );
    }
    this.peerId = peerId;

    const options: PeerOptions = {
      debug: 1,
      ...(this.serverUrl
        ? parsePeerjsServerUrl(this.serverUrl)
        : {
            host: "0.peerjs.com",
            port: 443,
            path: "/",
            secure: true,
          }),
    };

    await new Promise<void>((resolve, reject) => {
      const peer = new Peer(this.peerId, options);
      this.peer = peer;

      const timeout = setTimeout(() => {
        reject(new Error("PeerJS connection to signaling server timed out"));
      }, 15_000);

      peer.on("open", (id) => {
        clearTimeout(timeout);
        this._running = true;
        this._startedAt = new Date();
        logger.info(
          { peerId: id, serverUrl: this.serverUrl },
          "PeerJS server ready — waiting for agent connections"
        );
        resolve();
      });

      peer.on("error", (err) => {
        clearTimeout(timeout);
        logger.error({ err: err.message }, "PeerJS peer error");
        reject(err);
      });

      peer.on("connection", (conn: DataConnection) => {
        this.handleIncoming(conn);
      });

      peer.on("disconnected", () => {
        logger.warn(
          "PeerJS disconnected from signaling server — attempting reconnect"
        );
        peer.reconnect();
      });

      peer.on("close", () => {
        logger.info("PeerJS peer closed");
      });
    });

    return this.peerId;
  }

  private handleIncoming(conn: DataConnection): void {
    logger.info(
      { remotePeerId: conn.peer },
      "Incoming PeerJS connection — waiting for open"
    );

    conn.on("open", () => {
      logger.info(
        { remotePeerId: conn.peer },
        "PeerJS DataConnection open — initiating auth"
      );

      const sender = new PeerjsSender(conn);

      // Register with the WS server's auth pipeline (same flow as WebSocket)
      this.wsServer.acceptPeerjsConnection(sender);

      conn.on("data", (raw: unknown) => {
        const data = typeof raw === "string" ? raw : JSON.stringify(raw);
        this.wsServer.routePeerjsMessage(sender, data);
      });

      conn.on("close", () => {
        logger.info({ remotePeerId: conn.peer }, "PeerJS connection closed");
        this.wsServer.handlePeerjsDisconnect(sender);
      });

      conn.on("error", (err) => {
        logger.error(
          { remotePeerId: conn.peer, err },
          "PeerJS connection error"
        );
        this.wsServer.handlePeerjsDisconnect(sender);
      });
    });

    conn.on("error", (err) => {
      logger.error(
        { remotePeerId: conn.peer, err },
        "PeerJS connection error before open"
      );
    });
  }

  shutdown(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this._running = false;
    this._startedAt = null;
  }
}

export function initializePeerjsServer(
  wsServer: AgentWSServer,
  serverUrl?: string
): AgentPeerjsServer {
  if (globalForPeerjs.__peerjsServer) {
    globalForPeerjs.__peerjsServer.shutdown();
  }
  globalForPeerjs.__peerjsServer = new AgentPeerjsServer(wsServer, serverUrl);
  return globalForPeerjs.__peerjsServer;
}

export function getPeerjsServer(): AgentPeerjsServer | null {
  return globalForPeerjs.__peerjsServer ?? null;
}
