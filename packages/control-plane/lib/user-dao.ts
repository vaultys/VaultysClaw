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

  query(opts: {
    q?: string;
    role?: string;
    realm?: string;
    isAdmin?: boolean;
    isOwner?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: "name" | "email" | "registeredAt";
    sortDir?: "asc" | "desc";
  } = {}): { users: User[]; total: number; page: number; pageSize: number; totalPages: number } {
    const db = getDb();
    const {
      q,
      role,
      realm,
      isAdmin,
      isOwner,
      page = 1,
      pageSize = 20,
      sortBy = "registeredAt",
      sortDir = "asc",
    } = opts;

    const sortColumn =
      sortBy === "name" ? "u.name" :
        sortBy === "email" ? "u.email" :
          "u.registered_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push("(LOWER(COALESCE(u.name,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ? OR u.did LIKE ?)");
      const like = `%${q.toLowerCase()}%`;
      params.push(like, like, like);
    }

    if (role) {
      conditions.push("u.role = ?");
      params.push(role);
    }

    if (isAdmin !== undefined) {
      conditions.push(isAdmin ? "(u.is_admin = 1 OR u.is_owner = 1)" : "(u.is_admin = 0 AND u.is_owner = 0)");
    }

    if (isOwner !== undefined) {
      conditions.push(`u.is_owner = ?`);
      params.push(isOwner ? 1 : 0);
    }

    if (realm) {
      conditions.push("EXISTS (SELECT 1 FROM user_realms ur JOIN realms r ON r.id = ur.realm_id WHERE ur.user_did = u.did AND (r.id = ? OR r.slug = ?))");
      params.push(realm, realm);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = (db.prepare(`SELECT COUNT(*) AS count FROM users u ${where}`).get(...params) as { count: number }).count;
    const offset = (page - 1) * pageSize;
    const users = db.prepare(
      `SELECT u.* FROM users u ${where} ORDER BY ${sortColumn} ${dir} LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as User[];

    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  remove(did: string): void {
    const db = getDb();
    db.prepare("DELETE FROM users WHERE did = ?").run(did);
  },
};
