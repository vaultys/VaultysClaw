import { ChannelEvent, WSMessage } from "@vaultysclaw/shared";
import { randomUUID } from "crypto";

/**
 * Type for WebSocket client subscriber
 * Used internally by ws-server to track connected clients and their subscriptions
 */
export interface ChannelSubscriber {
  send(message: WSMessage): void;
}

/**
 * ChannelEventPublisher manages real-time channel event distribution
 * Tracks channel subscriptions and broadcasts events to subscribers
 *
 * In production, this could be replaced with a proper pub/sub service (Redis, etc.)
 */
class ChannelEventPublisher {
  private subscribers: Map<string, Set<ChannelSubscriber>> = new Map();

  /**
   * Subscribe a client to a channel
   * Called when a client connects or subscribes to a channel
   */
  subscribe(channelId: string, subscriber: ChannelSubscriber): void {
    if (!this.subscribers.has(channelId)) {
      this.subscribers.set(channelId, new Set());
    }
    this.subscribers.get(channelId)!.add(subscriber);
  }

  /**
   * Unsubscribe a client from a channel
   * Called when a client disconnects or leaves a channel
   */
  unsubscribe(channelId: string, subscriber: ChannelSubscriber): void {
    const subs = this.subscribers.get(channelId);
    if (subs) {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.subscribers.delete(channelId);
      }
    }
  }

  /**
   * Publish a channel event to all subscribers of that channel
   */
  publish(channelId: string, event: ChannelEvent): void {
    const subs = this.subscribers.get(channelId);
    if (!subs) return;

    const message: WSMessage = {
      messageId: randomUUID(),
      type: "channel_event",
      payload: event,
      timestamp: new Date().toISOString(),
    };

    subs.forEach((subscriber) => {
      try {
        subscriber.send(message);
      } catch (err) {
        console.error("Error publishing channel event:", err);
        // Remove dead subscriber
        subs.delete(subscriber);
      }
    });
  }

  /**
   * Publish multiple events atomically
   */
  publishBatch(events: Array<[channelId: string, event: ChannelEvent]>): void {
    events.forEach(([channelId, event]) => {
      this.publish(channelId, event);
    });
  }

  /**
   * Get subscriber count for a channel (for monitoring)
   */
  getSubscriberCount(channelId: string): number {
    return this.subscribers.get(channelId)?.size || 0;
  }

  /**
   * Get all subscribed channels
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.subscribers.keys());
  }
}

/**
 * Singleton instance of the event publisher
 */
export const eventPublisher = new ChannelEventPublisher();

/**
 * Helper to publish a message_created event
 */
export function publishMessageCreated(
  channelId: string,
  messageId: string,
  threadId: string | null,
  data: any
): void {
  eventPublisher.publish(channelId, {
    type: "message_created",
    channelId,
    message: data,
    threadId: threadId || undefined,
  });
}

/**
 * Helper to publish a message_edited event
 */
export function publishMessageEdited(
  channelId: string,
  messageId: string,
  content: string
): void {
  eventPublisher.publish(channelId, {
    type: "message_edited",
    channelId,
    messageId,
    content,
    editedAt: new Date().toISOString(),
  });
}

/**
 * Helper to publish a message_deleted event
 */
export function publishMessageDeleted(
  channelId: string,
  messageId: string
): void {
  eventPublisher.publish(channelId, {
    type: "message_deleted",
    channelId,
    messageId,
  });
}

/**
 * Helper to publish a thread_created event
 */
export function publishThreadCreated(
  channelId: string,
  parentMessageId: string,
  threadId: string,
  agentMention: string
): void {
  eventPublisher.publish(channelId, {
    type: "thread_created",
    channelId,
    parentMessageId,
    threadId,
    agentMention,
  });
}

/**
 * Helper to publish a member_joined event
 */
export function publishMemberJoined(
  channelId: string,
  memberData: any
): void {
  eventPublisher.publish(channelId, {
    type: "member_joined",
    channelId,
    member: memberData,
  });
}

/**
 * Helper to publish a member_left event
 */
export function publishMemberLeft(
  channelId: string,
  memberDid: string
): void {
  eventPublisher.publish(channelId, {
    type: "member_left",
    channelId,
    memberDid,
  });
}

/**
 * Helper to publish a typing event
 */
export function publishTyping(
  channelId: string,
  authorDid: string,
  threadId?: string
): void {
  eventPublisher.publish(channelId, {
    type: "typing",
    channelId,
    authorDid,
    threadId,
  });
}

/**
 * Helper to publish a reaction_added event
 */
export function publishReactionAdded(
  channelId: string,
  messageId: string,
  emoji: string,
  byDid: string
): void {
  eventPublisher.publish(channelId, {
    type: "reaction_added",
    channelId,
    messageId,
    emoji,
    byDid,
  });
}

/**
 * Helper to publish a bridge_synced event
 */
export function publishBridgeSynced(
  channelId: string,
  bridgeId: string,
  externalMessageId: string
): void {
  eventPublisher.publish(channelId, {
    type: "bridge_synced",
    channelId,
    bridgeId,
    externalMessageId,
  });
}
