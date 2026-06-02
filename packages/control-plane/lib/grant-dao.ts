import { randomBytes } from "crypto";
import { getDb } from "./db";

export interface UserGrant {
  id: string;
  user_did: string;
  agent_did: string | null; // null = all agents
  capabilities: string; // JSON array
  granted_by: string;
  expires_at: string | null;
  created_at: string;
}

export type UserGrantInput = Omit<UserGrant, "id" | "created_at">;

export const GrantDao = {
  create(input: UserGrantInput): UserGrant {
    const db = getDb();
    const id = randomBytes(16).toString("hex");
    db.prepare(
      `
      INSERT INTO user_grants (id, user_did, agent_did, capabilities, granted_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.user_did,
      input.agent_did ?? null,
      typeof input.capabilities === "string"
        ? input.capabilities
        : JSON.stringify(input.capabilities),
      input.granted_by,
      input.expires_at ?? null
    );
    return db
      .prepare("SELECT * FROM user_grants WHERE id = ?")
      .get(id) as UserGrant;
  },

  getById(id: string): UserGrant | null {
    const db = getDb();
    return (
      (db
        .prepare("SELECT * FROM user_grants WHERE id = ?")
        .get(id) as UserGrant) ?? null
    );
  },

  listByUser(userDid: string): UserGrant[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM user_grants WHERE user_did = ? ORDER BY created_at ASC"
      )
      .all(userDid) as UserGrant[];
  },

  listByAgent(agentDid: string): UserGrant[] {
    const db = getDb();
    // Returns grants scoped to this agent or scoped to all agents (agent_did IS NULL)
    return db
      .prepare(
        "SELECT * FROM user_grants WHERE agent_did = ? OR agent_did IS NULL ORDER BY created_at ASC"
      )
      .all(agentDid) as UserGrant[];
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM user_grants WHERE id = ?").run(id);
  },
};
