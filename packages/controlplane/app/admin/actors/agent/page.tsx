import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  Bot,
  Cable,
  CheckCircle2,
  Cpu,
  KeyRound,
  Network,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";

const TS_EXAMPLE = `import { ActorRuntime } from "@vaultysclaw/sdk";

const actor = new ActorRuntime({
  name: "research-agent",
  kind: "openclaw",
  controlPlaneWsUrl: "ws://localhost:8081",
  identityPath: "~/.vaultysclaw/research-agent.id",
  requestedCapabilities: ["internet_access", "knowledge_search"],
  capabilityStatePath: "~/.vaultysclaw/research-agent.caps.json",
});

await actor.start();`;

const GO_EXAMPLE = `id, _ := identity.LoadOrCreate("~/.vaultysclaw/runner.id")

conn := vconn.NewClientConn(vconn.ClientConfig{
    CollectorURL:          "http://localhost:3001",
    Identity:              id,
    Name:                  "runner",
    Kind:                  "openclaw",
    RequestedCapabilities: []string{"internet_access"},
    CapabilityStatePath:   "~/.vaultysclaw/runner.caps.json",
})

go conn.Run(ctx)`;

const setupOptions = [
  {
    title: "Build with the TypeScript SDK",
    icon: Bot,
    badge: "openclaw / mcp",
    body:
      "For agents already running in Node.js or TypeScript. The SDK owns identity, registration, reconnects, certificate delivery, and local permission checks.",
    items: [
      "Choose a stable actor name and kind.",
      "Store the identity file on persistent disk.",
      "Declare the capabilities the agent will request.",
      "Start the process, then approve it from the pending queue.",
    ],
    code: TS_EXAMPLE,
  },
  {
    title: "Build with the Go SDK",
    icon: Cpu,
    badge: "service / device",
    body:
      "For daemons, CLIs, sensors, and infrastructure agents that should keep a compact runtime and reconnect without operator help.",
    items: [
      "Load or create one VaultysId identity per deployed agent.",
      "Point the client at the control plane HTTP endpoint.",
      "Request only the capabilities this process can actually use.",
      "Gate behavior on the capabilities that were granted.",
    ],
    code: GO_EXAMPLE,
  },
  {
    title: "Run the sensor or harness",
    icon: Terminal,
    badge: "sensor / harness",
    body:
      "Use the shipped binaries when the agent is really an observed workload, local machine sensor, or supervised coding harness.",
    items: [
      "Install the component on the host that owns the blast radius.",
      "Keep its identity and capability state files across restarts.",
      "Start it once so it appears as pending approval.",
      "Approve the narrow capability set needed for that host.",
    ],
  },
  {
    title: "Put a proxy in front",
    icon: Network,
    badge: "proxy",
    body:
      "For third-party tools that cannot embed an SDK. Register an interception point and route the tool's traffic through it.",
    items: [
      "Define the traffic zone the proxy will govern.",
      "Register the proxy as the actor, not the off-the-shelf tool.",
      "Issue certificates to the proxy for the allowed operations.",
      "Remember that everything behind one proxy shares that boundary.",
    ],
  },
];

const requirements = [
  {
    title: "Identity persistence",
    icon: KeyRound,
    body:
      "The private identity file must survive deploys. Losing it creates a brand new DID that needs approval again.",
  },
  {
    title: "Capability state",
    icon: ShieldCheck,
    body:
      "Persist the certificate state file too. Without it, the actor holds no authority until delivery runs again.",
  },
  {
    title: "Approval handoff",
    icon: CheckCircle2,
    body:
      "Starting the agent does not grant access. It registers, lands in pending approval, and waits for an admin decision.",
  },
  {
    title: "Network reachability",
    icon: Cable,
    body:
      "The agent needs access to the control plane endpoint and should keep reconnecting when that path drops.",
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-background-200 p-4 text-xs text-foreground">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-background-100">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
        <Icon className="h-4 w-4 text-foreground-500" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AddAgentPage() {
  return (
    <div className="p-6 space-y-6">
      <PageChrome
        toolbar={{
          title: "Add agent",
          description: "Choose how a non-human actor should join the trust graph",
        }}
        breadcrumbs={[
          { label: "Actors", href: "/admin/actors" },
          { label: "Add agent" },
        ]}
      />

      <Section icon={Bot} title="Pick an onboarding path">
        <div className="grid gap-4 xl:grid-cols-2">
          {setupOptions.map((option) => {
            const Icon = option.icon;
            return (
              <article
                key={option.title}
                className="rounded-lg border border-neutral-200 bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {option.title}
                    </h3>
                  </div>
                  <span className="rounded-full border border-neutral-200 bg-background-200 px-2 py-0.5 text-xs text-foreground-500">
                    {option.badge}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground-600">
                  {option.body}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-foreground-600">
                  {option.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {option.code && (
                  <div className="mt-4">
                    <CodeBlock>{option.code}</CodeBlock>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section icon={ShieldCheck} title="Before approval">
          <div className="grid gap-3 sm:grid-cols-2">
            {requirements.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-lg border border-neutral-200 bg-background p-4"
                >
                  <Icon className="h-4 w-4 text-foreground-500" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-foreground-600">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>

        <Section icon={CheckCircle2} title="What happens next">
          <ol className="space-y-3 text-sm leading-6 text-foreground-600">
            <li>
              <span className="font-medium text-foreground">1. Start the agent.</span>{" "}
              It connects, proves its DID, and requests capabilities.
            </li>
            <li>
              <span className="font-medium text-foreground">2. Review pending approval.</span>{" "}
              The request appears on the Actors page with editable capabilities.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Deliver the grant.</span>{" "}
              If the agent is online, the certificate exchange runs immediately.
            </li>
          </ol>
          <Link
            href="/admin/actors"
            className="mt-5 inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500"
          >
            Review pending agents
          </Link>
        </Section>
      </div>
    </div>
  );
}
