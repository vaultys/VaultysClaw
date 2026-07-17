import { describe, it, expect } from "vitest";
import {
  parseOpenAiModels,
  parseOllamaModels,
  LOCAL_SERVERS,
} from "../packages/control-plane/components/models/local-discovery";

describe("parseOpenAiModels (/v1/models — LM Studio, vLLM)", () => {
  it("extracts ids from data[]", () => {
    const json = {
      object: "list",
      data: [
        { id: "qwen2.5-7b-instruct", object: "model" },
        { id: "llama-3.1-8b", object: "model" },
      ],
    };
    expect(parseOpenAiModels(json)).toEqual([
      "qwen2.5-7b-instruct",
      "llama-3.1-8b",
    ]);
  });

  it("drops entries without a string id and handles missing/invalid data", () => {
    expect(parseOpenAiModels({ data: [{ id: 42 }, {}, { id: "ok" }] })).toEqual([
      "ok",
    ]);
    expect(parseOpenAiModels({})).toEqual([]);
    expect(parseOpenAiModels(null)).toEqual([]);
    expect(parseOpenAiModels({ data: "nope" })).toEqual([]);
  });
});

describe("parseOllamaModels (/api/tags — Ollama)", () => {
  it("extracts names from models[]", () => {
    const json = {
      models: [
        { name: "llama3.2:latest", size: 123 },
        { name: "mistral:7b", size: 456 },
      ],
    };
    expect(parseOllamaModels(json)).toEqual([
      "llama3.2:latest",
      "mistral:7b",
    ]);
  });

  it("drops entries without a string name and handles missing/invalid models", () => {
    expect(
      parseOllamaModels({ models: [{ name: "" }, {}, { name: "ok" }] })
    ).toEqual(["ok"]);
    expect(parseOllamaModels({})).toEqual([]);
    expect(parseOllamaModels(undefined)).toEqual([]);
  });
});

describe("LOCAL_SERVERS", () => {
  it("targets the known local ports with the right probe kind", () => {
    const byId = Object.fromEntries(LOCAL_SERVERS.map((s) => [s.id, s]));
    expect(byId.lmstudio.baseUrl).toBe("http://localhost:1234");
    expect(byId.lmstudio.kind).toBe("openai");
    expect(byId.ollama.baseUrl).toBe("http://localhost:11434");
    expect(byId.ollama.kind).toBe("ollama");
    expect(byId.vllm.baseUrl).toBe("http://localhost:8000");
    expect(byId.vllm.kind).toBe("openai");
  });
});
