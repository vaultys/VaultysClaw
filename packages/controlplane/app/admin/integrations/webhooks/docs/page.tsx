import { ShieldCheck, Send, Webhook as WebhookIcon } from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";
import { buildWebhookEventDocs, WEBHOOK_HEADERS, VERIFY_SNIPPET_NODE } from "@/lib/webhook-docs";

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
    <pre className="overflow-x-auto rounded-lg border border-neutral-200/60 bg-background-200 p-4 font-mono text-xs text-foreground">
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
    <section className="overflow-hidden rounded-xl border border-neutral-200/60 bg-background-100">
      <div className="flex items-center gap-2 border-b border-neutral-200/60 px-5 py-4">
        <Icon className="h-4 w-4 text-foreground-500" strokeWidth={1.5} />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="space-y-4 p-5 text-sm leading-6 text-foreground-600">{children}</div>
    </section>
  );
}

/** No page-level auth check needed — `app/admin/layout.tsx` already gates the whole `/admin/*`
 *  tree on `admin_console_access`. */
export default function WebhookDocsPage() {
  return (
    <div className="p-6 max-w-3xl space-y-6">
      <PageChrome
        toolbar={{
          title: "Webhook documentation",
          description: "Payload format, signature verification, and event reference",
        }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: "Webhook docs" },
        ]}
      />

      <Section icon={Send} title="Envelope">
        <p>
          Every delivery is an HTTP POST with a JSON body of this shape — <code>data</code> is
          exactly the sanitized, event-specific payload documented below, never a raw database row.
        </p>
        <CodeBlock>{EXAMPLE_ENVELOPE}</CodeBlock>
      </Section>

      <Section icon={ShieldCheck} title="Headers & signature verification">
        <p>Every request carries these headers:</p>
        <ul className="space-y-1.5">
          {WEBHOOK_HEADERS.map((h) => (
            <li key={h.name}>
              <code className="rounded bg-background-200 px-1.5 py-0.5 font-mono text-xs">{h.name}</code>
              {" — "}
              {h.description}
            </li>
          ))}
        </ul>
        <p>
          Verify the signature <span className="font-medium text-foreground">before</span> parsing or trusting the body — recompute the
          HMAC with your stored signing secret and compare in constant time:
        </p>
        <CodeBlock>{VERIFY_SNIPPET_NODE}</CodeBlock>
      </Section>

      <Section icon={WebhookIcon} title="Event reference">
        <div className="space-y-6">
          {EVENT_DOCS.map(({ group, events }) => (
            <div key={group}>
              <h3 className="mb-2 text-xs text-foreground-500">{group}</h3>
              <div className="space-y-2">
                {events.map((e) => (
                  <details key={e.type} className="rounded-lg border border-neutral-200/60">
                    <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-200/40">
                      <code className="font-mono text-xs">{e.type}</code> — {e.label}
                    </summary>
                    <div className="space-y-2 px-3 pb-3">
                      <p className="text-xs text-foreground-500">{e.description}</p>
                      <CodeBlock>{e.exampleBody}</CodeBlock>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
