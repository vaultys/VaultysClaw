"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, MessageSquare, Users, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import ChannelList from "@/components/channels/ChannelList";
import ChannelView from "@/components/channels/ChannelView";
import CreateChannelModal from "@/components/channels/CreateChannelModal";

interface Channel {
  id: string;
  realmId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  isArchived: boolean;
  topic: string | null;
  creatorDid: string;
  createdAt: string;
  updatedAt: string;
}

export default function ChannelsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected: wsConnected } = useAdminWS();

  const [currentRealmId, setCurrentRealmId] = useState<string>("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    searchParams.get("channel") || null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch channels
  const fetchChannels = useCallback(async (realmId: string) => {
    if (!realmId) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/channels?realm=${realmId}&includeGlobal=true`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch channels");
      }

      const data = (await response.json()) as { channels: Channel[] };
      setChannels(data.channels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch channels");
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get current realm ID (from localStorage or fetch first available)
  useEffect(() => {
    const loadRealm = async () => {
      const storedRealmId = localStorage.getItem("currentRealmId");

      if (storedRealmId) {
        setCurrentRealmId(storedRealmId);
        fetchChannels(storedRealmId);
        return;
      }

      // If no stored realm, fetch available realms and use the first one
      try {
        const response = await fetch("/api/realms");
        if (response.ok) {
          const data = (await response.json()) as { realms: Array<{ id: string; name: string }> };
          if (data.realms.length > 0) {
            const realmId = data.realms[0].id;
            setCurrentRealmId(realmId);
            localStorage.setItem("currentRealmId", realmId);
            fetchChannels(realmId);
          } else {
            setError("No realms available");
          }
        }
      } catch (err) {
        setError("Failed to load realms");
      }
    };

    loadRealm();
  }, [fetchChannels]);

  const filteredChannels = channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId);

  return (
    <div className="flex h-screen bg-vc-bg">
      {/* Sidebar */}
      <div className="w-80 bg-vc-raised border-r border-vc-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-vc-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-vc-text flex items-center gap-2">
              <MessageSquare size={20} />
              Channels
            </h1>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 hover:bg-vc-surface rounded-lg transition text-vc-text-2"
              title="Create channel"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-3 text-vc-muted"
            />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-vc-surface border border-vc-border rounded-lg text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-vc-text-2 text-sm">Loading channels...</div>
          ) : error ? (
            <div className="p-4 text-red-600 text-sm">{error}</div>
          ) : filteredChannels.length === 0 ? (
            <div className="p-4 text-vc-text-2 text-sm">
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
        <div className="p-4 border-t border-vc-border">
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-vc-raised rounded-lg transition text-vc-text-2 text-sm">
            <Settings size={16} />
            Preferences
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-vc-bg flex flex-col">
        {selectedChannel ? (
          <ChannelView key={selectedChannelId} channel={selectedChannel} realmId={currentRealmId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-vc-muted">
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
