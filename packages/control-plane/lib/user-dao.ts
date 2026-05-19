import { getDb } from "./db";

export interface User {
  id: string;            // UUID — stable internal PK
  did: string | null;    // VaultysID DID — null until the user claims their account
  public_key: string | null;
  name: string | null;
  email: string | null;
  is_owner: number;      // 1 = owner, 0 = regular
  is_admin: number;      // 1 = admin (can access control plane), 0 = regular
  role: string;          // owner | admin | manager | operator | member
  reports_to: string | null; // id of the supervisor user
  description: string | null;
  registered_at: string;
  entra_id: string | null;   // FK → entra_identities(id)
  claimed_at: string | null; // Set when an Entra-provisioned user claims via QR
}

export const UserDao = {
  getById(id: string): User | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null;
  },

  getByDid(did: string): User | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM users WHERE did = ?").get(did) as User) ?? null;
  },

  /** Create a fully registered user (with DID). id = did for backward compat. */
  create(did: string, publicKey: string | null, isOwner: boolean): User {
    const db = getDb();
    db.prepare("INSERT INTO users (id, did, public_key, is_owner) VALUES (?, ?, ?, ?)").run(
      did,
      did,
      publicKey ?? null,
      isOwner ? 1 : 0,
    );
    return db.prepare("SELECT * FROM users WHERE id = ?").get(did) as User;
  },

  /** Upsert the entra_identities record and create an unclaimed user linked to it. */
  createFromEntra(entraObjectId: string, displayName: string | null, email: string | null): User {
    const db = getDb();
    // Upsert the identity record so re-syncing updates the name/email
    db.prepare(`
      INSERT INTO entra_identities (id, display_name, mail, synced_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        mail = excluded.mail,
        synced_at = excluded.synced_at
    `).run(entraObjectId, displayName ?? null, email ?? null);

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO users (id, did, public_key, is_owner, name, email, entra_id) VALUES (?, NULL, NULL, 0, ?, ?, ?)"
    ).run(id, displayName ?? null, email ?? null, entraObjectId);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
  },

  /** Called when a re-sync finds an existing user — updates the entra_identities record. */
  refreshEntraIdentity(entraObjectId: string, displayName: string | null, email: string | null): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO entra_identities (id, display_name, mail, synced_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        mail = excluded.mail,
        synced_at = excluded.synced_at
    `).run(entraObjectId, displayName ?? null, email ?? null);
  },

  /** Link an existing (pre-Entra) user to an Entra identity. */
  linkEntraIdentity(userId: string, entraObjectId: string, displayName: string | null, email: string | null): void {
    const db = getDb();
    // Upsert the identity record
    db.prepare(`
      INSERT INTO entra_identities (id, display_name, mail, synced_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        mail = excluded.mail,
        synced_at = excluded.synced_at
    `).run(entraObjectId, displayName ?? null, email ?? null);
    db.prepare("UPDATE users SET entra_id = ? WHERE id = ?").run(entraObjectId, userId);
  },

  /** Set the real VaultysID DID when an Entra-provisioned user claims via QR. */
  claimEntraUser(userId: string, realDid: string, publicKey: string): void {
    const db = getDb();
    db.prepare(
      "UPDATE users SET did = ?, public_key = ?, claimed_at = datetime('now') WHERE id = ?"
    ).run(realDid, publicKey, userId);
  },

  getByEntraId(entraId: string): User | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM users WHERE entra_id = ?").get(entraId) as User) ?? null;
  },

  getByEmail(email: string): User | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email) as User) ?? null;
  },

  /** List all users provisioned from Entra that haven't yet claimed their account. */
  listUnclaimedEntra(): User[] {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM users WHERE entra_id IS NOT NULL AND claimed_at IS NULL AND did IS NULL ORDER BY registered_at ASC"
    ).all() as User[];
  },

  update(id: string, fields: { name?: string; email?: string; role?: string; reports_to?: string | null; description?: string | null }): void {
    const db = getDb();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name || null); }
    if (fields.email !== undefined) { sets.push("email = ?"); values.push(fields.email || null); }
    if (fields.role !== undefined) { sets.push("role = ?"); values.push(fields.role); }
    if (fields.reports_to !== undefined) { sets.push("reports_to = ?"); values.push(fields.reports_to); }
    if (fields.description !== undefined) { sets.push("description = ?"); values.push(fields.description || null); }
    if (sets.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
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
    hasAccount?: boolean; // true = did IS NOT NULL, false = did IS NULL
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
      hasAccount,
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
      conditions.push("(LOWER(COALESCE(u.name,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ? OR COALESCE(u.did,'') LIKE ?)");
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

    if (hasAccount !== undefined) {
      conditions.push(hasAccount ? "u.did IS NOT NULL" : "u.did IS NULL");
    }

    if (realm) {
      conditions.push("EXISTS (SELECT 1 FROM user_realms ur JOIN realms r ON r.id = ur.realm_id WHERE ur.user_id = u.id AND (r.id = ? OR r.slug = ?))");
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

  removeById(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  },
};
