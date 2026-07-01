"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { MessageSquare, Plus } from "lucide-react";
import ChannelList from "@/components/channels/ChannelList";
import ChannelView from "@/components/channels/ChannelView";
import CreateChannelModal from "@/components/channels/CreateChannelModal";
import type { Channel } from "@vaultysclaw/shared";

export function ChannelsTab({
  workspaceId,
  channels,
  setChannels,
  canManage,
}: {
  workspaceId: string;
  channels: Channel[];
  setChannels: Dispatch<SetStateAction<Channel[]>>;
  canManage: boolean;
}) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );
  const [showCreate, setShowCreate] = useState(false);
  const selectedChannel =
    channels.find((ch) => ch.id === selectedChannelId) ?? null;

  return (
    <div className="flex h-[640px] border border-neutral-200 rounded-2xl overflow-hidden">
      {/* Sidebar: channel list */}
      <div className="w-60 border-r border-neutral-200 bg-background-100 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            Channels
          </span>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="p-1 rounded-lg hover:bg-background-200 transition text-foreground-500 hover:text-primary-400"
              title="New channel"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
              <MessageSquare className="w-6 h-6 text-neutral-300" />
              <p className="text-xs text-foreground-500">No channels yet.</p>
              {canManage && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-xs text-primary-700 hover:underline"
                >
                  Create one
                </button>
              )}
            </div>
          ) : (
            <ChannelList
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
            />
          )}
        </div>
      </div>

      {/* Main: channel view or empty state */}
      <div className="flex-1 overflow-hidden">
        {selectedChannel ? (
          <ChannelView
            key={selectedChannel.id}
            channel={selectedChannel}
            workspaceId={workspaceId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <MessageSquare className="w-10 h-10 text-neutral-300" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Select a channel
              </p>
              <p className="text-xs text-foreground-500 mt-1">
                Choose a channel from the sidebar
                {canManage ? " or create a new one." : "."}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> New Channel
              </button>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateChannelModal
          preSelectedWorkspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onChannelCreated={(channel) => {
            setShowCreate(false);
            setChannels((prev) => [...prev, channel]);
            setSelectedChannelId(channel.id);
          }}
        />
      )}
    </div>
  );
}
