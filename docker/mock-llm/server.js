/**
 * Mock OpenAI-compatible LLM server for integration testing.
 *
 * Endpoints:
 *   POST /v1/chat/completions  — returns a canned response (OpenAI format)
 *                                 supports both non-streaming and streaming (SSE)
 *   GET  /test/calls           — returns the list of all requests received (for assertions)
 *   DELETE /test/calls         — clears the call log
 *   GET  /health               — liveness probe
 */

const http = require("http");

const PORT = process.env.PORT || 11435;

/** In-memory log of every chat-completion request received. */
const calls = [];

const server = http.createServer((req, res) => {
  if (
    req.method === "POST" &&
    (req.url === "/v1/chat/completions" || req.url === "/v1/responses")
  ) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      const isChatCompletions = req.url === "/v1/chat/completions";

      // Extract action name from the last user message
      let lastContent = "";
      if (isChatCompletions) {
        lastContent = parsed.messages?.at(-1)?.content ?? "";
      } else {
        // Responses API — input array
        const lastInput = parsed.input?.at(-1);
        if (Array.isArray(lastInput?.content)) {
          lastContent =
            lastInput.content.find((c) => c.type === "input_text")?.text ?? "";
        } else {
          lastContent = lastInput?.content ?? "";
        }
      }

      let actionName = "unknown";
      try {
        actionName = JSON.parse(lastContent).action ?? "unknown";
      } catch {
        // content is plain text
      }

      calls.push({
        timestamp: Date.now(),
        model: parsed.model,
        messages: isChatCompletions ? parsed.messages : parsed.input,
        maxTokens: parsed.max_tokens ?? parsed.max_output_tokens,
      });

      const responseText = `Mock LLM response for action: ${actionName}`;

      // ── Streaming mode (SSE) ──
      if (isChatCompletions && parsed.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // Split response into word-level chunks for realistic streaming
        const words = responseText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = (i === 0 ? "" : " ") + words[i];
          const sseData = {
            id: `chatcmpl-mock-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: parsed.model || "mock-model",
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }

        // Final chunk with finish_reason
        const finalChunk = {
          id: `chatcmpl-mock-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: parsed.model || "mock-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      // ── Non-streaming mode ──
      let response;
      if (isChatCompletions) {
        response = {
          id: `chatcmpl-mock-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: parsed.model || "mock-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: responseText },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
        };
      } else {
        // OpenAI Responses API format (used by @ai-sdk/openai v3+)
        response = {
          id: `resp-mock-${Date.now()}`,
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          model: parsed.model || "mock-model",
          status: "completed",
          output: [
            {
              type: "message",
              id: `msg-mock-${Date.now()}`,
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: responseText,
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 12, total_tokens: 22 },
        };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
    return;
  }

  if (req.method === "GET" && req.url === "/test/calls") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(calls));
    return;
  }

  if (req.method === "DELETE" && req.url === "/test/calls") {
    calls.length = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", calls: calls.length }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`Mock LLM server listening on :${PORT}`);
});
