import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "VaultysClaw",
  tagline: "A Zero Trust plane for AI agents — cryptographic identity, signed capability certificates, live revocation",
  favicon: "img/favicon.ico",

  url: "https://docs.vaultys.io",
  baseUrl: "/",

  organizationName: "vaultys",
  projectName: "vaultysclaw",

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
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
          to: "/docs/zero-trust/matrix",
          position: "left",
          label: "Zero Trust",
        },
        {
          type: "docSidebar",
          sidebarId: "referenceSidebar",
          position: "left",
          label: "Reference",
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
          title: "Zero Trust",
          items: [
            { label: "Overview", to: "/docs/zero-trust/overview" },
            { label: "Compliance matrix", to: "/docs/zero-trust/matrix" },
            { label: "Gaps and roadmap", to: "/docs/zero-trust/roadmap" },
          ],
        },
        {
          title: "Documentation",
          items: [
            { label: "Introduction", to: "/docs/intro" },
            { label: "Certificates", to: "/docs/concepts/certificates" },
            { label: "Architecture", to: "/docs/architecture/overview" },
            { label: "Quickstart", to: "/docs/guides/quickstart" },
            { label: "Reference", to: "/docs/reference/websocket-protocol" },
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
