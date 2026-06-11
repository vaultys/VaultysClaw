import { ChannelService } from "./channel-service";
import { publishThreadCreated } from "./channel-event-publisher";
import { getWSServer } from "./ws-server";
import { BridgeFactory } from "./bridges/bridge-factory";
import { AgentDAO } from "@/db";

/**
 * Detects @mentions in message content and creates threads with agent context
 */
export const MessageDispatcher = {
  /**
   * Extract @mentions from message content
   * Matches: @agentname, @user-name, etc.
   */
  extractMentions(content: string): string[] {
    const mentions: string[] = [];
    const pattern = /@([\w\-]+)/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  },

  /**
   * Fan out a message to all active external bridges for the channel.
   * Fire-and-forget — errors are caught and logged, never thrown.
   */
  async fanOutToBridges(
    channelId: string,
    message: {
      id: string;
      authorDid: string;
      authorType: string;
      content: string;
      threadId: string | null;
      createdAt: string;
    }
  ): Promise<void> {
    try {
      await BridgeFactory.fanOutMessage(channelId, message);
    } catch (err) {
      console.error("[MessageDispatcher] fanOutToBridges error:", err);
    }
  },

  /**
   * Process a message: detect mentions, create threads, invoke agents
   */
  async processMessage(
    channelId: string,
    messageId: string,
    authorDid: string,
    content: string,
    messageContext?: {
      id: string;
      authorType: string;
      threadId: string | null;
      createdAt: string;
    }
  ): Promise<void> {
    const mentions = this.extractMentions(content);

    const channel = await ChannelService.getChannel(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // For each mentioned agent, create a thread and invoke
    if (mentions.length > 0) {
      for (const mentionedName of mentions) {
        await this.handleMention(
          channelId,
          messageId,
          mentionedName,
          authorDid,
          content
        );
      }
    }

    // Fan out to external bridges (fire-and-forget)
    if (messageContext) {
      this.fanOutToBridges(channelId, {
        id: messageContext.id,
        authorDid,
        authorType: messageContext.authorType,
        content,
        threadId: messageContext.threadId,
        createdAt: messageContext.createdAt,
      }).catch((err) =>
        console.error("[MessageDispatcher] bridge fan-out error:", err)
      );
    }
  },

  /**
   * Handle a single @mention: create thread and invoke agent
   */
  async handleMention(
    channelId: string,
    parentMessageId: string,
    mentionedName: string,
    authorDid: string,
    fullMessageContent: string
  ): Promise<void> {
    // Publish thread created event so subscribers know a thread is starting
    publishThreadCreated(
      channelId,
      parentMessageId,
      parentMessageId, // agent will reply directly in the parent's thread
      mentionedName
    );

    // Agent responds directly to parentMessageId as the threadId
    // so its reply appears as a thread reply on the user's original message
    await this.invokeAgent(mentionedName, {
      channelId,
      threadId: parentMessageId,
      userDid: authorDid,
      content: fullMessageContent,
      context: {
        mentionContext: "user requested assistance",
      },
    });
  },

  /**
   * Invoke an agent via WebSocket task system
   */
  async invokeAgent(
    agentName: string,
    context: {
      channelId: string;
      threadId: string;
      userDid: string;
      content: string;
      context: Record<string, any>;
    }
  ): Promise<void> {
    // Find agent by name. Mentions are slug-safe (spaces replaced with
    // dashes on insert), so also try the de-slugged variant.
    const agentRow =
      (await AgentDAO.findByName(agentName)) ??
      (agentName.includes("-")
        ? await AgentDAO.findByName(agentName.replace(/-/g, " "))
        : null);
    if (!agentRow) {
      console.warn(`[MessageDispatcher] Agent not found: ${agentName}`);
      // Optionally post error message to thread
      return;
    }

    const agentDid = agentRow.did;

    // Get WebSocket server to send task
    const wsServer = getWSServer();
    if (!wsServer) {
      console.error(`[MessageDispatcher] WebSocket server not available`);
      return;
    }

    // Send task to agent
    const taskSent = wsServer.sendTaskToAgent(agentDid, "channel_mention", {
      channelId: context.channelId,
      threadId: context.threadId,
      userDid: context.userDid,
      userMessage: context.content,
      agentName,
    });

    if (!taskSent) {
      console.warn(
        `[MessageDispatcher] Agent not connected: ${agentName} (${agentDid})`
      );
      // Post message to thread that agent is offline
      try {
        await ChannelService.createThreadReply({
          channelId: context.channelId,
          parentMessageId: context.threadId,
          authorDid: agentDid,
          authorType: "agent",
          content: `⚠️ ${agentName} is currently offline. Your message has been saved and will be processed when they come online.`,
          metadata: {
            agentAction: "offline_notice",
          },
        });
      } catch (err) {
        console.error(
          `[MessageDispatcher] Failed to create offline notice: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  },
};
