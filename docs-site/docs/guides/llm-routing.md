---
sidebar_position: 6
title: LLM Routing with LiteLLM
description: Route agents through a LiteLLM proxy for centralized model management, per-workspace access control, and cost tracking.
---

# LLM Routing with LiteLLM

VaultysClaw integrates with [LiteLLM Proxy](https://docs.litellm.ai/docs/proxy/quick_start) to provide **centralized LLM management**: register models once, assign them to workspaces, and let the control plane push the right configuration — including scoped virtual keys — to each agent automatically.

## Why use it

| Without LiteLLM                                | With LiteLLM                                               |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Each agent carries its own API key in env vars | Keys are stored in the control plane only                  |
| Changing providers requires redeploying agents | Swap models from the dashboard; agents pick it up live     |
| No per-workspace model access control              | Each workspace gets a virtual key scoped to its allowed models |
| No unified cost tracking                       | All usage flows through one proxy with budget limits       |

## How it works

```mermaid
graph LR
  A["Agent"] -- "openai-compatible\nwith virtual key" --> LiteLLM["LiteLLM Proxy"]
  LiteLLM -- "routes to" --> Ollama["Ollama / vLLM"]
  LiteLLM -- "routes to" --> OAI["OpenAI / Groq / ..."]
  CP["Control Plane"] -- "manages models\n& virtual keys" --> LiteLLM
  CP -- "pushes llm_config\nvia WebSocket" --> A
```

1. An admin registers a model in the **Model Registry** (once per model/provider).
2. The control plane calls `/model/new` on the LiteLLM proxy to register it.
3. When a model is **granted to a workspace**, the control plane calls `/key/generate` to create a workspace-scoped virtual key that can only access that workspace's models.
4. When an agent joins a workspace (or an admin sets "Workspace Routing" mode), the control plane pushes an `llm_config` WebSocket message containing the proxy URL and the workspace's virtual key.
5. The agent connects to LiteLLM as an OpenAI-compatible endpoint — it never sees the underlying API key.

## Prerequisites

- A running LiteLLM proxy reachable from the control plane.
- `LITELLM_BASE_URL` and `LITELLM_MASTER_KEY` set in the control plane environment.

```env
LITELLM_BASE_URL=http://litellm:4000
LITELLM_MASTER_KEY=sk-my-master-key
```

If these variables are not set, the model registry and workspace routing features remain available but LiteLLM sync calls are skipped (non-fatal).

### Quick LiteLLM setup

```bash
pip install litellm
litellm --port 4000 --master_key sk-my-master-key
```

Or with Docker:

```yaml
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    command: >
      --master_key sk-my-master-key
      --port 4000
```

## Registering a model

### Via the dashboard

1. Navigate to **Models** in the sidebar.
2. Click **Register model**.
3. Fill in: name, provider, model ID, and base URL (for self-hosted models).
4. Save — the model appears in LiteLLM immediately.

### Via the API

```bash
curl -X POST https://vaultysclaw.acme.com/api/admin/models \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Llama 3 (local)",
    "provider": "openai-compatible",
    "modelId": "llama3-8b",
    "baseUrl": "http://ollama:11434/v1"
  }'
```

See [Models API](/docs/api/models) for the full reference.

## Granting a model to a workspace

```bash
curl -X POST https://vaultysclaw.acme.com/api/workspaces/{workspaceId}/models \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{ "modelId": "model-uuid" }'
```

Requires **workspace admin** rights on the target workspace. This:

1. Creates (or refreshes) a LiteLLM virtual key for the workspace, scoped to the newly allowed model list.
2. Pushes updated `llm_config` to every agent currently in that workspace.

## Setting an agent to workspace routing mode

### Via the dashboard

1. Open the agent detail page → **Config** tab.
2. Select **Workspace Routing** mode.
3. Choose the workspace and model from the dropdowns.
4. Click **Save** — the config is stored and pushed live if the agent is online.

The config view shows a violet **Workspace Routing** banner when this mode is active, confirming the agent uses the LiteLLM proxy.

### Via the API

```bash
# Shortcut: resolve virtual key server-side — the API key never touches the client
curl -X PUT https://vaultysclaw.acme.com/api/agents/{did}/llm-config \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-uuid",
    "workspaceModelId": "model-registry-id"
  }'
```

The control plane looks up the workspace's virtual key and the model's LiteLLM name, assembles an `openai-compatible` config, stores it, and pushes it to the agent — the raw API key is never exposed.

## Automatic config push on workspace join

When an agent is added to a workspace that already has a virtual key and active models, the control plane immediately pushes an `llm_config` message to the agent (if connected), so no manual configuration step is needed.

## Per-workspace budget limits

Set a monthly budget cap on the workspace's LiteLLM virtual key:

```bash
curl -X PUT .../api/workspaces/{workspaceId}/litellm-key \
  -d '{ "monthlyBudget": 50.0 }'
```

This passes `max_budget` to LiteLLM when generating the virtual key.

## Checking connectivity

```bash
curl https://vaultysclaw.acme.com/api/agents/{did}/workspace-llm \
  -H "Cookie: ..."
```

Response:

```json
{
  "litellmConfigured": true,
  "litellmBaseUrl": "http://litellm:4000",
  "workspaces": [
    {
      "workspaceId": "...",
      "workspaceName": "Engineering",
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

`hasVirtualKey: false` means the workspace has models registered but the virtual key hasn't been created yet (grant a model to trigger key generation).
