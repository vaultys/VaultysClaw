import { randomUUID } from "crypto";
import { getDb } from "./db";
import { ChannelBridge, ChannelBridgeInput } from "@vaultysclaw/shared";

export const ChannelBridgeDao = {
  create(input: ChannelBridgeInput): ChannelBridge {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_bridges (id, channel_id, external_service, external_channel_id, external_channel_name, external_workspace_id, sync_direction, is_sync_enabled, created_at, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.channelId,
      input.externalService,
      input.externalChannelId,
      input.externalChannelName,
      input.externalWorkspaceId,
      input.syncDirection,
      input.isSyncEnabled ? 1 : 0,
      now,
      input.configJson,
    );

    const row = db.prepare("SELECT * FROM channel_bridges WHERE id = ?").get(id) as any;
    return normalizeBridge(row);
  },

  getById(id: string): ChannelBridge | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM channel_bridges WHERE id = ?").get(id) as any;
    return row ? normalizeBridge(row) : null;
  },

  listByChannel(channelId: string): ChannelBridge[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM channel_bridges WHERE channel_id = ? ORDER BY created_at DESC")
      .all(channelId) as any[];
    return rows.map(normalizeBridge);
  },

  getByChannelAndService(
    channelId: string,
    externalService: string,
    externalChannelId: string,
  ): ChannelBridge | null {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT * FROM channel_bridges WHERE channel_id = ? AND external_service = ? AND external_channel_id = ?",
      )
      .get(channelId, externalService, externalChannelId) as any;
    return row ? normalizeBridge(row) : null;
  },

  update(id: string, updates: Partial<Omit<ChannelBridgeInput, "channelId">>): ChannelBridge {
    const db = getDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.syncDirection !== undefined) {
      fields.push("sync_direction = ?");
      values.push(updates.syncDirection);
    }
    if (updates.isSyncEnabled !== undefined) {
      fields.push("is_sync_enabled = ?");
      values.push(updates.isSyncEnabled ? 1 : 0);
    }
    if (updates.configJson !== undefined) {
      fields.push("config_json = ?");
      values.push(updates.configJson);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE channel_bridges SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    const updatedRow = db.prepare("SELECT * FROM channel_bridges WHERE id = ?").get(id) as any;
    return normalizeBridge(updatedRow);
  },

  toggleSync(id: string, enabled: boolean): ChannelBridge {
    const db = getDb();
    db.prepare("UPDATE channel_bridges SET is_sync_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);

    const toggledRow = db.prepare("SELECT * FROM channel_bridges WHERE id = ?").get(id) as any;
    return normalizeBridge(toggledRow);
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM channel_bridges WHERE id = ?").run(id);
  },

  deleteByChannelAndService(channelId: string, externalService: string): void {
    const db = getDb();
    db.prepare(
      "DELETE FROM channel_bridges WHERE channel_id = ? AND external_service = ?",
    ).run(channelId, externalService);
  },

  /**
   * Look up a bridge by the external channel ID (for routing incoming messages).
   */
  getByExternalChannelId(
    externalService: string,
    externalChannelId: string,
  ): ChannelBridge | null {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT * FROM channel_bridges WHERE external_service = ? AND external_channel_id = ? LIMIT 1",
      )
      .get(externalService, externalChannelId) as any;
    return row ? normalizeBridge(row) : null;
  },
};

function normalizeBridge(row: any): ChannelBridge {
  return {
    id: row.id,
    channelId: row.channel_id,
    externalService: row.external_service,
    externalChannelId: row.external_channel_id,
    externalChannelName: row.external_channel_name,
    externalWorkspaceId: row.external_workspace_id,
    syncDirection: row.sync_direction,
    isSyncEnabled: row.is_sync_enabled === 1,
    createdAt: row.created_at,
    configJson: row.config_json,
  };
}
