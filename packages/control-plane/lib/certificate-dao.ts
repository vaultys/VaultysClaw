import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";

export interface Certificate {
  id: string;
  key: string;
  registration: string;
  connection: string;
  register: number; // 1 = registration flow, 0 = login flow
  data: string; // base64 challenger cert bytes
  status: number; // -1 = pending, 2 = success, -2 = failed
  metadata: string | null;
  started_at: string;
}

export type CertificateInput = Omit<Certificate, "id" | "started_at">;

export const CertificateDao = {
  create(input: CertificateInput): Certificate {
    const db = getDb();
    const id = randomBytes(16).toString("hex");
    db.prepare(
      `
      INSERT INTO certificates (id, key, registration, connection, register, data, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.key,
      input.registration,
      input.connection,
      input.register,
      input.data,
      input.status,
      input.metadata ?? null
    );
    return db
      .prepare("SELECT * FROM certificates WHERE id = ?")
      .get(id) as Certificate;
  },

  update(id: string, patch: Partial<Certificate>): void {
    const db = getDb();
    const fields = Object.keys(patch).filter((k) => k !== "id");
    if (fields.length === 0) return;
    const set = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
    db.prepare(`UPDATE certificates SET ${set} WHERE id = ?`).run(
      ...values,
      id
    );
  },

  getByRegistration(token: string): Certificate | null {
    const db = getDb();
    return (
      (db
        .prepare("SELECT * FROM certificates WHERE registration = ?")
        .get(token) as Certificate) ?? null
    );
  },

  getByConnection(token: string): Certificate | null {
    const db = getDb();
    return (
      (db
        .prepare("SELECT * FROM certificates WHERE connection = ?")
        .get(token) as Certificate) ?? null
    );
  },

  getByKey(key: string): Certificate | null {
    const db = getDb();
    return (
      (db
        .prepare("SELECT * FROM certificates WHERE key = ?")
        .get(key) as Certificate) ?? null
    );
  },

  consumeCertificate(connectionToken: string): { count: number } {
    const db = getDb();
    const result = db
      .prepare("DELETE FROM certificates WHERE connection = ? AND status = 2")
      .run(connectionToken);
    return { count: result.changes };
  },
};
