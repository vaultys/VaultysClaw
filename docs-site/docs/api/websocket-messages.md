---
sidebar_position: 11
title: WebSocket Message Reference
description: Quick reference for all WebSocket message types.
---

# WebSocket Message Reference

Quick reference table for all message types.

## Agent → Control Plane

| Type | When sent | Key fields |
|---|---|---|
| `register` | Immediately after WS connect | `name`, `publicKey`, `capabilities`, `llmConfig` |
| `result` | After executing an intent | `intentId`, `status`, `output` |
| `heartbeat` | Every 30 seconds | `uptime`, `memoryMb`, `connected` |
| `policy_ack` | After receiving a `policy_update` | `policyId`, `accepted` |
| `tool_approval_request` | When agent needs admin approval | `requestId`, `tool`, `context` |
| `chat_message` | Chat message to LLM | `sessionId`, `messages` |
| `chat_response` | Streaming LLM response | `sessionId`, `chunk`, `done` |
| `task_status` | Task queue status update | `taskId`, `status`, `progress` |

## Control Plane → Agent

| Type | When sent | Key fields |
|---|---|---|
| `register_ack` | After admin approval | `agentId`, `policy`, `controlPlanePublicKey`, `delegationCerts`, `peerGrants` |
| `intent` | To route work | `id`, `action`, `params`, `timestamp` |
| `policy_update` | Policy change | `capabilities`, `resourceLimits`, `version` |
| `delegation_update` | Grant change | `certificates`, `removed` |
| `agent_peer_catalog` | Peer grant changes | `grants`, `removed` |
| `tool_approval_response` | Admin decision | `requestId`, `approved`, `reason` |
| `llm_config` | LLM config update | `provider`, `model`, `maxTokens` |
| `task_enqueue` | Queue a task | `taskId`, `action`, `params` |
| `schedule_update` | Cron schedule change | `schedules` |
| `schedule_delete` | Remove a schedule | `scheduleId` |
| `pong` | Response to `heartbeat` | — |
