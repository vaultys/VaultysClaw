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
import { PeerjsSender } from "./agent-sender";
import type { AgentWSServer } from "./ws-server";
import { SettingsDAO } from "@/db";

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
  static async getServerPeerId(): Promise<string | null> {
    const secret = await SettingsDAO.get("serverSecret");
    if (!secret) return null;
    try {
      const vid = VaultysId.fromSecret(secret, "base64");
      return peerIdForDid(vid.toVersion(1).did);
    } catch {
      return null;
    }
  }

  async start(): Promise<string> {
    const peerId = await AgentPeerjsServer.getServerPeerId();
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

      // Tracks reconnect attempts after a successful initial connection.
      let reconnectAttempts = 0;
      const MAX_RECONNECT = 5;

      const timeout = setTimeout(() => {
        peer.destroy();
        this.peer = null;
        reject(new Error("PeerJS connection to signaling server timed out"));
      }, 15_000);

      peer.on("open", (id) => {
        clearTimeout(timeout);
        reconnectAttempts = 0;
        this._running = true;
        this._startedAt = new Date();
        logger.info(
          { peerId: id, serverUrl: this.serverUrl },
          "PeerJS server ready — waiting for agent connections"
        );
        resolve();
      });

      peer.on("error", (err) => {
        logger.error({ err: err.message }, "PeerJS peer error");
        if (!this._running) {
          // Startup has not completed yet — destroy the peer so the
          // "disconnected" handler never fires and we don't spin forever.
          clearTimeout(timeout);
          peer.destroy();
          this.peer = null;
          reject(err);
        }
        // Post-startup errors are handled by the "disconnected" event below.
      });

      peer.on("connection", (conn: DataConnection) => {
        this.handleIncoming(conn);
      });

      peer.on("disconnected", () => {
        // Don't reconnect if startup failed or shutdown() was called.
        if (!this._running || !this.peer) return;

        if (reconnectAttempts >= MAX_RECONNECT) {
          logger.error(
            { attempts: reconnectAttempts },
            "PeerJS: max reconnect attempts reached — giving up"
          );
          peer.destroy();
          this.peer = null;
          this._running = false;
          return;
        }

        reconnectAttempts++;
        // Exponential back-off: 2s, 4s, 8s, 16s, 30s (capped).
        const delayMs = Math.min(1_000 * 2 ** reconnectAttempts, 30_000);
        logger.warn(
          { attempt: reconnectAttempts, maxAttempts: MAX_RECONNECT, delayMs },
          "PeerJS disconnected from signaling server — reconnecting with back-off"
        );
        setTimeout(() => {
          if (this.peer) peer.reconnect();
        }, delayMs);
      });

      peer.on("close", () => {
        logger.info("PeerJS peer closed");
        this._running = false;
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
    // Set _running = false BEFORE destroy() so the "disconnected" event
    // that fires during teardown doesn't schedule a reconnect.
    this._running = false;
    this._startedAt = null;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
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
