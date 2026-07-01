"use client";

import { Lock, Globe } from "lucide-react";

interface Channel {
  id: string;
  workspaceId: string | null;
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
  const workspaceChannels = channels.filter((ch) => ch.workspaceId !== null);
  const globalChannels = channels.filter((ch) => ch.workspaceId === null);

  const renderChannelItem = (channel: Channel) => (
    <button
      key={channel.id}
      onClick={() => onSelectChannel(channel.id)}
      className={`w-full text-left px-4 py-2 rounded-lg transition flex items-center gap-2 ${
        selectedChannelId === channel.id
          ? "bg-primary-600 text-white"
          : "text-foreground-700 hover:bg-background-200"
      }`}
    >
      <span className="text-foreground-500">#{channel.slug}</span>
      <span className="flex-1 truncate">{channel.name}</span>
      {!channel.isPublic && <Lock size={14} />}
      {channel.workspaceId === null && <Globe size={14} />}
    </button>
  );

  return (
    <div className="py-4">
      {/* Workspace Channels */}
      {workspaceChannels.length > 0 && (
        <div className="px-4 mb-4">
          <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-2">
            Channels
          </h3>
          <div className="space-y-1">
            {workspaceChannels.map(renderChannelItem)}
          </div>
        </div>
      )}

      {/* Global Channels */}
      {globalChannels.length > 0 && (
        <div className="px-4">
          <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-2">
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
