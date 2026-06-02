import { randomBytes } from "crypto";
import { getDb } from "./db";

export interface DelegationCert {
  id: string;
  grant_id: string;
  user_did: string;
  agent_did: string;
  capabilities: string; // JSON array
  certificate: string; // base64 signed payload
  expires_at: string | null;
  created_at: string;
}

export type DelegationCertInput = Omit<DelegationCert, "id" | "created_at">;

export const DelegationDao = {
  create(input: DelegationCertInput): DelegationCert {
    const db = getDb();
    const id = randomBytes(16).toString("hex");
    db.prepare(
      `
      INSERT INTO delegation_certs (id, grant_id, user_did, agent_did, capabilities, certificate, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.grant_id,
      input.user_did,
      input.agent_did,
      typeof input.capabilities === "string"
        ? input.capabilities
        : JSON.stringify(input.capabilities),
      input.certificate,
      input.expires_at ?? null
    );
    return db
      .prepare("SELECT * FROM delegation_certs WHERE id = ?")
      .get(id) as DelegationCert;
  },

  listByAgent(agentDid: string): DelegationCert[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM delegation_certs WHERE agent_did = ? ORDER BY created_at ASC"
      )
      .all(agentDid) as DelegationCert[];
  },

  listByUser(userDid: string): DelegationCert[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM delegation_certs WHERE user_did = ? ORDER BY created_at ASC"
      )
      .all(userDid) as DelegationCert[];
  },

  deleteByGrantId(grantId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM delegation_certs WHERE grant_id = ?").run(grantId);
  },
};
