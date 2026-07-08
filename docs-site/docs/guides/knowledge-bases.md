---
sidebar_position: 7
title: Knowledge Bases
description: Index documents and URLs into a local vector store so agents can answer questions about private content using RAG.
---

# Knowledge Bases

Knowledge bases let an agent answer questions about **your private content** — PDFs, internal docs, websites, or any text — without sending that content to a model during every conversation. Documents are chunked and embedded once; the agent retrieves only the relevant passages at query time.

---

## How it works

```
Admin adds source
  ↓ Control plane triggers knowledge_sync → agent
  ↓ Agent fetches / reads content
  ↓ (Optional) Docling converts PDF/DOCX → Markdown
  ↓ Content is split into overlapping chunks
  ↓ Each chunk is embedded with the configured embedding model
  ↓ Vectors are stored in the agent's local SQLite DB
  ↓ Agent confirms status → control plane updates to "ready"
        ↓
User sends a chat message
  ↓ Agent calls knowledge_search(query)
  ↓ Query is embedded; nearest chunks are retrieved by cosine similarity
  ↓ Top passages injected into the LLM context
  → LLM answers with citations from your documents
```

Nothing in the knowledge base leaves the agent host unless you configure a cloud embedding provider (see [Embedding models](#embedding-models)).

---

## Prerequisites

| Requirement                           | Where to configure                                                |
| ------------------------------------- | ----------------------------------------------------------------- |
| Agent online and LLM configured       | Agent detail page → Config tab                                    |
| Embedding model available             | Same LLM config — see [Embedding models](#embedding-models) below |
| `knowledge_search` capability granted | Agent detail page → Knowledge tab (shortcut) or Governance tab    |
| _(Optional)_ Docling for PDF/DOCX     | Settings → Integrations → Docling                                 |

---

## Source types

### URL

The agent fetches the page, strips HTML, and indexes the text. Works for documentation sites, blog posts, and any publicly accessible web page.

### Inline text

Paste Markdown, plain text, or any structured content directly in the UI. Useful for internal policies, FAQs, or content that is not publicly hosted.

### File upload

Upload one or more files from your browser. Supported natively (plain text, Markdown, JSON, CSV). If **Docling** is configured, PDF and DOCX files are converted to Markdown before chunking.

---

## Adding a source

1. Open the agent detail page → **Knowledge** tab
2. Click **Add source**
3. Choose the source type (URL / Text / File)
4. Fill in the name (auto-filled from the filename for uploads) and content
5. Click **Save** — the source appears in state `idle`
6. Click **Sync** to start indexing

The agent processes the source in the background. The status badge cycles through:

| Status    | Meaning                                                               |
| --------- | --------------------------------------------------------------------- |
| `idle`    | Saved but not yet synced                                              |
| `syncing` | Agent is actively fetching, chunking, and embedding                   |
| `ready`   | Indexed and searchable                                                |
| `error`   | Sync failed — hover the badge or expand the row for the error message |

If the agent is **offline** when you click Sync, the request is queued and executed on the next connection.

---

## The `knowledge_search` capability

Unlike built-in tools (`file_access`, `internet_access`, …), accessing the knowledge base requires the `knowledge_search` capability to be explicitly granted in the agent's active policy. This is intentional:

- It gives admins visibility that this agent is querying private indexed content
- It enables the same governance controls (resource limits, expiry) as all other capabilities
- It appears in the certificate audit trail

### Warning banner

The **Knowledge** tab automatically detects the mismatch: if at least one source is in `ready` state but `knowledge_search` is not in the active policy, a warning banner appears:

> **Knowledge sources are ready but the agent cannot use them**
> The `knowledge_search` capability is not granted in this agent's active policy…

The banner includes a **Grant capability** button that:

1. Fetches the agent's current active policies
2. Deletes the most recent one (preserving its resource limits)
3. Creates a new policy with all the same capabilities **plus** `knowledge_search`
4. Triggers an immediate certificate reissue for connected agents

The banner disappears once the parent page receives the `capabilities_updated` event.

### Manual grant via Governance tab

You can also grant the capability from the **Governance** tab (agent detail page) or the global **Governance** dashboard:

1. Click **New Policy**
2. Toggle **Knowledge Search** on (alongside your other capabilities)
3. Set optional resource limits and expiry
4. Click **Apply Policy**

---

## Embedding models

The agent uses your configured LLM provider for embeddings.

### Ollama (local, recommended for private data)

When the `baseUrl` in the LLM config points to a local Ollama instance (e.g. `http://localhost:11434`), the agent automatically routes embedding calls to the Ollama native API (`/api/embeddings`) using the `nomic-embed-text` model.

```env
# Agent LLM config (set via control plane or env)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2
```

No data leaves your machine.

### OpenAI / compatible

When using an OpenAI-compatible provider, the agent calls `/v1/embeddings` with `text-embedding-3-small` (or the model specified in `embeddingModel` on the LLM config).

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "embeddingModel": "text-embedding-3-small"
}
```

:::caution Data privacy
With a cloud embedding provider, every chunk of every indexed document is sent to the embedding API. Use a local Ollama embedding model for sensitive internal documents.
:::

---

## File storage

By default, uploaded knowledge files are stored in `data/knowledge-files/` on the control plane host. For multi-instance deployments or to keep your data directory small, you can switch to S3-compatible object storage.

### Filesystem (default)

No configuration required. Files are written to:

```
<data-dir>/knowledge-files/sources/<sourceId>/<fileId>_<filename>
```

Metadata and file paths are stored in the SQLite database; the binary content lives on disk.

### S3 / MinIO

1. Go to **Settings → Integrations → File Storage**
2. Toggle **Use S3 storage** on
3. Fill in the fields:

| Field             | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| Region            | AWS region, e.g. `us-east-1`. For MinIO, any non-empty value works. |
| Bucket            | The bucket that must already exist                                  |
| Endpoint          | Leave blank for AWS. For MinIO: `http://minio:9000`                 |
| Access Key ID     | IAM access key or MinIO user                                        |
| Secret Access Key | Leave blank to keep the previously saved key                        |

4. Click **Test connection** — the control plane sends a `HeadBucket` request and reports latency or a specific error (wrong credentials vs. bucket not found vs. access denied)
5. Click **Save** to persist the configuration (encrypted with the server's VaultysId)

The storage backend switches immediately without a server restart.

### MinIO (self-hosted S3)

MinIO is the recommended option for on-premise deployments. Add it to your `docker-compose.yml`:

```yaml
minio:
  image: minio/minio:latest
  ports:
    - "9000:9000"
    - "9001:9001" # console UI
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  command: minio server /data --console-address :9001
  volumes:
    - minio_data:/data

volumes:
  minio_data:
```

Create the bucket before saving the config:

```bash
# Using the mc CLI
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/vaultysclaw-knowledge
```

### Migrating existing files

If you have knowledge files that were indexed before this feature (stored as BLOBs in SQLite), you can move them to the current storage backend without re-syncing:

1. Configure and save your storage destination (filesystem or S3)
2. In **Settings → Integrations → File Storage**, click **Migrate legacy files**
3. The control plane moves files in batches of 100 — click again if there are more

The migration copies each BLOB to the storage backend, writes the file path back to the database, and clears the BLOB column. It is safe to run multiple times; files with a path already set are skipped.

---

## Docling integration (PDF / DOCX)

Docling Serve is an open-source document conversion service that converts PDF, DOCX, HTML, and other formats into clean Markdown before chunking.

### Setting up Docling

1. Run Docling Serve locally or on your network:
   ```bash
   docker run -p 5001:5001 ds4sd/docling-serve
   ```
2. In the control plane: **Settings → Integrations → Docling**
3. Enter the Docling URL and click **Test connection**

On a successful test, the control plane fetches `/openapi.json` from the Docling server and stores the discovered API endpoints alongside the URL. This makes the integration compatible with both the stable `/v1/` API and the legacy `/v1alpha/` API.

The **Knowledge** tab shows a **Docling on** / **Docling off** badge next to the section header when the agent has file sources, so you can see at a glance whether PDF conversion is available.

---

## Syncing and reconnect reconciliation

The sync flow is resilient to agent restarts and server restarts:

- The control plane tracks each source's status in its own SQLite database
- The agent tracks status in its own local database
- On every WebSocket reconnect, the agent sends a `knowledge_status_sync` message with the current status of all its sources
- The control plane reconciles: any source it still shows as `syncing` is updated to match the agent's actual status (`ready` or `error`)

This means a source will never be stuck in `syncing` indefinitely, even if the sync result message was lost during a restart.

---

## Deleting a source

Click the **Delete** button on any source card. If the source is currently syncing, you will be warned:

> "Source name" is currently syncing. Delete it anyway? The in-progress sync will be abandoned.

Deleting removes all stored chunks and vectors for that source from the agent's local database. The agent's knowledge base is updated immediately.

---

## API quick reference

### Knowledge sources

| Method   | Path                             | Auth         | Description                                                             |
| -------- | -------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `GET`    | `/api/knowledge`                 | Member       | List knowledge sources (filter by `agentDid`); scoped to accessible workspaces |
| `GET`    | `/api/knowledge/{id}`            | Member       | Get a single source with metadata                                       |
| `POST`   | `/api/admin/knowledge`           | Global admin | Create a new knowledge source                                           |
| `DELETE` | `/api/admin/knowledge/{id}`      | Global admin | Delete a source and its indexed chunks                                  |
| `POST`   | `/api/admin/knowledge/{id}/sync` | Global admin | Trigger a sync (dispatches `knowledge_sync` to the agent via WebSocket) |

The sync endpoint dispatches a WebSocket `knowledge_sync` message to the agent and returns immediately; poll the source's `status` field to track progress.

### File storage configuration

| Method | Path                            | Auth         | Description                                                                                |
| ------ | ------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `GET`  | `/api/settings/storage`         | Global Admin | Get current storage config (type, S3 fields — secret never returned)                       |
| `PUT`  | `/api/settings/storage`         | Global Admin | Update storage config; omit `secretAccessKey` to keep the existing one                     |
| `POST` | `/api/settings/storage/test`    | Global Admin | Test S3 connectivity via `HeadBucket`; returns `{ ok, latency }` or `{ ok: false, error }` |
| `POST` | `/api/settings/storage/migrate` | Global Admin | Migrate one batch (up to 100) of legacy BLOB files to the current storage backend          |
