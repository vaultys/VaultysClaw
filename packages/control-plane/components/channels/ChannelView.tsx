"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Settings, Users, Info, Link2 } from "lucide-react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import MemberList from "./MemberList";
import BridgeSettings from "./BridgeSettings";

const POLL_INTERVAL_MS = 3000;

interface Message {
  id: string;
  channelId: string;
  threadId: string | null;
  authorDid: string;
  authorType: "user" | "agent";
  content: string;
  metadata: Record<string, any>;
  reactions: Record<string, string[]>;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface Channel {
  id: string;
  realmId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  topic: string | null;
  creatorDid: string;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  channelId: string;
  memberDid: string;
  memberType: "user" | "agent";
  role: "member" | "moderator" | "owner";
  joinedAt: string;
  invitedBy: string | null;
}

interface ChannelViewProps {
  channel: Channel;
  realmId: string;
}

export default function ChannelView({ channel, realmId }: ChannelViewProps) {
  const [showMembers, setShowMembers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showBridges, setShowBridges] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) setMessagesLoading(true);
      const response = await fetch(
        `/api/channels/${channel.id}/messages?limit=50&offset=0`
      );
      if (response.ok) {
        const data = (await response.json()) as { messages: Message[] };
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [channel.id]);

  const fetchMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/channels/${channel.id}`);
      if (response.ok) {
        const data = (await response.json()) as { members: Member[] };
        setMembers(data.members);
      }
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  }, [channel.id]);

  // Initial load
  useEffect(() => {
    fetchMessages();
    fetchMembers();
  }, [fetchMessages, fetchMembers]);

  // Poll for new messages (to pick up async agent responses)
  useEffect(() => {
    pollRef.current = setInterval(() => fetchMessages(true), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  return (
    <div className="flex h-full bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Channel Header */}
        <div className="border-b border-neutral-200 bg-background-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                #{channel.slug}
              </h2>
              {channel.topic && (
                <p className="text-sm text-foreground-700 mt-1">{channel.topic}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="p-2 hover:bg-background-100 rounded-lg transition text-foreground-700"
                title="Channel info"
              >
                <Info size={20} />
              </button>
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="p-2 hover:bg-background-100 rounded-lg transition text-foreground-700"
                title="Members"
              >
                <Users size={20} />
              </button>
              <button
                onClick={() => setShowBridges(!showBridges)}
                className="p-2 hover:bg-background-100 rounded-lg transition text-foreground-700"
                title="Bridges"
              >
                <Link2 size={20} />
              </button>
              <button
                className="p-2 hover:bg-background-100 rounded-lg transition text-foreground-700"
                title="Settings"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <MessageList
          channelId={channel.id}
          messages={messages}
          isLoading={messagesLoading}
          onAddReaction={() => fetchMessages()}
          onDeleteMessage={() => fetchMessages()}
        />

        {/* Input */}
        <MessageInput
          channelId={channel.id}
          members={members}
          onMessageSent={() => fetchMessages()}
        />
      </div>

      {/* Members Panel */}
      {showMembers && (
        <div className="w-72 border-l border-neutral-200 bg-background-200 flex flex-col">
          <div className="p-4 border-b border-neutral-200">
            <h3 className="font-semibold text-foreground">Members</h3>
          </div>
          <MemberList channelId={channel.id} />
        </div>
      )}

      {/* Info Panel */}
      {showInfo && (
        <div className="w-72 border-l border-neutral-200 bg-background-200 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                About
              </h3>
              <p className="text-sm text-foreground-700">
                {channel.description || "No description"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Channel Type
              </h3>
              <p className="text-sm text-foreground-700">
                {channel.isPublic ? "Public" : "Private"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Created
              </h3>
              <p className="text-sm text-foreground-700">
                {new Date(channel.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bridges Panel */}
      {showBridges && (
        <BridgeSettings
          channelId={channel.id}
          onClose={() => setShowBridges(false)}
        />
      )}
    </div>
  );
}
