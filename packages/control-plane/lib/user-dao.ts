import { getDb } from "./db";

export interface User {
  did: string;
  public_key: string | null;
  name: string | null;
  email: string | null;
  is_owner: number; // 1 = owner, 0 = regular
  is_admin: number; // 1 = admin (can access control plane), 0 = regular
  role: string;     // owner | admin | manager | operator | member
  reports_to: string | null; // DID of the supervisor user
  description: string | null;
  registered_at: string;
}

export const UserDao = {
  getByDid(did: string): User | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM users WHERE did = ?").get(did) as User) ?? null;
  },

  create(did: string, publicKey: string | null, isOwner: boolean): User {
    const db = getDb();
    db.prepare("INSERT INTO users (did, public_key, is_owner) VALUES (?, ?, ?)").run(
      did,
      publicKey ?? null,
      isOwner ? 1 : 0,
    );
    return db.prepare("SELECT * FROM users WHERE did = ?").get(did) as User;
  },

  update(did: string, fields: { name?: string; email?: string; role?: string; reports_to?: string | null; description?: string | null }): void {
    const db = getDb();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name || null); }
    if (fields.email !== undefined) { sets.push("email = ?"); values.push(fields.email || null); }
    if (fields.role !== undefined) { sets.push("role = ?"); values.push(fields.role); }
    if (fields.reports_to !== undefined) { sets.push("reports_to = ?"); values.push(fields.reports_to); }
    if (fields.description !== undefined) { sets.push("description = ?"); values.push(fields.description || null); }
    if (sets.length === 0) return;
    values.push(did);
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE did = ?`).run(...values);
  },

  setAdmin(did: string, isAdmin: boolean): void {
    const db = getDb();
    db.prepare("UPDATE users SET is_admin = ? WHERE did = ?").run(isAdmin ? 1 : 0, did);
  },

  hasAnyUser(): boolean {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return row.count > 0;
  },

  hasOwner(): boolean {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_owner = 1").get() as { count: number };
    return row.count > 0;
  },

  list(): User[] {
    const db = getDb();
    return db.prepare("SELECT * FROM users ORDER BY registered_at ASC").all() as User[];
  },

  remove(did: string): void {
    const db = getDb();
    db.prepare("DELETE FROM users WHERE did = ?").run(did);
  },
};
