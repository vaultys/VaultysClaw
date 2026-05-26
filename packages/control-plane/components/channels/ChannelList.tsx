"use client";

import { Lock, Globe } from "lucide-react";

interface Channel {
  id: string;
  realmId: string | null;
  name: string;
  slug: string;
  isPublic: boolean;
  isArchived: boolean;
}

interface ChannelListProps {
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelList({
  channels,
  selectedChannelId,
  onSelectChannel,
}: ChannelListProps) {
  const realmChannels = channels.filter((ch) => ch.realmId !== null);
  const globalChannels = channels.filter((ch) => ch.realmId === null);

  const renderChannelItem = (channel: Channel) => (
    <button
      key={channel.id}
      onClick={() => onSelectChannel(channel.id)}
      className={`w-full text-left px-4 py-2 rounded-lg transition flex items-center gap-2 ${
        selectedChannelId === channel.id
          ? "bg-indigo-600 text-white"
          : "text-vc-text-2 hover:bg-vc-raised"
      }`}
    >
      <span className="text-vc-muted">#{channel.slug}</span>
      <span className="flex-1 truncate">{channel.name}</span>
      {!channel.isPublic && <Lock size={14} />}
      {channel.realmId === null && <Globe size={14} />}
    </button>
  );

  return (
    <div className="py-4">
      {/* Realm Channels */}
      {realmChannels.length > 0 && (
        <div className="px-4 mb-4">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            Channels
          </h3>
          <div className="space-y-1">
            {realmChannels.map(renderChannelItem)}
          </div>
        </div>
      )}

      {/* Global Channels */}
      {globalChannels.length > 0 && (
        <div className="px-4">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            Organization
          </h3>
          <div className="space-y-1">
            {globalChannels.map(renderChannelItem)}
          </div>
        </div>
      )}
    </div>
  );
}
