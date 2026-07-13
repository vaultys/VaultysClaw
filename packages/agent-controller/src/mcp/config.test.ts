import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { loadMcpServersConfig, isStdioMcpServerConfig } from "./config";

describe("loadMcpServersConfig", () => {
  let tmpFile: string | null = null;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    tmpFile = null;
  });

  it("returns an empty map when the file doesn't exist", () => {
    expect(loadMcpServersConfig(path.join(os.tmpdir(), "does-not-exist.json"))).toEqual({});
  });

  it("parses stdio and remote server configs", () => {
    tmpFile = path.join(os.tmpdir(), `mcp-servers-test-${Date.now()}.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        mcpServers: {
          fetch: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] },
          remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer x" } },
          malformed: { nothingUseful: true },
        },
      })
    );

    const servers = loadMcpServersConfig(tmpFile);
    expect(Object.keys(servers).sort()).toEqual(["fetch", "remote"]);
    expect(isStdioMcpServerConfig(servers.fetch)).toBe(true);
    expect(isStdioMcpServerConfig(servers.remote)).toBe(false);
    if (isStdioMcpServerConfig(servers.fetch)) {
      expect(servers.fetch.command).toBe("npx");
      expect(servers.fetch.args).toEqual(["-y", "@modelcontextprotocol/server-fetch"]);
    }
  });

  it("returns an empty map when mcpServers is missing or not an object", () => {
    tmpFile = path.join(os.tmpdir(), `mcp-servers-test-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ notMcpServers: true }));
    expect(loadMcpServersConfig(tmpFile)).toEqual({});
  });
});
