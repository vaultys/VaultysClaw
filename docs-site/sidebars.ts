import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "doc",
      id: "intro",
      label: "Introduction",
    },
    {
      type: "category",
      label: "Zero Trust",
      collapsed: false,
      link: { type: "doc", id: "zero-trust/overview" },
      items: ["zero-trust/overview", "zero-trust/matrix", "zero-trust/roadmap"],
    },
    {
      type: "category",
      label: "Concepts",
      collapsed: false,
      items: [
        "concepts/actors",
        "concepts/certificates",
        "concepts/capabilities",
        "concepts/trust-verification",
        "concepts/blast-radius",
        "concepts/audit-log",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      collapsed: false,
      items: [
        "architecture/overview",
        "architecture/control-plane",
        "architecture/agent-kinds",
        "architecture/building-an-actor",
      ],
    },
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "guides/quickstart",
        "guides/bootstrap",
        "guides/onboarding-actors",
        "guides/issuing-certificates",
        "guides/human-onboarding",
        "guides/webhooks",
        "guides/notification-channels",
        "guides/model-registry",
        "guides/sensors",
        "guides/deployment",
      ],
    },
  ],

  referenceSidebar: [
    {
      type: "category",
      label: "Reference",
      collapsed: false,
      items: [
        "reference/websocket-protocol",
        "reference/webhook-events",
        "reference/removed-surface",
        "reference/glossary",
      ],
    },
  ],
};

export default sidebars;
