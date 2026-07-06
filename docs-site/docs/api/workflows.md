---
sidebar_position: 8
title: Workflows
description: Create, manage, and run multi-step agent workflows.
---

# Workflows API

See [Workflows guide](/docs/guides/workflows) for a conceptual overview. This page covers the REST API endpoints.

## List workflows

```http
GET /api/workflows
```

**Auth:** Required. Workspace members see their workspace's workflows; global admins see all.

### Query parameters

| Parameter   | Type   | Description           |
| ----------- | ------ | --------------------- |
| `workspaceId`   | string | Filter by workspace       |
| `createdBy` | string | Filter by creator DID |

### Response

```json
{
  "success": true,
  "workflows": [
    {
      "id": "wf_01HZ...",
      "name": "Daily Research Digest",
      "description": "Scrapes papers and emails a summary",
      "workspaceId": "workspace_research",
      "createdBy": "did:vaultys:z6MkAlice...",
      "createdAt": "2026-03-01T10:00:00Z",
      "updatedAt": "2026-05-10T14:00:00Z",
      "stepCount": 3
    }
  ]
}
```

## Get a workflow

```http
GET /api/workflows/:id
```

**Auth:** Required.

Returns the full workflow definition including all steps.

```json
{
  "workflow": {
    "id": "wf_01HZ...",
    "name": "Daily Research Digest",
    "definition": {
      "variables": { "topic": "large language models" },
      "steps": [
        {
          "id": "scrape",
          "name": "Scrape recent papers",
          "agentDid": "did:vaultys:z6MkResearcher...",
          "action": "search_arxiv",
          "params": { "query": "{{variables.topic}}", "maxResults": 10 }
        }
      ]
    }
  }
}
```

## Create a workflow

```http
POST /api/workflows
```

**Auth:** Workspace admin or global admin.

### Request body

```json
{
  "name": "Daily Research Digest",
  "description": "Scrapes research papers and emails a summary",
  "workspaceId": "workspace_research",
  "definition": {
    "variables": {
      "topic": "large language models",
      "recipients": ["team@acme.com"]
    },
    "steps": [
      {
        "id": "scrape",
        "name": "Scrape papers",
        "agentDid": "did:vaultys:z6MkResearcher...",
        "action": "search_arxiv",
        "params": { "query": "{{variables.topic}}", "maxResults": 10 },
        "onError": "stop"
      },
      {
        "id": "summarise",
        "name": "Summarise",
        "agentDid": "did:vaultys:z6MkResearcher...",
        "action": "summarise_documents",
        "params": {
          "documents": "{{steps.scrape.output}}",
          "format": "executive_summary"
        },
        "dependsOn": ["scrape"]
      },
      {
        "id": "email",
        "name": "Email digest",
        "agentDid": "did:vaultys:z6MkMailer...",
        "action": "send_email",
        "params": {
          "to": "{{variables.recipients}}",
          "subject": "Research Digest: {{variables.topic}}",
          "body": "{{steps.summarise.output}}"
        },
        "dependsOn": ["summarise"]
      }
    ]
  }
}
```

### Response `201 Created`

```json
{
  "success": true,
  "id": "wf_01HZABC...",
  "name": "Daily Research Digest",
  "workspaceId": "workspace_research"
}
```

## Run a workflow

```http
POST /api/workflows/:id/run
```

**Auth:** Workspace operator or higher.

Returns `202 Accepted`. The workflow executes asynchronously.

### Request body

```json
{
  "params": {
    "topic": "retrieval-augmented generation"
  }
}
```

Run-time `params` override the workflow's default `variables`.

### Response `202 Accepted`

```json
{
  "runId": "run_01HZABC...",
  "status": "running"
}
```

## Get run status

```http
GET /api/workflows/:id/runs/:runId
```

**Auth:** Required.

```json
{
  "runId": "run_01HZABC...",
  "status": "completed",
  "startedAt": "2026-05-15T09:00:00Z",
  "completedAt": "2026-05-15T09:02:34Z",
  "steps": {
    "scrape":    { "status": "completed", "durationMs": 8420,  "output": {...} },
    "summarise": { "status": "completed", "durationMs": 12300, "output": "..." },
    "email":     { "status": "completed", "durationMs": 340,   "output": null }
  }
}
```

Possible `status` values: `running`, `completed`, `failed`, `cancelled`.
