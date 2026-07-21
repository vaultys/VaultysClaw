"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Webhook as WebhookIcon,
  ShieldCheck,
  Send,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  buildWebhookEventDocs,
  WEBHOOK_HEADERS,
  VERIFY_SNIPPET_NODE,
} from "@/lib/webhook-docs";

const EVENT_DOCS = buildWebhookEventDocs();

const EXAMPLE_ENVELOPE = `{
  "event": "workspace.created",
  "occurredAt": "2026-07-16T09:24:00.000Z",
  "data": {
    "id": "ws_9f3a2b",
    "name": "Acme Research",
    "slug": "acme-research"
  }
}`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-background-200 border border-neutral-200 rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
        <Icon className="w-4 h-4 text-foreground-500" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5 space-y-4 text-sm text-foreground-600 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function WebhookDocsPage() {
  const { isAdmin, isOwner } = useRole();
  const hasAccess = isAdmin || isOwner;
  const [open, setOpen] = useState<Set<string>>(new Set());

  useBreadcrumbs(
    [
      { label: "Integrations", href: "/admin/settings/integrations" },
      { label: "Webhook docs" },
    ],
    []
  );

  useToolbar(
    {
      title: "Webhook documentation",
      description: "Payload format, signature verification and event reference",
    },
    []
  );

  if (!hasAccess) {
    return (
      <div className="p-6 w-full max-w-2xl mx-auto">
        <div className="bg-warning-50 border border-warning-300 rounded-xl px-4 py-3 text-warning-700 text-sm">
          You must be an administrator or owner to view this page.
        </div>
      </div>
    );
  }

  const toggle = (type: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div className="p-6 w-full max-w-4xl mx-auto space-y-6">
      <Link
        href="/admin/settings/integrations"
        className="inline-flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Integrations
      </Link>

      {/* Overview */}
      <Section icon={WebhookIcon} title="Overview">
        <p>
          When an event you subscribed to occurs, VaultysClaw sends an HTTP{" "}
          <code className="bg-background-200 px-1 rounded">POST</code> to your
          endpoint with a JSON body and a signature header. Configure endpoints in
          the{" "}
          <Link
            href="/admin/settings/integrations"
            className="text-primary-600 hover:underline"
          >
            Webhooks tab
          </Link>
          . Payloads only ever contain non-sensitive fields — secrets, passwords
          and API keys are never sent.
        </p>
        <p>
          Your endpoint should respond with a{" "}
          <code className="bg-background-200 px-1 rounded">2xx</code> status
          quickly. Any other status (or a timeout) is treated as a failure and the
          delivery is retried.
        </p>
      </Section>

      {/* Request format */}
      <Section icon={Send} title="Request format">
        <p>Every delivery has the same envelope:</p>
        <CodeBlock>{EXAMPLE_ENVELOPE}</CodeBlock>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <code className="bg-background-200 px-1 rounded">event</code> — the
            event type (see the reference below).
          </li>
          <li>
            <code className="bg-background-200 px-1 rounded">occurredAt</code> —
            ISO 8601 timestamp of when the event happened.
          </li>
          <li>
            <code className="bg-background-200 px-1 rounded">data</code> — the
            event-specific payload.
          </li>
        </ul>
        <p className="font-medium text-foreground pt-2">Headers</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-neutral-200 rounded-lg overflow-hidden">
            <thead className="bg-background-200 text-foreground-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Header</th>
                <th className="text-left font-medium px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {WEBHOOK_HEADERS.map((h) => (
                <tr key={h.name} className="border-t border-neutral-200">
                  <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">
                    {h.name}
                  </td>
                  <td className="px-3 py-2">{h.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Verifying signatures */}
      <Section icon={ShieldCheck} title="Verifying signatures">
        <p>
          Each request is signed so you can confirm it came from VaultysClaw and
          wasn&apos;t tampered with. The signature is an{" "}
          <code className="bg-background-200 px-1 rounded">HMAC-SHA256</code> over{" "}
          <code className="bg-background-200 px-1 rounded">
            {"`${timestamp}.${rawBody}`"}
          </code>{" "}
          using your webhook&apos;s signing secret, hex-encoded and prefixed with{" "}
          <code className="bg-background-200 px-1 rounded">sha256=</code>.
        </p>
        <p>
          Recompute it with your stored secret, the{" "}
          <code className="bg-background-200 px-1 rounded">
            X-VaultysClaw-Timestamp
          </code>{" "}
          header and the <strong>raw</strong> request body (before JSON parsing),
          then compare in constant time to{" "}
          <code className="bg-background-200 px-1 rounded">
            X-VaultysClaw-Signature
          </code>
          :
        </p>
        <CodeBlock>{VERIFY_SNIPPET_NODE}</CodeBlock>
        <p className="text-xs text-foreground-500">
          The signing secret is shown once when you create a webhook (and again
          when you regenerate it). A ready-to-run local receiver that verifies
          signatures lives at{" "}
          <code className="bg-background-200 px-1 rounded">
            scripts/webhook-receiver.mjs
          </code>
          .
        </p>
      </Section>

      {/* Delivery & retries */}
      <Section icon={RefreshCw} title="Delivery & retries">
        <p>
          Deliveries are best-effort with at-least-once semantics. A failed
          delivery (non-2xx or timeout) is retried up to 5 times with exponential
          backoff. Design your handler to be idempotent — de-duplicate on the{" "}
          <code className="bg-background-200 px-1 rounded">
            X-VaultysClaw-Delivery
          </code>{" "}
          id if needed.
        </p>
      </Section>

      {/* Events reference */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground px-1">
          Events reference
        </h2>
        {EVENT_DOCS.map(({ group, events }) => (
          <div
            key={group}
            className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-neutral-200 bg-background-200">
              <h3 className="text-xs font-semibold text-foreground-600 uppercase tracking-wider">
                {group}
              </h3>
            </div>
            <ul className="divide-y divide-neutral-200">
              {events.map((ev) => {
                const isOpen = open.has(ev.type);
                return (
                  <li key={ev.type}>
                    <button
                      onClick={() => toggle(ev.type)}
                      className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-background-200/50 transition"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                      )}
                      <code className="text-xs font-mono text-primary-600 shrink-0">
                        {ev.type}
                      </code>
                      <span className="text-xs text-foreground-500 truncate">
                        {ev.description}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 pl-11">
                        <CodeBlock>{ev.exampleBody}</CodeBlock>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
