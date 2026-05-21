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
      label: "Overview",
      collapsed: false,
      items: [
        "overview/architecture",
        "overview/concepts",
        "overview/realms-and-roles",
      ],
    },
    {
      type: "category",
      label: "Security",
      collapsed: false,
      items: [
        "security/vaultys-id",
        "security/security-model",
        "security/capabilities",
        "security/delegation",
      ],
    },
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "guides/quickstart",
        "guides/configuration",
        "guides/deploying-agents",
        "guides/deployment",
        "guides/workflows",
        "guides/skills",
        "guides/llm-routing",
        "guides/governance",
        "guides/entra-sync",
      ],
    },
  ],

  apiSidebar: [
    {
      type: "doc",
      id: "api/overview",
      label: "API Overview",
    },
    {
      type: "category",
      label: "REST API",
      collapsed: false,
      items: [
        "api/agents",
        "api/intents",
        "api/policies",
        "api/realms",
        "api/users",
        "api/chat",
        "api/workflows",
        "api/tool-approvals",
        "api/models",
        "api/skills",
      ],
    },
    {
      type: "category",
      label: "WebSocket Protocol",
      collapsed: false,
      items: [
        "api/websocket",
        "api/websocket-messages",
      ],
    },
  ],
};

export default sidebars;
