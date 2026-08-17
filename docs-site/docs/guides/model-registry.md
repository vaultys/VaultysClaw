---
sidebar_position: 8
title: Model registry
description: Catalogue the LLM endpoints your organisation sanctions, and record which workspaces may use each — with an honest account of what is and is not enforced.
---

# Model registry

The organisation's catalogue of LLM endpoints, under **Integrations → Models**.

Postgres is the source of truth. LiteLLM is **pushed to, never read back** — so an
unconfigured or unreachable proxy degrades the registry to inert catalogue data
rather than breaking it.

:::danger Recorded, not enforced
The registry records which workspaces may use which model and audits every change.
**Nothing enforces that at inference time.**

Enforcement needs a minted per-workspace virtual key whose model allow-list is the
actual gate, plus an LLM-config push down to Actors. Neither exists yet. A grant
here is an authorisation record the console shows and audits — not a runtime
guarantee. The workspace-access UI states this directly rather than implying
otherwise, and so does the [matrix](/docs/zero-trust/matrix#12-ai-governance).
:::

## Registering a model

1. **Provider** — determines the wire format and the derived proxy model name.
   **Fixed after creation**, because changing it in place would orphan the
   upstream registration.
2. **Model ID and endpoint** — provider defaults are pre-filled.
3. **API key** — encrypted at rest with the same vault primitive used everywhere
   else.
4. **Test connection** — probes the provider directly. This runs **server-side**,
   because the endpoint is often on a private network the admin's browser cannot
   reach, and because the key must never leave the server.

The proxy model name is derived from provider and name, and re-derived if the name
changes.

## LiteLLM configuration

Base URL and master key live as settings an admin edits in the console, with
deployment environment variables as the fallback. **The database wins.**

Both halves must resolve or the integration reports "not configured" — a base URL
with no master key cannot authenticate against the proxy's admin API, and the
panel says exactly that rather than looking configured while silently pushing
nothing.

The panel is three-state: **connected**, **unreachable**, or **not configured**,
plus a "re-push all models" action to catch up anything registered while the proxy
was off.

:::note Why configuration is read per request
The older implementation cached proxy configuration in module-level globals seeded
by a startup call. That is wrong under Next.js, where a Server Action and a page
render can run in different workers — so a configuration change was visible only
to whichever worker ran the startup call.

Here every call reads the settings, so an edit takes effect on the next request
everywhere.
:::

## Secret handling

The encrypted key is omitted at the **query level** — a database `select` that
never fetches the column, not a delete after the fact — on every read path a page
or action uses. Those paths expose only a `hasApiKey` boolean.

The one path that needs the ciphertext has to ask for it by name, so handling a
secret is greppable and obvious in a diff.

A bug fixed rather than ported: the older implementation passed the *encrypted*
key to the proxy on update, registering a model that could never authenticate
upstream. Here the sync function takes an explicitly named plaintext parameter,
and the update path decrypts before re-pushing — so editing an endpoint does not
silently drop the credential either.

## Workspace access

From a model's detail page, toggle which workspaces may use it. Each change emits
`model.updated` with an explicit diff:

```json
{ "changes": [{ "field": "workspaceAccess", "from": [], "to": ["default"] }] }
```

Granting access emits `model.updated` rather than a new event type, because
inventing one would mean emitting an event the shared catalog does not define.

## Agent-SDK providers

Catalogued but never pushed to the proxy — they run a vendor harness rather than
an HTTP endpoint. They appear in the registry so the organisation's model
inventory is complete, which is the governance value even without a routing path.

## A naming detail with a real cause

The webhook payload reports `hasProviderKey`, not `hasApiKey`. The recursive
secret-stripping filter matches the substring `apikey` case-insensitively, so a
field named `hasApiKey` — a boolean carrying no secret at all — would be silently
deleted from every delivered payload.

Renaming the field was cheaper and far more visible than adding an exception to
the blacklist. Exceptions to a secret filter are how secret filters stop working.
