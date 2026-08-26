# packages/shared

The small set of definitions `packages/controlplane` and
`packages/webhook-dispatcher` genuinely both need. Import via
`@vaultysclaw/shared`. No dependencies — not even on `@vaultysclaw/policy`.

Deliberately tiny. It was ~1850 lines describing the chat, workflow, channel and
agent-protocol surface `docs/REBUILD_ARCHITECTURE.md` §2 cuts; when those
packages were removed it was reduced to what actually survives. Resist growing it
back: a type used by only one package belongs in that package.

## Key files

- **`src/webhooks.ts`** — the webhook event catalog and queue contract, and the
  reason this package still exists: it is the one thing a producer (the control
  plane) and a consumer (the dispatcher) must agree on exactly.
  `WEBHOOK_EVENTS`, `WebhookEventDef`, `getWebhookEvent`, `WebhookJob`,
  `DeadWebhookJob`, `WEBHOOK_QUEUE_NAME`, `WEBHOOK_DLQ_NAME`.
- **`src/llm-providers.ts`** — `LlmProviderType` and `isSdkAgentProvider`, used by
  the control plane's Model Registry. Provider identity survives the cut because
  the registry catalogues endpoints regardless of what talks to them.

## Adding a webhook event

The catalog here is step 1 of a five-step checklist that spans three packages —
follow the root `CLAUDE.md` → Webhooks → "Adding or changing a webhook event".
Adding the entry without the payload builder, the notification template and the
docs example produces an event that either delivers `{}` or silently reaches
nobody.

The catalog is scoped to what `packages/controlplane` actually emits;
`controlplane/lib/webhook-events.ts` filters it by group so an admin is never
offered a checkbox for an event that will never fire.
