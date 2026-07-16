/**
 * Tests for the MCP protocol layer in packages/mcp-gateway/src/mcp-server.ts.
 *
 * The @modelcontextprotocol/sdk Server only exposes registered handlers via
 * its internal `_requestHandlers` map (there is no public "call this tool"
 * API without a real transport), so `callTool`/`listTools`/etc. below reach
 * into that map directly — the same request/response shape a real MCP
 * client would trigger over stdio.
 *
 * FakeAgent stands in for McpGatewayAgent: it implements only the subset of
 * the public API mcp-server.ts actually calls (getStatus/getDid/
 * getPeerCatalog/invokePeer + the EventEmitter status_changed contract used
 * by waitForConnected), so these tests exercise the dispatch/validation
 * logic in mcp-server.ts without touching WebSocket/VaultysId at all.
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import type { AgentPeerGrant } from "@vaultysclaw/shared";
import { createMcpServer } from "../packages/mcp-gateway/src/mcp-server";
import type { McpGatewayAgent } from "../packages/mcp-gateway/src/agent";

class FakeAgent extends EventEmitter {
  status: string = "connected";
  did = "did:vaultys:fake-gateway";
  catalog: AgentPeerGrant[] = [];
  invokePeer = vi.fn(async (_did: string, _action: string, _params: unknown) => "peer-result");

  getStatus() {
    return this.status;
  }
  getDid() {
    return this.did;
  }
  getPeerCatalog() {
    return this.catalog;
  }

  setStatus(status: string) {
    this.status = status;
    this.emit("status_changed", { status });
  }
}

function makeGrant(overrides: Partial<AgentPeerGrant> = {}): AgentPeerGrant {
  return {
    targetDid: "did:vaultys:peer-1",
    targetName: "Peer One",
    skillDescription: "Does peer things",
    capabilities: ["text_generation"],
    ...overrides,
  } as AgentPeerGrant;
}

/** Build a server + no-op logger, backed by a mutable `getAgent()` closure. */
function setup(agent: FakeAgent | null) {
  const log = vi.fn();
  let current = agent;
  const server = createMcpServer(() => current as unknown as McpGatewayAgent | null, log);
  return {
    server,
    log,
    setAgent: (a: FakeAgent | null) => (current = a),
    listTools: () => (server as any)._requestHandlers.get("tools/list")({ method: "tools/list", params: {} }, {}),
    listResources: () =>
      (server as any)._requestHandlers.get("resources/list")({ method: "resources/list", params: {} }, {}),
    readResource: (uri: string) =>
      (server as any)._requestHandlers.get("resources/read")(
        { method: "resources/read", params: { uri } },
        {}
      ),
    callTool: (name: string, args?: Record<string, unknown>) =>
      (server as any)._requestHandlers.get("tools/call")(
        { method: "tools/call", params: { name, arguments: args ?? {} } },
        {}
      ),
  };
}

describe("mcp-gateway createMcpServer", () => {
  it("lists the fixed tool catalog regardless of agent state", async () => {
    const { listTools } = setup(null);
    const { tools } = await listTools();
    const names = tools.map((t: any) => t.name);
    expect(names).toEqual([
      "vc_list_agents",
      "vc_run_intent",
      "vc_chat",
      "vc_agent_status",
      "vc_gateway_metrics",
    ]);
  });

  it("vc_agent_status reports initializing when no agent exists yet", async () => {
    const { callTool } = setup(null);
    const result = await callTool("vc_agent_status");
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ status: "initializing", did: null, peerAgentCount: 0 });
    expect(result.isError).toBeUndefined();
  });

  it("vc_agent_status reports the agent's real status and peer count once set", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    const { callTool } = setup(agent);
    const result = await callTool("vc_agent_status");
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ status: "connected", did: agent.did, peerAgentCount: 1 });
  });

  it("rejects any other tool when the agent has not been initialized", async () => {
    const { callTool } = setup(null);
    const result = await callTool("vc_list_agents");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not initialized/i);
  });

  it("returns an unknown-tool error for an unrecognized tool name", async () => {
    const agent = new FakeAgent();
    const { callTool } = setup(agent);
    const result = await callTool("vc_does_not_exist");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Unknown tool: vc_does_not_exist");
  });

  it("vc_list_agents lists known peer grants with their capabilities", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant(), makeGrant({ targetDid: "did:vaultys:peer-2", targetName: "Peer Two" })];
    const { callTool } = setup(agent);
    const result = await callTool("vc_list_agents");
    expect(result.content[0].text).toContain("2 peer agent(s)");
    expect(result.content[0].text).toContain("Peer One");
    expect(result.content[0].text).toContain("Peer Two");
  });

  it("vc_list_agents explains there are no grants when the catalog is empty", async () => {
    const agent = new FakeAgent();
    const { callTool } = setup(agent);
    const result = await callTool("vc_list_agents");
    expect(result.content[0].text).toContain("No peer agents configured");
    expect(result.content[0].text).toContain(agent.did);
  });

  it("vc_run_intent rejects a DID with no peer grant without calling invokePeer", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    const { callTool } = setup(agent);
    const result = await callTool("vc_run_intent", { agent_did: "did:vaultys:unknown", action: "do_thing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No peer grant for agent DID/);
    expect(result.content[0].text).toContain("did:vaultys:peer-1 (Peer One)");
    expect(agent.invokePeer).not.toHaveBeenCalled();
  });

  it("vc_run_intent invokes the peer and returns its result for a known DID", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    const { callTool } = setup(agent);
    const result = await callTool("vc_run_intent", {
      agent_did: "did:vaultys:peer-1",
      action: "do_thing",
      params: { x: 1 },
    });
    expect(agent.invokePeer).toHaveBeenCalledWith("did:vaultys:peer-1", "do_thing", { x: 1 });
    expect(result.content[0].text).toBe("peer-result");
    expect(result.isError).toBeUndefined();
  });

  it("vc_run_intent times out if invokePeer never resolves in time", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    agent.invokePeer = vi.fn(() => new Promise(() => {}));
    const { callTool } = setup(agent);
    const result = await callTool("vc_run_intent", {
      agent_did: "did:vaultys:peer-1",
      action: "do_thing",
      timeout_ms: 1000,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Timeout after 1000ms/);
  });

  it("vc_chat rejects an unknown DID the same way as vc_run_intent", async () => {
    const agent = new FakeAgent();
    const { callTool } = setup(agent);
    const result = await callTool("vc_chat", { agent_did: "did:vaultys:unknown", message: "hi" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No peer grant for agent DID/);
  });

  it("vc_chat sends a text_generation intent and unwraps a {text} response", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    agent.invokePeer = vi.fn(async () => ({ text: "hello there" })) as any;
    const { callTool } = setup(agent);
    const result = await callTool("vc_chat", { agent_did: "did:vaultys:peer-1", message: "hi" });
    expect(agent.invokePeer).toHaveBeenCalledWith("did:vaultys:peer-1", "text_generation", { prompt: "hi" });
    expect(result.content[0].text).toBe("hello there");
  });

  it("waits for reconnection instead of failing immediately when not yet connected", async () => {
    const agent = new FakeAgent();
    agent.status = "connecting";
    agent.catalog = [makeGrant()];
    const { callTool } = setup(agent);

    const pending = callTool("vc_list_agents");
    // Give the handler a tick to register its status_changed listener, then flip.
    await new Promise((r) => setTimeout(r, 10));
    agent.setStatus("connected");

    const result = await pending;
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Peer One");
  });

  it("fails the call if the agent stays disconnected past the reconnect wait", async () => {
    vi.useFakeTimers();
    try {
      const agent = new FakeAgent();
      agent.status = "reconnecting";
      const { callTool } = setup(agent);
      const pending = callTool("vc_list_agents");
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/reconnecting — try again/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hints at admin approval when pending_approval", async () => {
    const agent = new FakeAgent();
    agent.status = "pending_approval";
    const { callTool, log } = setup(agent);
    const pending = callTool("vc_list_agents");
    // Resolve so the test doesn't hang on the 10s wait.
    agent.setStatus("connected");
    await pending;
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/waiting for admin approval/i));
  });

  it("vc_gateway_metrics starts empty and accumulates calls/errors/latency per tool", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    const { callTool } = setup(agent);

    let snapshot = JSON.parse((await callTool("vc_gateway_metrics")).content[0].text);
    expect(snapshot.tools).toEqual({});

    await callTool("vc_list_agents");
    await callTool("vc_run_intent", { agent_did: "did:vaultys:unknown", action: "x" }); // errors

    snapshot = JSON.parse((await callTool("vc_gateway_metrics")).content[0].text);
    expect(snapshot.tools.vc_list_agents.calls).toBe(1);
    expect(snapshot.tools.vc_list_agents.errors).toBe(0);
    expect(snapshot.tools.vc_run_intent.calls).toBe(1);
    expect(snapshot.tools.vc_run_intent.errors).toBe(1);
    expect(typeof snapshot.uptimeSeconds).toBe("number");
  });

  it("lists peer grants as vc://agents/{did} resources and reads one back", async () => {
    const agent = new FakeAgent();
    agent.catalog = [makeGrant()];
    const { listResources, readResource } = setup(agent);

    const { resources } = await listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe(`vc://agents/${encodeURIComponent("did:vaultys:peer-1")}`);
    expect(resources[0].name).toBe("Peer One");

    const read = await readResource(resources[0].uri);
    const body = JSON.parse(read.contents[0].text);
    expect(body).toEqual({
      did: "did:vaultys:peer-1",
      name: "Peer One",
      description: "Does peer things",
      capabilities: ["text_generation"],
    });
  });

  it("throws when reading a resource for a DID with no grant", async () => {
    const agent = new FakeAgent();
    const { readResource } = setup(agent);
    await expect(readResource(`vc://agents/${encodeURIComponent("did:vaultys:ghost")}`)).rejects.toThrow(
      /No peer grant/
    );
  });
});
