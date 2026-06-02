import { randomUUID } from "crypto";
import { getDb } from "./db";
import { ChannelMessage, ChannelMessageInput } from "@vaultysclaw/shared";

export const ChannelMessageDao = {
  create(input: ChannelMessageInput): ChannelMessage {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO channel_messages (id, channel_id, thread_id, author_did, author_type, content, metadata, reactions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.channelId,
      input.threadId ?? null,
      input.authorDid,
      input.authorType,
      input.content,
      JSON.stringify(input.metadata),
      JSON.stringify({}),
      now
    );

    const row = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(id) as any;
    return normalizeMessage(row);
  },

  getById(id: string): ChannelMessage | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(id) as any;
    return row ? normalizeMessage(row) : null;
  },

  listByChannel(
    channelId: string,
    limit: number = 50,
    offset: number = 0
  ): ChannelMessage[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT * FROM channel_messages
        WHERE channel_id = ? AND thread_id IS NULL AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(channelId, limit, offset) as any[];
    return rows.reverse().map(normalizeMessage); // Reverse to get chronological order
  },

  listThread(parentMessageId: string): ChannelMessage[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT * FROM channel_messages
        WHERE thread_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
      `
      )
      .all(parentMessageId) as any[];
    return rows.map(normalizeMessage);
  },

  listChannelAndThreads(channelId: string): ChannelMessage[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT * FROM channel_messages
        WHERE channel_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
      `
      )
      .all(channelId) as any[];
    return rows.map(normalizeMessage);
  },

  update(id: string, content: string): ChannelMessage {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE channel_messages SET content = ?, edited_at = ? WHERE id = ?"
    ).run(content, now, id);

    const row = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(id) as any;
    return normalizeMessage(row);
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE channel_messages SET deleted_at = ? WHERE id = ?").run(
      now,
      id
    );
  },

  hardDelete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM channel_messages WHERE id = ?").run(id);
  },

  addReaction(
    messageId: string,
    emoji: string,
    memberDid: string
  ): ChannelMessage {
    const db = getDb();
    const message = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(messageId) as any;

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const reactions = JSON.parse(message.reactions || "{}");

    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    // Avoid duplicates
    if (!reactions[emoji].includes(memberDid)) {
      reactions[emoji].push(memberDid);
    }

    db.prepare("UPDATE channel_messages SET reactions = ? WHERE id = ?").run(
      JSON.stringify(reactions),
      messageId
    );

    const row = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(messageId) as any;
    return normalizeMessage(row);
  },

  removeReaction(
    messageId: string,
    emoji: string,
    memberDid: string
  ): ChannelMessage {
    const db = getDb();
    const message = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(messageId) as any;

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const reactions = JSON.parse(message.reactions || "{}");

    if (reactions[emoji]) {
      reactions[emoji] = reactions[emoji].filter(
        (did: string) => did !== memberDid
      );
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    db.prepare("UPDATE channel_messages SET reactions = ? WHERE id = ?").run(
      JSON.stringify(reactions),
      messageId
    );

    const row = db
      .prepare("SELECT * FROM channel_messages WHERE id = ?")
      .get(messageId) as any;
    return normalizeMessage(row);
  },

  searchInChannel(
    channelId: string,
    query: string,
    limit: number = 50
  ): ChannelMessage[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT * FROM channel_messages
        WHERE channel_id = ? AND content LIKE ? AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(channelId, `%${query}%`, limit) as any[];
    return rows.reverse().map(normalizeMessage);
  },

  getChannelMessageCount(channelId: string): number {
    const db = getDb();
    const result = db
      .prepare(
        "SELECT COUNT(*) AS count FROM channel_messages WHERE channel_id = ? AND deleted_at IS NULL"
      )
      .get(channelId) as any;
    return result.count;
  },
};

function normalizeMessage(row: any): ChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    threadId: row.thread_id,
    authorDid: row.author_did,
    authorType: row.author_type,
    content: row.content,
    metadata: JSON.parse(row.metadata || "{}"),
    reactions: JSON.parse(row.reactions || "{}"),
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}
