import type {
  Channel,
  ChannelBridge,
  ChannelMember,
  ChannelMessage,
} from "@vaultysclaw/shared";

// The serialized shared channel types are the single source of truth for what
// the API returns (ISO-string dates), re-exported here for contract + clients.
export type { Channel, ChannelBridge, ChannelMember, ChannelMessage };

/**
 * A bridge as returned to clients — the encrypted `configJson` (OAuth tokens,
 * webhook secrets) is stripped server-side before serialization.
 */
export type ChannelBridgePublic = Omit<ChannelBridge, "configJson">;

export interface ChannelDetailResponse {
  channel: Channel;
  members: ChannelMember[];
  stats: Record<string, unknown>;
}
