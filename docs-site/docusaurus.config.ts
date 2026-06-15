import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "VaultysClaw",
  tagline: "Decentralised AI Agent Orchestration — Secured by VaultysId",
  favicon: "img/favicon.ico",

  url: "https://docs.vaultys.io",
  baseUrl: "/",

  organizationName: "vaultys",
  projectName: "vaultysclaw",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  markdown: {
    mermaid: true,
  },

  themes: ["@docusaurus/theme-mermaid"],

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/vaultys/vaultysclaw/tree/main/docs-site/",
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/logo.svg",
    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    announcementBar: {
      id: "beta",
      content:
        'VaultysClaw is currently in <strong>public alpha</strong>. Star us on <a href="https://github.com/vaultys/vaultysclaw" target="_blank">GitHub</a> and help shape the roadmap.',
      backgroundColor: "#1e40af",
      textColor: "#e0e7ff",
      isCloseable: true,
    },
    navbar: {
      title: "VaultysClaw",
      logo: {
        alt: "VaultysClaw Logo",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "docSidebar",
          sidebarId: "apiSidebar",
          position: "left",
          label: "API Reference",
        },
        {
          href: "https://github.com/vaultys/vaultysclaw",
          label: "GitHub",
          position: "right",
        },
        {
          type: "search",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Getting Started", to: "/docs/intro" },
            { label: "Architecture", to: "/docs/overview/architecture" },
            { label: "VaultysId Security", to: "/docs/security/vaultys-id" },
            { label: "API Reference", to: "/docs/api/overview" },
          ],
        },
        {
          title: "Guides",
          items: [
            { label: "Quick Start", to: "/docs/guides/quickstart" },
            { label: "Configuration", to: "/docs/guides/configuration" },
            { label: "AI Governance", to: "/docs/guides/governance" },
            { label: "Deployment", to: "/docs/guides/deployment" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub", href: "https://github.com/vaultys/vaultysclaw" },
            { label: "Vaultys.io", href: "https://vaultys.io" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Vaultys. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ["bash", "json", "typescript", "yaml", "docker"],
    },
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
