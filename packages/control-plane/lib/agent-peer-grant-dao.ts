import { randomBytes } from "crypto";
import { getDb } from "./db";

export interface AgentPeerGrantRow {
  id: string;
  source_did: string;
  target_did: string;
  target_name: string;
  skill_description: string;
  capabilities: string; // JSON array
  certificate: string;  // base64 signed payload
  expires_at: string | null;
  created_at: string;
}

export type AgentPeerGrantInput = Omit<AgentPeerGrantRow, "id" | "created_at">;

export const AgentPeerGrantDao = {
  create(input: AgentPeerGrantInput): AgentPeerGrantRow {
    const db = getDb();
    const id = randomBytes(16).toString("hex");
    db.prepare(`
      INSERT INTO agent_peer_grants
        (id, source_did, target_did, target_name, skill_description, capabilities, certificate, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.source_did,
      input.target_did,
      input.target_name,
      input.skill_description,
      typeof input.capabilities === "string"
        ? input.capabilities
        : JSON.stringify(input.capabilities),
      input.certificate,
      input.expires_at ?? null,
    );
    return db.prepare("SELECT * FROM agent_peer_grants WHERE id = ?").get(id) as AgentPeerGrantRow;
  },

  listBySource(sourceDid: string): AgentPeerGrantRow[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM agent_peer_grants WHERE source_did = ? ORDER BY created_at ASC")
      .all(sourceDid) as AgentPeerGrantRow[];
  },

  listByTarget(targetDid: string): AgentPeerGrantRow[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM agent_peer_grants WHERE target_did = ? ORDER BY created_at ASC")
      .all(targetDid) as AgentPeerGrantRow[];
  },

  getById(id: string): AgentPeerGrantRow | undefined {
    const db = getDb();
    return db.prepare("SELECT * FROM agent_peer_grants WHERE id = ?").get(id) as AgentPeerGrantRow | undefined;
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM agent_peer_grants WHERE id = ?").run(id);
  },

  deleteBySourceAndTarget(sourceDid: string, targetDid: string): void {
    const db = getDb();
    db.prepare("DELETE FROM agent_peer_grants WHERE source_did = ? AND target_did = ?").run(sourceDid, targetDid);
  },
};
