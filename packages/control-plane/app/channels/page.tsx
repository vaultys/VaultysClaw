"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, MessageSquare, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import type { Channel } from "@vaultysclaw/shared";
import { channelsClient, unwrap } from "@/lib/api/ts-rest/client";
import ChannelList from "@/components/channels/ChannelList";
import ChannelView from "@/components/channels/ChannelView";
import CreateChannelModal from "@/components/channels/CreateChannelModal";

export default function ChannelsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected: wsConnected } = useAdminWS();

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    searchParams.get("channel") || null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch channels
  const fetchChannels = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;

    try {
      setIsLoading(true);
      const { channels } = unwrap(
        await channelsClient.list({
          query: { workspace: workspaceId, includeGlobal: true },
        })
      );
      setChannels(channels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch channels");
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get current workspace ID (from localStorage or fetch first available)
  useEffect(() => {
    const loadWorkspace = async () => {
      const storedWorkspaceId = localStorage.getItem("currentWorkspaceId");

      if (storedWorkspaceId) {
        setCurrentWorkspaceId(storedWorkspaceId);
        fetchChannels(storedWorkspaceId);
        return;
      }

      // If no stored workspace, fetch available workspaces and use the first one
      try {
        const response = await fetch("/api/workspaces");
        if (response.ok) {
          const data = (await response.json()) as {
            workspaces: Array<{ id: string; name: string }>;
          };
          if (data.workspaces.length > 0) {
            const workspaceId = data.workspaces[0].id;
            setCurrentWorkspaceId(workspaceId);
            localStorage.setItem("currentWorkspaceId", workspaceId);
            fetchChannels(workspaceId);
          } else {
            setError("No workspaces available");
          }
        }
      } catch (err) {
        setError("Failed to load workspaces");
      }
    };

    loadWorkspace();
  }, [fetchChannels]);

  const filteredChannels = channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 bg-background-200 border-r border-neutral-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare size={20} />
              Channels
            </h1>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 hover:bg-background-100 rounded-lg transition text-foreground-700"
              title="Create channel"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-3 text-foreground-500"
            />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-foreground-700 text-sm">
              Loading channels...
            </div>
          ) : error ? (
            <div className="p-4 text-danger-600 text-sm">{error}</div>
          ) : filteredChannels.length === 0 ? (
            <div className="p-4 text-foreground-700 text-sm">
              No channels found. Create one to get started!
            </div>
          ) : (
            <ChannelList
              channels={filteredChannels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={(channelId) => {
                setSelectedChannelId(channelId);
                router.push(`/channels?channel=${channelId}`);
              }}
            />
          )}
        </div>

        {/* Settings */}
        <div className="p-4 border-t border-neutral-200">
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background-200 rounded-lg transition text-foreground-700 text-sm">
            <Settings size={16} />
            Preferences
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-background flex flex-col">
        {selectedChannel ? (
          <ChannelView
            key={selectedChannelId}
            channel={selectedChannel}
            workspaceId={currentWorkspaceId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-foreground-500">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
              <p>Select a channel to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <CreateChannelModal
          onClose={() => setShowCreateModal(false)}
          onChannelCreated={(channel) => {
            setChannels((prev) => [channel, ...prev]);
            setSelectedChannelId(channel.id);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
