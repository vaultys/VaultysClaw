import { randomUUID } from "crypto";
import { ChannelMember, ChannelMemberInput } from "@vaultysclaw/shared";
import { getDb } from "@/lib/db";

export const ChannelMemberDao = {
  addMember(input: ChannelMemberInput): ChannelMember {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO channel_members (id, channel_id, member_did, member_type, role, joined_at, invited_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.channelId,
      input.memberDid,
      input.memberType,
      input.role,
      now,
      input.invitedBy ?? null
    );

    return db
      .prepare("SELECT * FROM channel_members WHERE id = ?")
      .get(id) as any;
  },

  getById(id: string): ChannelMember | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM channel_members WHERE id = ?")
      .get(id) as any;
    return row ? normalizeMember(row) : null;
  },

  getMember(channelId: string, memberDid: string): ChannelMember | null {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT * FROM channel_members WHERE channel_id = ? AND member_did = ?"
      )
      .get(channelId, memberDid) as any;
    return row ? normalizeMember(row) : null;
  },

  listByChannel(channelId: string): ChannelMember[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM channel_members WHERE channel_id = ? ORDER BY joined_at ASC"
      )
      .all(channelId) as any[];
    return rows.map(normalizeMember);
  },

  listByMember(memberDid: string): ChannelMember[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM channel_members WHERE member_did = ? ORDER BY joined_at DESC"
      )
      .all(memberDid) as any[];
    return rows.map(normalizeMember);
  },

  updateRole(
    channelId: string,
    memberDid: string,
    role: "member" | "moderator" | "owner"
  ): ChannelMember {
    const db = getDb();
    db.prepare(
      "UPDATE channel_members SET role = ? WHERE channel_id = ? AND member_did = ?"
    ).run(role, channelId, memberDid);

    const row = db
      .prepare(
        "SELECT * FROM channel_members WHERE channel_id = ? AND member_did = ?"
      )
      .get(channelId, memberDid) as any;
    return normalizeMember(row);
  },

  removeMember(channelId: string, memberDid: string): void {
    const db = getDb();
    db.prepare(
      "DELETE FROM channel_members WHERE channel_id = ? AND member_did = ?"
    ).run(channelId, memberDid);
  },

  removeById(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM channel_members WHERE id = ?").run(id);
  },

  getChannelMemberCount(channelId: string): number {
    const db = getDb();
    const result = db
      .prepare(
        "SELECT COUNT(*) AS count FROM channel_members WHERE channel_id = ?"
      )
      .get(channelId) as any;
    return result.count;
  },
};

function normalizeMember(row: any): ChannelMember {
  return {
    id: row.id,
    channelId: row.channel_id,
    memberDid: row.member_did,
    memberType: row.member_type,
    role: row.role,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
  };
}
