import type { LlmConfig } from '@vaultysclaw/shared';

/**
 * Generate an embedding vector for a piece of text.
 * Supports Ollama (local) and OpenAI / OpenAI-compatible endpoints.
 * Returns a Float32Array.
 */
/** Returns true when a base URL points at a local Ollama instance */
function isOllamaUrl(url: string): boolean {
  return /localhost:11434|127\.0\.0\.1:11434|::1:11434/.test(url);
}

export async function embed(text: string, config: LlmConfig): Promise<Float32Array> {
  const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 8192);

  // openai-compatible pointing at Ollama → use the native Ollama path
  const effectiveProvider =
    config.provider === 'openai-compatible' && isOllamaUrl(config.baseUrl ?? '')
      ? 'ollama'
      : config.provider;

  switch (effectiveProvider) {
    case 'ollama': {
      const base = (config.baseUrl ?? 'http://localhost:11434')
        .replace(/\/api\/?$/, '')   // strip /api if present
        .replace(/\/v1\/?$/, '');   // strip /v1 if present (openai-compat suffix)
      const model = config.embeddingModel ?? 'nomic-embed-text';
      const res = await fetch(`${base}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: cleanText }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama embeddings error (${base}/api/embeddings): HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }
      const data = await res.json() as { embedding: number[] };
      return new Float32Array(data.embedding);
    }

    case 'openai':
    case 'openai-compatible': {
      // Normalise base URL: strip trailing slash + any /v1, then re-append /v1
      const rawBase = config.provider === 'openai-compatible'
        ? (config.baseUrl ?? 'https://api.openai.com/v1')
        : 'https://api.openai.com/v1';
      const base = rawBase.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';
      const model = config.embeddingModel ?? 'text-embedding-3-small';
      const url = `${base}/embeddings`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey ?? ''}`,
        },
        body: JSON.stringify({ model, input: cleanText }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Embedding request to ${url} failed with HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}. ` +
          `Model: "${model}". Set embeddingModel in the LLM config or switch to Ollama for local embeddings.`,
        );
      }
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return new Float32Array(data.data[0].embedding);
    }

    default:
      throw new Error(`Embedding not supported for provider "${config.provider}". Use ollama or openai.`);
  }
}

/** Serialize a Float32Array to a Buffer for SQLite BLOB storage */
export function serializeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer);
}

/** Deserialize a Buffer (from SQLite BLOB) back to Float32Array */
export function deserializeEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Cosine similarity between two Float32Arrays. Returns -1..1 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
