---
sidebar_position: 9
title: Models
description: REST API for the model registry — register LLMs, manage realm access, and sync with LiteLLM.
---

# Models API

The Models API manages the **model registry** — the set of LLMs that Vaultys Claw knows about and can route agent traffic through. All endpoints require admin authentication.

## Data model

```typescript
interface ModelRegistryEntry {
  id: string;                        // UUID
  name: string;                      // Human-readable label
  description?: string;
  provider: string;                  // e.g. "openai-compatible", "openai", "anthropic"
  modelId: string;                   // Backend model identifier passed to the provider
  baseUrl?: string;                  // Required for self-hosted / openai-compatible
  status: "active" | "inactive";
  litellmModelName?: string;         // Auto-generated: "{provider}/{slug}"
  createdAt: string;                 // ISO 8601
}
```

---

## List models

```http
GET /api/models
```

Returns all model registry entries.

**Response `200`**

```json
{
  "models": [
    {
      "id": "a1b2c3d4-...",
      "name": "Llama 3 (local)",
      "provider": "openai-compatible",
      "modelId": "llama3-8b",
      "baseUrl": "http://ollama:11434/v1",
      "status": "active",
      "litellmModelName": "openai-compatible/llama-3-local"
    }
  ]
}
```

---

## Create a model

```http
POST /api/models
```

Registers a new model. If LiteLLM is configured (`LITELLM_BASE_URL` + `LITELLM_MASTER_KEY`), the model is also registered with the proxy.

**Request body**

```json
{
  "name": "Llama 3 (local)",
  "provider": "openai-compatible",
  "modelId": "llama3-8b",
  "baseUrl": "http://ollama:11434/v1",
  "description": "Local Ollama instance"
}
```

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Display name. Used to generate `litellmModelName`. |
| `provider` | Yes | Provider type. Use `openai-compatible` for Ollama, vLLM, Groq, LM Studio, etc. |
| `modelId` | Yes | Model identifier as the backend provider expects it. |
| `baseUrl` | Yes (for `openai-compatible`) | HTTP base URL of the model endpoint. Include `/v1` if required by the backend. |
| `description` | No | Free-text description. |

**Response `201`**

```json
{
  "model": {
    "id": "a1b2c3d4-...",
    "name": "Llama 3 (local)"
  }
}
```

---

## Get a model

```http
GET /api/models/:id
```

**Response `200`**

Full `ModelRegistryEntry` object.

---

## Update a model

```http
PUT /api/models/:id
```

Update name, description, or status. `provider`, `modelId`, and `baseUrl` changes are reflected in the registry but are **not** automatically synced to LiteLLM — delete and re-register if the backend config changes.

**Request body** (all fields optional)

```json
{
  "name": "Llama 3.1 (local)",
  "description": "Upgraded to 3.1",
  "status": "inactive"
}
```

**Response `200`**

```json
{ "ok": true }
```

---

## Delete a model

```http
DELETE /api/models/:id
```

Removes the model from the registry and, if LiteLLM is configured, deregisters it from the proxy. Realm access grants for this model are also removed.

**Response `200`**

```json
{ "ok": true }
```

---

## Grant realm access

```http
POST /api/models/:id/realms
```

Allows agents in the specified realm to use this model. If LiteLLM is configured:

1. The model is added to the realm's allowed model list.
2. A new realm virtual key is generated (or refreshed) scoped to the updated list.
3. `llm_config` is pushed via WebSocket to all agents currently in that realm.

**Request body**

```json
{
  "realmId": "realm-uuid",
  "monthlyBudgetUsd": 50.0
}
```

| Field | Required | Description |
|---|---|---|
| `realmId` | Yes | UUID of the realm. |
| `monthlyBudgetUsd` | No | LiteLLM monthly budget cap for this realm's virtual key. |

**Response `200`**

```json
{ "ok": true }
```

---

## Revoke realm access

```http
DELETE /api/models/:id/realms/:realmId
```

Removes the model from the realm's allowed list and refreshes the virtual key.

**Response `200`**

```json
{ "ok": true }
```

---

## Agent LLM config endpoints

### Get stored config

```http
GET /api/agents/:did/llm-config
```

Returns the stored LLM config for an agent. The `apiKey` field is always masked (`apiKeySet: true/false`).

```json
{
  "config": {
    "provider": "openai-compatible",
    "baseUrl": "http://litellm:4000",
    "model": "openai-compatible/llama-3-local",
    "apiKeySet": true
  }
}
```

### Set config

```http
PUT /api/agents/:did/llm-config
```

Three modes:

**Realm routing** — control plane resolves virtual key server-side:

```json
{
  "realmId": "realm-uuid",
  "realmModelId": "model-registry-id"
}
```

**Registry model shortcut** — resolves stored API key server-side:

```json
{
  "registryModelId": "model-registry-id"
}
```

**Manual config** — provide all fields directly:

```json
{
  "provider": "ollama",
  "model": "llama3.2",
  "baseUrl": "http://localhost:11434"
}
```

All three return:

```json
{
  "ok": true,
  "pushed": true,
  "config": { "provider": "...", "model": "...", "apiKeySet": false }
}
```

`pushed: true` means the agent was online and received the config immediately via WebSocket.

### Clear config

```http
DELETE /api/agents/:did/llm-config
```

Removes the stored config. The agent falls back to its environment variables.

### Realm LLM options

```http
GET /api/agents/:did/realm-llm
```

Returns the realm membership and available model options for the realm routing UI.

```json
{
  "litellmConfigured": true,
  "litellmBaseUrl": "http://litellm:4000",
  "realms": [
    {
      "realmId": "...",
      "realmName": "Engineering",
      "isPrimary": true,
      "hasVirtualKey": true,
      "models": [
        {
          "id": "...",
          "name": "Llama 3 (local)",
          "provider": "openai-compatible",
          "modelId": "llama3-8b",
          "litellmModelName": "openai-compatible/llama-3-local"
        }
      ]
    }
  ]
}
```
