import { randomUUID } from "crypto";
import { getDb } from "./db";
import { Channel, ChannelInput } from "@vaultysclaw/shared";

export const ChannelDao = {
  create(input: ChannelInput): Channel {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO channels (id, realm_id, name, slug, description, is_public, is_archived, topic, creator_did, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.realmId ?? null,
      input.name,
      input.slug,
      input.description ?? null,
      input.isPublic ? 1 : 0,
      input.isArchived ? 1 : 0,
      input.topic ?? null,
      input.creatorDid,
      now,
      now
    );

    return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as any;
  },

  getById(id: string): Channel | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM channels WHERE id = ?")
      .get(id) as any;
    return row ? normalizeChannel(row) : null;
  },

  getBySlug(slug: string, realmId?: string): Channel | null {
    const db = getDb();
    let query = "SELECT * FROM channels WHERE slug = ?";
    const params: any[] = [slug];

    if (realmId) {
      query += " AND realm_id = ?";
      params.push(realmId);
    } else {
      query += " AND realm_id IS NULL";
    }

    const row = db.prepare(query).get(...params) as any;
    return row ? normalizeChannel(row) : null;
  },

  listByRealm(realmId: string): Channel[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM channels WHERE realm_id = ? AND is_archived = 0 ORDER BY created_at DESC"
      )
      .all(realmId) as any[];
    return rows.map(normalizeChannel);
  },

  listGlobal(): Channel[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM channels WHERE realm_id IS NULL AND is_archived = 0 ORDER BY created_at DESC"
      )
      .all() as any[];
    return rows.map(normalizeChannel);
  },

  listByRealmWithGlobal(realmId: string): Channel[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT * FROM channels
        WHERE (realm_id = ? OR realm_id IS NULL) AND is_archived = 0
        ORDER BY created_at DESC
      `
      )
      .all(realmId) as any[];
    return rows.map(normalizeChannel);
  },

  update(id: string, updates: Partial<ChannelInput>): Channel {
    const db = getDb();
    const now = new Date().toISOString();

    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [now];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description ?? null);
    }
    if (updates.isPublic !== undefined) {
      fields.push("is_public = ?");
      values.push(updates.isPublic ? 1 : 0);
    }
    if (updates.isArchived !== undefined) {
      fields.push("is_archived = ?");
      values.push(updates.isArchived ? 1 : 0);
    }
    if (updates.topic !== undefined) {
      fields.push("topic = ?");
      values.push(updates.topic ?? null);
    }

    values.push(id);

    db.prepare(`UPDATE channels SET ${fields.join(", ")} WHERE id = ?`).run(
      ...values
    );

    return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as any;
  },

  archive(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE channels SET is_archived = 1, updated_at = ? WHERE id = ?"
    ).run(now, id);
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM channels WHERE id = ?").run(id);
  },
};

function normalizeChannel(row: any): Channel {
  return {
    id: row.id,
    realmId: row.realm_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isPublic: row.is_public === 1,
    isArchived: row.is_archived === 1,
    topic: row.topic,
    creatorDid: row.creator_did,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
