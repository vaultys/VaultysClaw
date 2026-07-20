/**
 * Regression test for the stdout guard's JSON-RPC detector.
 *
 * Bug: the original guard used a substring check (`includes('"jsonrpc"')`
 * && `includes('"2.0"')`) instead of parsing, so a stray log line that merely
 * mentions those substrings (e.g. while describing a received message) would
 * be forwarded to stdout and corrupt the MCP protocol stream. Fixed to
 * actually parse the chunk and check the envelope shape.
 */
import { describe, it, expect } from "vitest";
import { isJsonRpcMessage } from "../packages/mcp-gateway/src/jsonrpc-guard";

describe("isJsonRpcMessage", () => {
  it("accepts a real JSON-RPC 2.0 request", () => {
    expect(isJsonRpcMessage('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n')).toBe(true);
  });

  it("accepts a JSON-RPC 2.0 response", () => {
    expect(isJsonRpcMessage('{"jsonrpc":"2.0","id":1,"result":{}}')).toBe(true);
  });

  it("accepts a batched array containing an envelope", () => {
    expect(isJsonRpcMessage('[{"jsonrpc":"2.0","id":1,"method":"ping"}]')).toBe(true);
  });

  it("rejects a log line that merely mentions jsonrpc/2.0 as text", () => {
    const logLine = 'Received message: {"jsonrpc":"2.0","id":1,"method":"ping"} from peer\n';
    expect(isJsonRpcMessage(logLine)).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isJsonRpcMessage("Starting VaultysClaw MCP Gateway...\n")).toBe(false);
  });

  it("rejects malformed/partial JSON without throwing", () => {
    expect(isJsonRpcMessage('{"jsonrpc":"2.0","id":1,"method":')).toBe(false);
  });

  it("rejects a JSON object missing the jsonrpc field", () => {
    expect(isJsonRpcMessage('{"id":1,"method":"ping"}')).toBe(false);
  });

  it("rejects jsonrpc version 1.0", () => {
    expect(isJsonRpcMessage('{"jsonrpc":"1.0","id":1,"method":"ping"}')).toBe(false);
  });
});
