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
      <div className="p-5 space-y-4 text-sm text-foreground-600 leading-relaxed">{children}</div>
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
              <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">{h.name}</code>
              {" — "}
              {h.description}
            </li>
          ))}
        </ul>
        <p>
          Verify the signature <strong>before</strong> parsing or trusting the body — recompute the
          HMAC with your stored signing secret and compare in constant time:
        </p>
        <CodeBlock>{VERIFY_SNIPPET_NODE}</CodeBlock>
      </Section>

      <Section icon={WebhookIcon} title="Event reference">
        <div className="space-y-6">
          {EVENT_DOCS.map(({ group, events }) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-foreground-500 uppercase mb-2">{group}</h3>
              <div className="space-y-2">
                {events.map((e) => (
                  <details key={e.type} className="border border-neutral-200/60 rounded-lg">
                    <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-foreground hover:bg-background-200/40">
                      <code className="text-xs">{e.type}</code> — {e.label}
                    </summary>
                    <div className="px-3 pb-3 space-y-2">
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
