/**
 * Tests for the channels feature:
 *   Service layer: ChannelService (lib/channel-service.ts)
 *   Dispatcher:    MessageDispatcher (lib/message-dispatcher.ts)
 *   Bridge layer:  ChannelBridgeService, WebhookGateway, BridgeFactory
 *   API routes:
 *     GET  /api/channels                                    — list channels in workspace
 *     POST /api/channels                                    — create channel
 *     GET  /api/channels/[id]                               — channel detail
 *     PATCH /api/channels/[id]                              — update channel
 *     DELETE /api/channels/[id]                             — archive channel
 *     POST /api/channels/[id]/members                       — add member
 *     DELETE /api/channels/[id]/members                     — remove member (did in URL)
 *     GET  /api/channels/[id]/messages                      — list messages
 *     POST /api/channels/[id]/messages                      — post message
 *     POST /api/channels/[id]/messages/agent-response       — agent posts message
 *     GET  /api/channels/[id]/bridges                       — list bridges
 *     POST /api/channels/[id]/bridges                       — create bridge
 *     PATCH /api/channels/[id]/bridges/[bridgeId]           — update bridge
 *     DELETE /api/channels/[id]/bridges/[bridgeId]          — delete bridge
 *     POST /api/bridges/webhook/[bridgeId]/incoming         — incoming webhook
 *     GET  /api/agents/search                               — search agents by name
 *     GET  /api/me/workspaces                                   — workspaces for current user
 *   Peer agents removal:
 *     Peer grant API routes have been deleted
 *     pushPeerCatalog has been removed from WSServer
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  unauthorized: () => ({
    _status: 401,
    async json() {
      return { error: "Not authenticated" };
    },
  }),
  forbidden: () => ({
    _status: 403,
    async json() {
      return { error: "Forbidden" };
    },
  }),
}));

vi.mock("@/lib/ws-server", () => ({
  getWSServer: vi.fn(() => ({
    sendTaskToAgent: vi.fn(() => false), // returns false → agent offline
    isAgentOnline: vi.fn(() => false),
    getConnectedAgents: vi.fn(() => []),
  })),
}));

vi.mock("@/lib/user-dao", () => ({
  UserDao: {
    getByDid: vi.fn((did: string) =>
      did.startsWith("did:") ? { id: "user-uuid-123", did } : null
    ),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { prisma } from "../packages/control-plane/db/client";
import { ChannelService } from "../packages/control-plane/lib/channel-service";
import { MessageDispatcher } from "../packages/control-plane/lib/message-dispatcher";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { getWSServer } from "../packages/control-plane/lib/ws-server";
import { NextRequest } from "next/server";

// API route handlers
import {
  GET as channelsGET,
  POST as channelsPOST,
} from "../packages/control-plane/app/api/channels/route";
import {
  GET as channelDetailGET,
  PATCH as channelDetailPATCH,
  DELETE as channelDetailDELETE,
} from "../packages/control-plane/app/api/channels/[id]/route";
import { POST as membersPOST } from "../packages/control-plane/app/api/channels/[id]/members/route";
import { DELETE as membersDELETE } from "../packages/control-plane/app/api/channels/[id]/members/[memberDid]/route";
import {
  GET as messagesGET,
  POST as messagesPOST,
} from "../packages/control-plane/app/api/channels/[id]/messages/route";
import { POST as agentResponsePOST } from "../packages/control-plane/app/api/channels/[id]/messages/agent-response/route";
import {
  GET as bridgesGET,
  POST as bridgesPOST,
} from "../packages/control-plane/app/api/channels/[id]/bridges/route";
import {
  PATCH as bridgePATCH,
  DELETE as bridgeDELETE,
} from "../packages/control-plane/app/api/channels/[id]/bridges/[bridgeId]/route";
import { POST as webhookIncomingPOST } from "../packages/control-plane/app/api/bridges/webhook/[bridgeId]/incoming/route";
import { GET as meWorkspacesGET } from "../packages/control-plane/app/api/workspaces/me/route";

// Bridge / gateway layer
import { ChannelBridgeService } from "../packages/control-plane/lib/channel-bridge-service";
import { WebhookGateway } from "../packages/control-plane/lib/bridges/webhook-gateway";
import { BridgeFactory } from "../packages/control-plane/lib/bridges/bridge-factory";
import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;

/** Test row prefix — used to identify and clean up all test data (IDs, names) */
const T = "test:channels:";
/** Slug-safe prefix — only lowercase letters, numbers, hyphens (valid channel slug chars) */
const S = "tch-";

function makeAdminContext(workspaceId?: string) {
  return {
    did: "did:test:admin",
    isGlobalAdmin: true,
    isOwner: true,
    canAccessWorkspace: (_id: string) => true,
    canAdminWorkspace: (_id: string) => true,
  };
}

function makeMemberContext(channelId?: string) {
  return {
    did: "did:test:member",
    isGlobalAdmin: false,
    isOwner: false,
    canAccessWorkspace: (_id: string) => true,
    canAdminWorkspace: (_id: string) => false,
  };
}

function channelParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function messageParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function msgDetailParams(id: string, msgId: string) {
  return { params: Promise.resolve({ id, msgId }) };
}

function bridgeParams(id: string, bridgeId: string) {
  return { params: Promise.resolve({ id, bridgeId }) };
}

function webhookIncomingParams(bridgeId: string) {
  return { params: Promise.resolve({ bridgeId }) };
}

/** Compute the HMAC-SHA256 signature header matching WebhookGateway format */
function makeWebhookSignature(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

/**
 * Fake NextRequest for the webhook incoming route.
 * The route calls req.text() (raw body for HMAC) then req.headers.get("x-signature").
 * The test environment's NextRequest doesn't implement .text(), so we provide a
 * minimal fake that satisfies exactly what the route handler needs.
 */
function webhookReq(url: string, bodyStr: string, sig: string): NextRequest {
  const headers = new Headers();
  headers.set("x-signature", sig);
  return {
    url,
    text: async () => bodyStr,
    headers,
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// Test workspace + agent setup
// ---------------------------------------------------------------------------

let testWorkspaceId: string;
let testAgentDid: string;
let testAgentName: string;

beforeAll(async () => {
  testWorkspaceId = `${T}workspace-1`;
  testAgentDid = `${T}agent-did-1`;
  testAgentName = "tch-test-agent";

  // ── Prisma (ChannelService + API routes use Prisma) ──────────────────────
  await prisma.workspace.upsert({
    where: { id: testWorkspaceId },
    create: {
      id: testWorkspaceId,
      name: "Channel Test Workspace",
      slug: "channel-test-workspace",
      color: "#6366f1",
    },
    update: {},
  });
  await prisma.agent.upsert({
    where: { did: testAgentDid },
    create: { did: testAgentDid, name: testAgentName, capabilities: [] },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: "user-uuid-123" },
    create: { id: "user-uuid-123", did: "did:test:admin", name: "Test Admin" },
    update: {},
  });
  await prisma.userWorkspace.upsert({
    where: {
      userId_workspaceId: { userId: "user-uuid-123", workspaceId: testWorkspaceId },
    },
    create: {
      userId: "user-uuid-123",
      workspaceId: testWorkspaceId,
      isWorkspaceAdmin: true,
    },
    update: {},
  });
});

afterAll(async () => {
  // Prisma cleanup
  await prisma.userWorkspace.deleteMany({ where: { userId: "user-uuid-123" } });
  await prisma.user.deleteMany({ where: { id: "user-uuid-123" } });
  await prisma.agent.deleteMany({ where: { did: testAgentDid } });
  await prisma.workspace.deleteMany({ where: { id: { startsWith: T } } });
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(makeAdminContext());
});

// ===========================================================================
// SERVICE: ChannelService
// ===========================================================================

describe("ChannelService: createChannel", () => {
  it("creates a channel and adds creator as owner member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Test Channel",
      slug: `${S}create-basic`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:creator",
    });

    try {
      expect(channel.id).toBeTruthy();
      // ChannelDao.create returns the raw DB row — verify via getChannel for normalized fields
      const fetched = await ChannelService.getChannel(channel.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Test Channel");
      expect(fetched!.slug).toBe(`${S}create-basic`);
      expect(fetched!.workspaceId).toBe(testWorkspaceId);
      expect(fetched!.isArchived).toBe(false);

      // Creator should be an owner member
      const role = await ChannelService.getMemberRole(
        channel.id,
        "did:test:creator"
      );
      expect(role).toBe("owner");
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("throws on invalid slug format", async () => {
    await expect(
      ChannelService.createChannel({
        name: "Bad Slug",
        slug: "Bad Slug!",
        workspaceId: testWorkspaceId,
        creatorDid: "did:test:admin",
      })
    ).rejects.toThrow(/slug/i);
  });

  it("throws on duplicate slug within the same workspace", async () => {
    const slug = `${S}dup-slug`;
    const channel = await ChannelService.createChannel({
      name: "First",
      slug,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await expect(
        ChannelService.createChannel({
          name: "Second",
          slug,
          workspaceId: testWorkspaceId,
          creatorDid: "did:test:admin",
        })
      ).rejects.toThrow(/already exists/i);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: getChannel", () => {
  it("returns null for unknown id", async () => {
    expect(await ChannelService.getChannel("does-not-exist")).toBeNull();
  });

  it("returns the channel for a known id", async () => {
    const channel = await ChannelService.createChannel({
      name: "Get Test",
      slug: `${S}get-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const found = await ChannelService.getChannel(channel.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(channel.id);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: postMessage", () => {
  it("persists a message in the channel", async () => {
    const channel = await ChannelService.createChannel({
      name: "Msg Test",
      slug: `${S}msg-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const msg = await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Hello, world!",
      });

      expect(msg.id).toBeTruthy();
      expect(msg.channelId).toBe(channel.id);
      expect(msg.content).toBe("Hello, world!");
      expect(msg.authorType).toBe("user");
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("does NOT dispatch mention processing for agent messages", async () => {
    // Reset ws-server mock call counts
    const mockWs = getWSServer();
    vi.mocked(mockWs.sendTaskToAgent).mockClear();

    const channel = await ChannelService.createChannel({
      name: "Agent Msg",
      slug: `${S}agent-msg`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      // Agent posts a message mentioning something
      await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: testAgentDid,
        authorType: "agent",
        content: `@${testAgentName} hello`,
      });

      // Give micro-tasks a chance (even though agent path is sync-only)
      await new Promise((r) => setTimeout(r, 10));

      // sendTaskToAgent should NOT be called for agent-authored messages
      expect(vi.mocked(mockWs.sendTaskToAgent)).not.toHaveBeenCalled();
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: createThreadReply", () => {
  it("creates a reply with correct threadId set to parentMessageId", async () => {
    const channel = await ChannelService.createChannel({
      name: "Thread Test",
      slug: `${S}thread-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const parent = await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Parent message",
      });

      const reply = await ChannelService.createThreadReply({
        channelId: channel.id,
        parentMessageId: parent.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Reply here",
      });

      expect(reply.threadId).toBe(parent.id);
      expect(reply.channelId).toBe(channel.id);
      expect(reply.content).toBe("Reply here");
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("throws if parent message not found", async () => {
    const channel = await ChannelService.createChannel({
      name: "Thread Err",
      slug: `${S}thread-err`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await expect(
        ChannelService.createThreadReply({
          channelId: channel.id,
          parentMessageId: "nonexistent-message-id",
          authorDid: "did:test:admin",
          authorType: "user",
          content: "Reply",
        })
      ).rejects.toThrow(/not found/i);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: addChannelMember / removeChannelMember", () => {
  it("adds a member successfully", async () => {
    const channel = await ChannelService.createChannel({
      name: "Member Test",
      slug: `${S}member-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const member = await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:new-member",
        memberType: "user",
      });

      // ChannelMemberDao.addMember returns raw DB row (member_did, not memberDid)
      expect((member as any).member_did ?? member.memberDid).toBe(
        "did:test:new-member"
      );
      expect(member.role).toBe("member");
      expect(
        await ChannelService.isMember(channel.id, "did:test:new-member")
      ).toBe(true);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("throws on duplicate member addition", async () => {
    const channel = await ChannelService.createChannel({
      name: "Dup Member",
      slug: `${S}dup-member`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:dup",
        memberType: "user",
      });

      await expect(
        ChannelService.addChannelMember({
          channelId: channel.id,
          memberDid: "did:test:dup",
          memberType: "user",
        })
      ).rejects.toThrow(/already in/i);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("removes a member and isMember returns false", async () => {
    const channel = await ChannelService.createChannel({
      name: "Remove Member",
      slug: `${S}remove-member`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:to-remove",
        memberType: "user",
      });

      expect(
        await ChannelService.isMember(channel.id, "did:test:to-remove")
      ).toBe(true);

      await ChannelService.removeChannelMember(
        channel.id,
        "did:test:to-remove"
      );

      expect(
        await ChannelService.isMember(channel.id, "did:test:to-remove")
      ).toBe(false);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: getMemberRole", () => {
  it("returns correct role for an existing member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Role Test",
      slug: `${S}role-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:moderator",
        memberType: "user",
        role: "moderator",
      });

      expect(
        await ChannelService.getMemberRole(channel.id, "did:test:moderator")
      ).toBe("moderator");
      // Creator is owner
      expect(
        await ChannelService.getMemberRole(channel.id, "did:test:admin")
      ).toBe("owner");
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns null for a non-member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Null Role",
      slug: `${S}null-role`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      expect(
        await ChannelService.getMemberRole(channel.id, "did:test:outsider")
      ).toBeNull();
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

describe("ChannelService: getChannelStats", () => {
  it("returns message_count and member_count", async () => {
    const channel = await ChannelService.createChannel({
      name: "Stats Test",
      slug: `${S}stats-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      // Creator is already a member; add one more
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:stats-member",
        memberType: "user",
      });

      // Post two messages
      await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "msg 1",
      });
      await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "msg 2",
      });

      const stats = await ChannelService.getChannelStats(channel.id);
      expect(stats.messageCount).toBe(2);
      expect(stats.memberCount).toBe(2); // creator + stats-member
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// SERVICE: MessageDispatcher
// ===========================================================================

describe("MessageDispatcher: extractMentions", () => {
  it("parses a single @name mention", async () => {
    expect(MessageDispatcher.extractMentions("Hello @alice")).toEqual([
      "alice",
    ]);
  });

  it("parses multiple @mentions", async () => {
    const mentions = MessageDispatcher.extractMentions(
      "@bob and @carol please help"
    );
    expect(mentions).toContain("bob");
    expect(mentions).toContain("carol");
    expect(mentions).toHaveLength(2);
  });

  it("handles hyphenated names", async () => {
    expect(MessageDispatcher.extractMentions("@my-agent do it")).toEqual([
      "my-agent",
    ]);
  });

  it("returns empty array when no mentions", async () => {
    expect(MessageDispatcher.extractMentions("no mentions here")).toEqual([]);
  });
});

describe("MessageDispatcher: processMessage", () => {
  it("returns early without creating a thread if no mentions", async () => {
    const channel = await ChannelService.createChannel({
      name: "Dispatcher No Mention",
      slug: `${S}dispatcher-no-mention`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const msg = await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "no mention here",
      });

      await MessageDispatcher.processMessage(
        channel.id,
        msg.id,
        "did:test:admin",
        "no mention here"
      );

      // No thread replies should have been created
      const thread = await ChannelService.getThread(msg.id);
      expect(thread).toHaveLength(0);
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("creates a thread reply when a known agent is @mentioned", async () => {
    const channel = await ChannelService.createChannel({
      name: "Dispatcher Mention",
      slug: `${S}dispatcher-mention`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const msg = await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: `@${testAgentName} can you help?`,
      });

      await MessageDispatcher.processMessage(
        channel.id,
        msg.id,
        "did:test:admin",
        `@${testAgentName} can you help?`
      );

      // A thread should have been created for the mention
      const thread = await ChannelService.getThread(msg.id);
      expect(thread.length).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("posts an offline notice when agent is not connected", async () => {
    // ws-server mock already returns sendTaskToAgent = () => false (offline)
    const channel = await ChannelService.createChannel({
      name: "Dispatcher Offline",
      slug: `${S}dispatcher-offline`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const msg = await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: `@${testAgentName} are you there?`,
      });

      await MessageDispatcher.processMessage(
        channel.id,
        msg.id,
        "did:test:admin",
        `@${testAgentName} are you there?`
      );

      // Offline notice is posted directly as a thread reply on the parent message
      const thread = await ChannelService.getThread(msg.id);
      const offlineNotice = thread.find(
        (m) => m.authorType === "agent" && m.content.includes("offline")
      );
      expect(offlineNotice).toBeDefined();
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: GET /api/channels
// ===========================================================================

describe("GET /api/channels", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const r = req("GET", `http://localhost/api/channels?workspace=${testWorkspaceId}`);
    const res = await channelsGET(r as any);
    expect(res._status).toBe(401);
  });

  it("returns 400 if workspace query param is missing", async () => {
    const r = req("GET", "http://localhost/api/channels");
    const res = await channelsGET(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 404 if workspace does not exist", async () => {
    const r = req(
      "GET",
      "http://localhost/api/channels?workspace=nonexistent-workspace"
    );
    const res = await channelsGET(r as any);
    expect(res._status).toBe(404);
  });

  it("returns 200 with channels array for valid workspace", async () => {
    const channel = await ChannelService.createChannel({
      name: "List API Test",
      slug: `${S}list-api-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const r = req(
        "GET",
        `http://localhost/api/channels?workspace=${testWorkspaceId}`
      );
      const res = await channelsGET(r as any);
      expect(res._status).toBe(200);

      const body = (await res.json()) as { channels: { id: string }[] };
      expect(Array.isArray(body.channels)).toBe(true);
      expect(body.channels.some((c) => c.id === channel.id)).toBe(true);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: POST /api/channels
// ===========================================================================

describe("POST /api/channels", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const r = req("POST", "http://localhost/api/channels", {
      name: "Test",
      workspaceId: testWorkspaceId,
    });
    const res = await channelsPOST(r as any);
    expect(res._status).toBe(401);
  });

  it("returns 400 if name is missing", async () => {
    const r = req("POST", "http://localhost/api/channels", {
      workspaceId: testWorkspaceId,
    });
    const res = await channelsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 403 when creating a global channel without global admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(makeMemberContext());
    const r = req("POST", "http://localhost/api/channels", {
      name: "Global Chan",
    });
    const res = await channelsPOST(r as any);
    expect(res._status).toBe(403);
  });

  it("creates a workspace-scoped channel and returns 201", async () => {
    const r = req("POST", "http://localhost/api/channels", {
      name: "Created Via API",
      workspaceId: testWorkspaceId,
      description: "desc",
    });
    const res = await channelsPOST(r as any);
    expect(res._status).toBe(201);

    const body = (await res.json()) as {
      channel: {
        id: string;
        name: string;
        workspace_id?: string;
        workspaceId?: string;
      };
    };
    expect(body.channel.id).toBeTruthy();
    expect(body.channel.name).toBe("Created Via API");
    // ChannelDao.create returns raw row (workspace_id), so accept either form
    const returnedWorkspaceId = body.channel.workspaceId ?? body.channel.workspace_id;
    expect(returnedWorkspaceId).toBe(testWorkspaceId);

    // Cleanup
    await prisma.channelMember.deleteMany({
      where: { channelId: body.channel.id },
    });
    await prisma.channel
      .delete({ where: { id: body.channel.id } })
      .catch(() => {});
  });
});

// ===========================================================================
// API: GET /api/channels/[id]
// ===========================================================================

describe("GET /api/channels/[id]", () => {
  it("returns 404 for unknown channel id", async () => {
    const res = await channelDetailGET(
      req("GET", "http://localhost/api/channels/nope") as any,
      channelParams("nope")
    );
    expect(res._status).toBe(404);
  });

  it("returns 200 with channel + members + stats", async () => {
    const channel = await ChannelService.createChannel({
      name: "Detail Test",
      slug: `${S}detail-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await channelDetailGET(
        req("GET", `http://localhost/api/channels/${channel.id}`) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as {
        channel: { id: string };
        members: { memberDid: string }[];
        stats: { messageCount: number; memberCount: number };
      };
      expect(body.channel.id).toBe(channel.id);
      expect(Array.isArray(body.members)).toBe(true);
      expect(typeof body.stats.messageCount).toBe("number");
      expect(typeof body.stats.memberCount).toBe("number");
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: PATCH /api/channels/[id]
// ===========================================================================

describe("PATCH /api/channels/[id]", () => {
  it("returns 403 if requester is not owner or admin", async () => {
    // Member context, not owner of the channel
    mockGetAuthContext.mockResolvedValueOnce(makeMemberContext());
    const channel = await ChannelService.createChannel({
      name: "Patch Forbidden",
      slug: `${S}patch-forbidden`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:someone-else",
    });

    try {
      const res = await channelDetailPATCH(
        req("PATCH", "http://localhost/", { name: "New Name" }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 200 and updates name when called by admin", async () => {
    const channel = await ChannelService.createChannel({
      name: "Old Name",
      slug: `${S}patch-name`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await channelDetailPATCH(
        req("PATCH", "http://localhost/", { name: "New Name" }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { channel: { name: string } };
      expect(body.channel.name).toBe("New Name");
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: DELETE /api/channels/[id]
// ===========================================================================

describe("DELETE /api/channels/[id]", () => {
  it("returns 403 if requester is not owner or admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(makeMemberContext());
    const channel = await ChannelService.createChannel({
      name: "Delete Forbidden",
      slug: `${S}delete-forbidden`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:someone-else",
    });

    try {
      const res = await channelDetailDELETE(
        req("DELETE", "http://localhost/") as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 200 and archives channel when called by admin", async () => {
    const channel = await ChannelService.createChannel({
      name: "Archive Me",
      slug: `${S}archive-me`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    const res = await channelDetailDELETE(
      req("DELETE", "http://localhost/") as any,
      channelParams(channel.id)
    );
    expect(res._status).toBe(200);

    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify archived in DB
    const updated = await ChannelService.getChannel(channel.id);
    expect(updated?.isArchived).toBe(true);

    // Cleanup
    await prisma.channelMember.deleteMany({ where: { channelId: channel.id } });
    await prisma.channel.delete({ where: { id: channel.id } }).catch(() => {});
  });
});

// ===========================================================================
// API: POST /api/channels/[id]/members
// ===========================================================================

describe("POST /api/channels/[id]/members", () => {
  it("returns 400 if memberDid is missing", async () => {
    const channel = await ChannelService.createChannel({
      name: "Members 400",
      slug: `${S}members-400`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      // Admin is owner of this channel, so auth passes
      const res = await membersPOST(
        req("POST", "http://localhost/", { memberType: "user" }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(400);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 409 if member is already in channel", async () => {
    const channel = await ChannelService.createChannel({
      name: "Members 409",
      slug: `${S}members-409`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      // Add the member first
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:already-there",
        memberType: "user",
      });

      const res = await membersPOST(
        req("POST", "http://localhost/", {
          memberDid: "did:test:already-there",
          memberType: "user",
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(409);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 201 and adds the member successfully", async () => {
    const channel = await ChannelService.createChannel({
      name: "Members 201",
      slug: `${S}members-201`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await membersPOST(
        req("POST", "http://localhost/", {
          memberDid: "did:test:new-user",
          memberType: "user",
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(201);

      const body = (await res.json()) as {
        member: { memberDid?: string; member_did?: string };
      };
      // ChannelMemberDao.addMember returns raw DB row (member_did), accept either form
      const returnedDid = body.member.memberDid ?? body.member.member_did;
      expect(returnedDid).toBe("did:test:new-user");
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: DELETE /api/channels/[id]/members/[memberDid]
// ===========================================================================

describe("DELETE /api/channels/[id]/members/[memberDid]", () => {
  it("returns 200 and removes the member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Remove Via API",
      slug: `${S}remove-via-api`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: "did:test:to-remove-api",
        memberType: "user",
      });

      expect(
        await ChannelService.isMember(channel.id, "did:test:to-remove-api")
      ).toBe(true);

      const res = await membersDELETE(
        req(
          "DELETE",
          `http://localhost/api/channels/${channel.id}/members/did:test:to-remove-api`
        ) as any,
        {
          params: Promise.resolve({
            id: channel.id,
            memberDid: "did:test:to-remove-api",
          }),
        } as any
      );
      expect(res._status).toBe(200);

      expect(
        await ChannelService.isMember(channel.id, "did:test:to-remove-api")
      ).toBe(false);

      // Idempotent: removing a member that no longer exists still succeeds
      const res2 = await membersDELETE(
        req(
          "DELETE",
          `http://localhost/api/channels/${channel.id}/members/did:test:to-remove-api`
        ) as any,
        {
          params: Promise.resolve({
            id: channel.id,
            memberDid: "did:test:to-remove-api",
          }),
        } as any
      );
      expect(res2._status).toBe(200);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: GET /api/channels/[id]/messages
// ===========================================================================

describe("GET /api/channels/[id]/messages", () => {
  it("returns 200 with messages array for a channel member", async () => {
    // Auth context with did:test:admin who is a member (owner)
    const channel = await ChannelService.createChannel({
      name: "Msgs List",
      slug: `${S}msgs-list`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelService.postMessage({
        channelId: channel.id,
        authorDid: "did:test:admin",
        authorType: "user",
        content: "First message",
      });

      const res = await messagesGET(
        req(
          "GET",
          `http://localhost/api/channels/${channel.id}/messages`
        ) as any,
        messageParams(channel.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { messages: { content: string }[] };
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages.some((m) => m.content === "First message")).toBe(
        true
      );
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 403 if requester is not a channel member", async () => {
    mockGetAuthContext.mockResolvedValueOnce(makeMemberContext()); // did:test:member, not a member of the channel
    const channel = await ChannelService.createChannel({
      name: "Msgs Forbidden",
      slug: `${S}msgs-forbidden`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:someone-else",
    });

    try {
      const res = await messagesGET(
        req(
          "GET",
          `http://localhost/api/channels/${channel.id}/messages`
        ) as any,
        messageParams(channel.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: POST /api/channels/[id]/messages
// ===========================================================================

describe("POST /api/channels/[id]/messages", () => {
  it("returns 400 if content is empty", async () => {
    const channel = await ChannelService.createChannel({
      name: "Post Msg 400",
      slug: `${S}post-msg-400`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await messagesPOST(
        req("POST", "http://localhost/", { content: "   " }) as any,
        messageParams(channel.id)
      );
      expect(res._status).toBe(400);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 201 and creates a message for a channel member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Post Msg 201",
      slug: `${S}post-msg-201`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await messagesPOST(
        req("POST", "http://localhost/", { content: "Hello from API!" }) as any,
        messageParams(channel.id)
      );
      expect(res._status).toBe(201);

      const body = (await res.json()) as {
        message: { content: string; authorType: string };
      };
      expect(body.message.content).toBe("Hello from API!");
      expect(body.message.authorType).toBe("user");
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: POST /api/channels/[id]/messages/agent-response
// ===========================================================================

describe("POST /api/channels/[id]/messages/agent-response", () => {
  it("returns 403 if agent is not a channel member", async () => {
    // Use agent DID that is not a member
    mockGetAuthContext.mockResolvedValueOnce({
      did: "did:test:unknown-agent",
      isGlobalAdmin: false,
      canAccessWorkspace: () => true,
      canAdminWorkspace: () => false,
    });

    const channel = await ChannelService.createChannel({
      name: "Agent Resp 403",
      slug: `${S}agent-resp-403`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await agentResponsePOST(
        req("POST", "http://localhost/", { content: "Agent reply" }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 201 and posts agent message when agent is a member", async () => {
    const channel = await ChannelService.createChannel({
      name: "Agent Resp 201",
      slug: `${S}agent-resp-201`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      // Add the agent as a member
      await ChannelService.addChannelMember({
        channelId: channel.id,
        memberDid: testAgentDid,
        memberType: "agent",
      });

      // Auth as agent
      mockGetAuthContext.mockResolvedValueOnce({
        did: testAgentDid,
        isGlobalAdmin: false,
        canAccessWorkspace: () => true,
        canAdminWorkspace: () => false,
      });

      const res = await agentResponsePOST(
        req("POST", "http://localhost/", {
          content: "Agent response here",
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(201);

      const body = (await res.json()) as {
        message: { content: string; authorType: string };
      };
      expect(body.message.content).toBe("Agent response here");
      expect(body.message.authorType).toBe("agent");
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: GET /api/workspaces/me
// ===========================================================================

describe("GET /api/workspaces/me", () => {
  it("returns 401 when unauthenticated", async () => {
    // The migrated route relies on getAuthContext throwing (not returning null);
    // createNextRoute maps the APIException to its HTTP status.
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const r = req("GET", "http://localhost/api/workspaces/me");
    const res = await meWorkspacesGET(r as any);
    expect(res.status).toBe(401);
  });

  it("returns 200 with workspaces for the authenticated user", async () => {
    // did:test:admin → UserDao.getByDid returns { id: 'user-uuid-123' }
    // user-uuid-123 is enrolled in testWorkspaceId in beforeAll
    const r = req("GET", "http://localhost/api/workspaces/me");
    const res = await meWorkspacesGET(r as any);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { userWorkspaces: { workspaceId: string }[] };
    expect(Array.isArray(body.userWorkspaces)).toBe(true);
    expect(body.userWorkspaces.some((r) => r.workspaceId === testWorkspaceId)).toBe(true);
  });
});

// ===========================================================================
// UNIT: WebhookGateway
// ===========================================================================

describe("WebhookGateway: verifySignature", () => {
  const secret = "test-secret-abc";
  const body = JSON.stringify({ message: "hello" });
  const validSig = makeWebhookSignature(body, secret);

  it("returns true for a correct HMAC-SHA256 signature", async () => {
    expect(WebhookGateway.verifySignature(body, secret, validSig)).toBe(true);
  });

  it("returns false for a wrong signature", async () => {
    expect(
      WebhookGateway.verifySignature(body, secret, "sha256=deadbeef")
    ).toBe(false);
  });

  it("returns false when signatureHeader is null", async () => {
    expect(WebhookGateway.verifySignature(body, secret, null)).toBe(false);
  });

  it("returns false when signature lacks sha256= prefix", async () => {
    const raw = createHmac("sha256", secret).update(body).digest("hex");
    expect(WebhookGateway.verifySignature(body, secret, raw)).toBe(false);
  });

  it("returns false for a valid signature computed with a different secret", async () => {
    const wrongSig = makeWebhookSignature(body, "wrong-secret");
    expect(WebhookGateway.verifySignature(body, secret, wrongSig)).toBe(false);
  });
});

describe("WebhookGateway: sendOutgoing", () => {
  it("returns true when the external URL responds 2xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await WebhookGateway.sendOutgoing(
      { webhookUrl: "", outgoingUrl: "https://example.com/hook", secret: "s" },
      {
        channelId: "ch-1",
        messageId: "msg-1",
        authorDid: "did:test:user",
        authorType: "user",
        content: "hello",
        threadId: null,
        createdAt: new Date().toISOString(),
      }
    );

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/hook");
    expect((init.headers as Record<string, string>)["X-Signature"]).toMatch(
      /^sha256=/
    );
    fetchSpy.mockRestore();
  });

  it("returns false when the external URL responds 5xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await WebhookGateway.sendOutgoing(
      { webhookUrl: "", outgoingUrl: "https://example.com/hook", secret: "s" },
      {
        channelId: "c",
        messageId: "m",
        authorDid: "d",
        authorType: "user",
        content: "x",
        threadId: null,
        createdAt: "",
      }
    );

    expect(result).toBe(false);
    fetchSpy.mockRestore();
  });

  it("returns false on network error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await WebhookGateway.sendOutgoing(
      { webhookUrl: "", outgoingUrl: "https://example.com/hook", secret: "s" },
      {
        channelId: "c",
        messageId: "m",
        authorDid: "d",
        authorType: "user",
        content: "x",
        threadId: null,
        createdAt: "",
      }
    );

    expect(result).toBe(false);
    fetchSpy.mockRestore();
  });
});

// ===========================================================================
// UNIT: BridgeFactory.fanOutMessage
// ===========================================================================

describe("BridgeFactory: fanOutMessage", () => {
  it("calls WebhookGateway.sendOutgoing for an active outgoing webhook bridge", async () => {
    const channel = await ChannelService.createChannel({
      name: "Fan-out Test",
      slug: `${S}fan-out-test`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-ch-1",
        externalChannelName: "My Webhook",
        externalWorkspaceId: "ws-1",
        syncDirection: "bidirectional",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://example.com/out",
          secret: "fan-secret",
        },
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      await BridgeFactory.fanOutMessage(channel.id, {
        id: "msg-fan-1",
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Test fan-out",
        threadId: null,
        createdAt: new Date().toISOString(),
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][0]).toBe("https://example.com/out");
      fetchSpy.mockRestore();
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("skips disabled bridges", async () => {
    const channel = await ChannelService.createChannel({
      name: "Skip Disabled",
      slug: `${S}skip-disabled`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-ch-2",
        externalChannelName: "Disabled Hook",
        externalWorkspaceId: "ws-2",
        syncDirection: "bidirectional",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://example.com/out2",
          secret: "s",
        },
      });

      // Disable it
      await ChannelBridgeService.toggleBridgeSync(bridge.id, false);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await BridgeFactory.fanOutMessage(channel.id, {
        id: "msg-2",
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Should not fan out",
        threadId: null,
        createdAt: new Date().toISOString(),
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("skips incoming-only bridges", async () => {
    const channel = await ChannelService.createChannel({
      name: "Skip Incoming",
      slug: `${S}skip-incoming`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-ch-3",
        externalChannelName: "Incoming Only",
        externalWorkspaceId: "ws-3",
        syncDirection: "incoming",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://example.com/out3",
          secret: "s",
        },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await BridgeFactory.fanOutMessage(channel.id, {
        id: "msg-3",
        authorDid: "did:test:admin",
        authorType: "user",
        content: "Incoming only — no fan-out",
        threadId: null,
        createdAt: new Date().toISOString(),
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// SERVICE: ChannelBridgeService
// ===========================================================================

describe("ChannelBridgeService: createBridge / listBridges / deleteBridge", () => {
  it("creates a webhook bridge and returns it via listBridges", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge CRUD",
      slug: `${S}bridge-crud`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-list-1",
        externalChannelName: "List Test",
        externalWorkspaceId: "ws-list",
        config: {
          webhookUrl: "https://in.example.com",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      });

      expect(bridge.id).toBeTruthy();
      expect(bridge.externalService).toBe("webhook");

      const list = await ChannelBridgeService.listBridges(channel.id);
      expect(list.some((b) => b.id === bridge.id)).toBe(true);

      // Delete and verify it's gone
      await ChannelBridgeService.deleteBridge(bridge.id);
      const afterDelete = await ChannelBridgeService.listBridges(channel.id);
      expect(afterDelete.some((b) => b.id === bridge.id)).toBe(false);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("throws when creating a duplicate bridge for the same channel+service+externalChannelId", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge Dup",
      slug: `${S}bridge-dup`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const config = {
        webhookUrl: "",
        outgoingUrl: "https://out.example.com",
        secret: "s",
      };
      await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-dup",
        externalChannelName: "Dup",
        externalWorkspaceId: "ws-dup",
        config,
      });

      await expect(
        ChannelBridgeService.createBridge({
          channelId: channel.id,
          externalService: "webhook",
          externalChannelId: "ext-dup",
          externalChannelName: "Dup Again",
          externalWorkspaceId: "ws-dup",
          config,
        })
      ).rejects.toThrow(/already exists/i);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("toggleBridgeSync enables and disables a bridge", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge Toggle",
      slug: `${S}bridge-toggle`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-toggle",
        externalChannelName: "Toggle",
        externalWorkspaceId: "ws-toggle",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      });

      expect(bridge.isSyncEnabled).toBe(true);

      const disabled = await ChannelBridgeService.toggleBridgeSync(
        bridge.id,
        false
      );
      expect(disabled.isSyncEnabled).toBe(false);

      const enabled = await ChannelBridgeService.toggleBridgeSync(
        bridge.id,
        true
      );
      expect(enabled.isSyncEnabled).toBe(true);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: GET /api/channels/[id]/bridges
// ===========================================================================

describe("GET /api/channels/[id]/bridges", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await bridgesGET(
      req("GET", "http://localhost/") as any,
      channelParams("any-id")
    );
    expect(res._status).toBe(401);
  });

  it("returns 404 for an unknown channel", async () => {
    const res = await bridgesGET(
      req("GET", "http://localhost/") as any,
      channelParams("does-not-exist")
    );
    expect(res._status).toBe(404);
  });

  it("returns 200 with bridges array (configJson stripped)", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridges GET",
      slug: `${S}bridges-get`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-get-1",
        externalChannelName: "Get Test",
        externalWorkspaceId: "ws-get",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "topsecret",
        },
      });

      const res = await bridgesGET(
        req("GET", "http://localhost/") as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { bridges: Record<string, unknown>[] };
      expect(Array.isArray(body.bridges)).toBe(true);
      expect(body.bridges.length).toBeGreaterThan(0);
      // configJson must never be exposed
      expect(body.bridges[0]).not.toHaveProperty("configJson");
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: POST /api/channels/[id]/bridges
// ===========================================================================

describe("POST /api/channels/[id]/bridges", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    // Body must pass contract validation so the handler (and thus the auth
    // check) actually runs — createNextRoute validates the body first.
    const res = await bridgesPOST(
      req("POST", "http://localhost/", {
        externalService: "webhook",
        externalChannelId: "c",
        externalChannelName: "n",
        externalWorkspaceId: "w",
        config: { webhookUrl: "", outgoingUrl: "https://x.com", secret: "s" },
      }) as any,
      channelParams("any-id")
    );
    expect(res._status).toBe(401);
  });

  it("returns 400 if externalService is missing", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge POST 400a",
      slug: `${S}bridge-post-400a`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await bridgesPOST(
        req("POST", "http://localhost/", {
          externalChannelId: "c",
          externalChannelName: "n",
          externalWorkspaceId: "w",
          config: { webhookUrl: "", outgoingUrl: "https://x.com", secret: "s" },
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(400);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 400 if config is missing", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge POST 400b",
      slug: `${S}bridge-post-400b`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await bridgesPOST(
        req("POST", "http://localhost/", {
          externalService: "webhook",
          externalChannelId: "c",
          externalChannelName: "n",
          externalWorkspaceId: "w",
          // no config
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(400);
    } finally {
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 201 and creates a webhook bridge (configJson stripped)", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge POST 201",
      slug: `${S}bridge-post-201`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const res = await bridgesPOST(
        req("POST", "http://localhost/", {
          externalService: "webhook",
          externalChannelId: "ext-post-201",
          externalChannelName: "Created Bridge",
          externalWorkspaceId: "ws-post-201",
          syncDirection: "outgoing",
          config: {
            webhookUrl: "",
            outgoingUrl: "https://out.example.com",
            secret: "mysecret",
          },
        }) as any,
        channelParams(channel.id)
      );
      expect(res._status).toBe(201);

      const body = (await res.json()) as { bridge: Record<string, unknown> };
      expect(body.bridge.id).toBeTruthy();
      expect(body.bridge.externalService).toBe("webhook");
      expect(body.bridge.syncDirection).toBe("outgoing");
      expect(body.bridge).not.toHaveProperty("configJson");
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 409 when creating a duplicate bridge", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge POST 409",
      slug: `${S}bridge-post-409`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const payload = {
        externalService: "webhook",
        externalChannelId: "ext-dup-api",
        externalChannelName: "Dup",
        externalWorkspaceId: "ws-dup-api",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      };

      const first = await bridgesPOST(
        req("POST", "http://localhost/", payload) as any,
        channelParams(channel.id)
      );
      expect(first._status).toBe(201);

      const second = await bridgesPOST(
        req("POST", "http://localhost/", payload) as any,
        channelParams(channel.id)
      );
      expect(second._status).toBe(409);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: PATCH /api/channels/[id]/bridges/[bridgeId]
// ===========================================================================

describe("PATCH /api/channels/[id]/bridges/[bridgeId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await bridgePATCH(
      req("PATCH", "http://localhost/", {}) as any,
      bridgeParams("ch", "br")
    );
    expect(res._status).toBe(401);
  });

  it("returns 404 for a non-existent bridge", async () => {
    const res = await bridgePATCH(
      req("PATCH", "http://localhost/", { isSyncEnabled: false }) as any,
      bridgeParams("ch", "non-existent-bridge-id")
    );
    expect(res._status).toBe(404);
  });

  it("toggles isSyncEnabled and returns 200", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge PATCH",
      slug: `${S}bridge-patch`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-patch",
        externalChannelName: "Patch",
        externalWorkspaceId: "ws-patch",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      });

      const res = await bridgePATCH(
        req("PATCH", "http://localhost/", { isSyncEnabled: false }) as any,
        bridgeParams(channel.id, bridge.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { bridge: { isSyncEnabled: boolean } };
      expect(body.bridge.isSyncEnabled).toBe(false);
      expect(body.bridge).not.toHaveProperty("configJson");
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("updates syncDirection and returns 200", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge PATCH Dir",
      slug: `${S}bridge-patch-dir`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-patch-dir",
        externalChannelName: "Dir",
        externalWorkspaceId: "ws-dir",
        syncDirection: "bidirectional",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      });

      const res = await bridgePATCH(
        req("PATCH", "http://localhost/", { syncDirection: "outgoing" }) as any,
        bridgeParams(channel.id, bridge.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { bridge: { syncDirection: string } };
      expect(body.bridge.syncDirection).toBe("outgoing");
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: DELETE /api/channels/[id]/bridges/[bridgeId]
// ===========================================================================

describe("DELETE /api/channels/[id]/bridges/[bridgeId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await bridgeDELETE(
      req("DELETE", "http://localhost/") as any,
      bridgeParams("ch", "br")
    );
    expect(res._status).toBe(401);
  });

  it("returns 404 for a non-existent bridge", async () => {
    const res = await bridgeDELETE(
      req("DELETE", "http://localhost/") as any,
      bridgeParams("ch", "non-existent-bridge-id")
    );
    expect(res._status).toBe(404);
  });

  it("returns 200 and removes the bridge", async () => {
    const channel = await ChannelService.createChannel({
      name: "Bridge DELETE",
      slug: `${S}bridge-delete`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-del",
        externalChannelName: "Del",
        externalWorkspaceId: "ws-del",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret: "s",
        },
      });

      const res = await bridgeDELETE(
        req("DELETE", "http://localhost/") as any,
        bridgeParams(channel.id, bridge.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);

      expect(await ChannelBridgeService.getBridge(bridge.id)).toBeNull();
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// API: POST /api/bridges/webhook/[bridgeId]/incoming
// ===========================================================================

describe("POST /api/bridges/webhook/[bridgeId]/incoming", () => {
  const secret = "webhook-test-secret";

  it("returns 404 for an unknown bridgeId", async () => {
    const body = JSON.stringify({ message: "hi" });
    const sig = makeWebhookSignature(body, secret);
    const res = await webhookIncomingPOST(
      webhookReq(
        "http://localhost/api/bridges/webhook/unknown-bridge/incoming",
        body,
        sig
      ),
      webhookIncomingParams("unknown-bridge")
    );
    expect(res._status).toBe(404);
  });

  it("returns 401 when HMAC signature is invalid", async () => {
    const channel = await ChannelService.createChannel({
      name: "Webhook Sig Fail",
      slug: `${S}webhook-sig-fail`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-sig-fail",
        externalChannelName: "Sig Fail",
        externalWorkspaceId: "ws-sig",
        syncDirection: "incoming",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret,
        },
      });

      const body = JSON.stringify({ message: "hello" });
      const res = await webhookIncomingPOST(
        webhookReq(
          `http://localhost/api/bridges/webhook/${bridge.id}/incoming`,
          body,
          "sha256=wrong"
        ),
        webhookIncomingParams(bridge.id)
      );
      expect(res._status).toBe(401);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 403 when bridge sync direction is outgoing-only", async () => {
    const channel = await ChannelService.createChannel({
      name: "Webhook Outgoing Only",
      slug: `${S}webhook-out-only`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-out-only",
        externalChannelName: "Out Only",
        externalWorkspaceId: "ws-out",
        syncDirection: "outgoing",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret,
        },
      });

      const body = JSON.stringify({ message: "hello" });
      const sig = makeWebhookSignature(body, secret);
      const res = await webhookIncomingPOST(
        webhookReq(
          `http://localhost/api/bridges/webhook/${bridge.id}/incoming`,
          body,
          sig
        ),
        webhookIncomingParams(bridge.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });

  it("returns 200, creates a channel message, and returns messageId on valid HMAC", async () => {
    const channel = await ChannelService.createChannel({
      name: "Webhook Success",
      slug: `${S}webhook-success`,
      workspaceId: testWorkspaceId,
      creatorDid: "did:test:admin",
    });

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: channel.id,
        externalService: "webhook",
        externalChannelId: "ext-success",
        externalChannelName: "Success",
        externalWorkspaceId: "ws-success",
        syncDirection: "incoming",
        config: {
          webhookUrl: "",
          outgoingUrl: "https://out.example.com",
          secret,
        },
      });

      const payload = {
        message: "Hello from webhook!",
        author: "webhook:ci-bot",
      };
      const body = JSON.stringify(payload);
      const sig = makeWebhookSignature(body, secret);

      const res = await webhookIncomingPOST(
        webhookReq(
          `http://localhost/api/bridges/webhook/${bridge.id}/incoming`,
          body,
          sig
        ),
        webhookIncomingParams(bridge.id)
      );
      expect(res._status).toBe(200);

      const resBody = (await res.json()) as { ok: boolean; messageId: string };
      expect(resBody.ok).toBe(true);
      expect(resBody.messageId).toBeTruthy();

      // Verify the message was persisted in the channel
      const messages = await ChannelService.listMessages(channel.id, 10, 0);
      expect(
        messages.some(
          (m) =>
            m.content === "Hello from webhook!" &&
            m.authorDid === "webhook:ci-bot"
        )
      ).toBe(true);
    } finally {
      await prisma.channelMessage.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelBridge.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel
        .delete({ where: { id: channel.id } })
        .catch(() => {});
    }
  });
});

// ===========================================================================
// Peer agents removal: verify routes no longer exist
// ===========================================================================

describe("Peer agents removal", () => {
  it("agent-peer-grant-dao no longer exists as a module", async () => {
    // The file was deleted — importing it should throw
    await expect(
      import("../packages/control-plane/lib/agent-peer-grant-dao")
    ).rejects.toThrow();
  });

  it("peer-grant signing utility no longer exists as a module", async () => {
    await expect(
      import("../packages/control-plane/lib/peer-grant")
    ).rejects.toThrow();
  });

  it("WSServer no longer has a pushPeerCatalog method", async () => {
    // vi.mock("@/lib/ws-server") at file scope means dynamic import also gets the mock.
    // Instead, read the actual source file to verify the method was removed.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "packages/control-plane/lib/ws-server.ts"),
      "utf-8"
    );
    expect(src).not.toContain("pushPeerCatalog");
  });
});
