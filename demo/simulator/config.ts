/**
 * Demo simulator — agent fleet configuration
 * 30 agents across all 8 workspaces, spread geographically.
 */

import crypto from "crypto";

export type LlmProvider = "openai" | "anthropic" | "google" | "ollama";

export interface AgentConfig {
  name: string;
  workspace: string; // slug
  model: string;
  provider: LlmProvider;
  capabilities: string[];
  location: { lat: number; lon: number; label: string };
  /** Price per 1M input tokens in USD */
  inputPrice: number;
  /** Price per 1M output tokens in USD */
  outputPrice: number;
}

export const DEMO_AGENTS: AgentConfig[] = [
  // ── Engineering ──────────────────────────────────────────────────
  {
    name: "code-review-sf",
    workspace: "engineering",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["code_execution", "file_access", "api_call"],
    location: { lat: 37.7749, lon: -122.4194, label: "San Francisco" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "test-runner-berlin",
    workspace: "engineering",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["code_execution", "file_access"],
    location: { lat: 52.52, lon: 13.405, label: "Berlin" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "docs-writer-bangalore",
    workspace: "engineering",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 12.9716, lon: 77.5946, label: "Bangalore" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  {
    name: "pr-assistant-london",
    workspace: "engineering",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["code_execution", "file_access", "api_call"],
    location: { lat: 51.5074, lon: -0.1278, label: "London" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "lint-enforcer-toronto",
    workspace: "engineering",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["code_execution", "file_access"],
    location: { lat: 43.6532, lon: -79.3832, label: "Toronto" },
    inputPrice: 2.5,
    outputPrice: 10,
  },

  // ── Security Ops ──────────────────────────────────────────────────
  {
    name: "vuln-scanner-tlv",
    workspace: "security-ops",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["internet_access", "api_call", "system_command"],
    location: { lat: 32.0853, lon: 34.7818, label: "Tel Aviv" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "threat-analyzer-sg",
    workspace: "security-ops",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["internet_access", "api_call"],
    location: { lat: 1.3521, lon: 103.8198, label: "Singapore" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "audit-trail-nyc",
    workspace: "security-ops",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 40.7128, lon: -74.006, label: "New York" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  {
    name: "siem-correlator-frankfurt",
    workspace: "security-ops",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["internet_access", "api_call", "system_command"],
    location: { lat: 50.1109, lon: 8.6821, label: "Frankfurt" },
    inputPrice: 2.5,
    outputPrice: 10,
  },

  // ── DevOps ────────────────────────────────────────────────────────
  {
    name: "deploy-agent-amsterdam",
    workspace: "devops",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["system_command", "api_call", "code_execution"],
    location: { lat: 52.3676, lon: 4.9041, label: "Amsterdam" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "monitoring-agent-paris",
    workspace: "devops",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["api_call", "internet_access"],
    location: { lat: 48.8566, lon: 2.3522, label: "Paris" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "infra-provisioner-tokyo",
    workspace: "devops",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["system_command", "api_call", "code_execution", "file_access"],
    location: { lat: 35.6762, lon: 139.6503, label: "Tokyo" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "alert-handler-sydney",
    workspace: "devops",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["api_call", "mail_send"],
    location: { lat: -33.8688, lon: 151.2093, label: "Sydney" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },

  // ── Finance & Compliance ──────────────────────────────────────────
  {
    name: "report-generator-zurich",
    workspace: "finance",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 47.3769, lon: 8.5417, label: "Zurich" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "compliance-checker-dubai",
    workspace: "finance",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["file_access", "api_call"],
    location: { lat: 25.2048, lon: 55.2708, label: "Dubai" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "fraud-detector-chicago",
    workspace: "finance",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["api_call", "internet_access"],
    location: { lat: 41.8781, lon: -87.6298, label: "Chicago" },
    inputPrice: 2.5,
    outputPrice: 10,
  },

  // ── Data & Analytics ──────────────────────────────────────────────
  {
    name: "pipeline-agent-seoul",
    workspace: "data",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["code_execution", "file_access", "api_call"],
    location: { lat: 37.5665, lon: 126.978, label: "Seoul" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "ml-trainer-montreal",
    workspace: "data",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["code_execution", "file_access"],
    location: { lat: 45.5017, lon: -73.5673, label: "Montreal" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "etl-runner-stockholm",
    workspace: "data",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["code_execution", "api_call"],
    location: { lat: 59.3293, lon: 18.0686, label: "Stockholm" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  {
    name: "insight-reporter-paris",
    workspace: "data",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["file_access", "api_call", "internet_access"],
    location: { lat: 48.8566, lon: 2.3522, label: "Paris" },
    inputPrice: 2.5,
    outputPrice: 10,
  },

  // ── Customer Success ──────────────────────────────────────────────
  {
    name: "ticket-router-madrid",
    workspace: "customer-success",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["api_call", "mail_send"],
    location: { lat: 40.4168, lon: -3.7038, label: "Madrid" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  {
    name: "sentiment-analyzer-sao-paulo",
    workspace: "customer-success",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["api_call", "internet_access"],
    location: { lat: -23.5505, lon: -46.6333, label: "São Paulo" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "sla-monitor-melbourne",
    workspace: "customer-success",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["api_call"],
    location: { lat: -37.8136, lon: 144.9631, label: "Melbourne" },
    inputPrice: 3,
    outputPrice: 15,
  },

  // ── Legal & Audit ─────────────────────────────────────────────────
  {
    name: "contract-reviewer-brussels",
    workspace: "legal",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 50.8503, lon: 4.3517, label: "Brussels" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "gdpr-agent-berlin",
    workspace: "legal",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["file_access", "api_call", "internet_access"],
    location: { lat: 52.52, lon: 13.405, label: "Berlin" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "risk-assessor-geneva",
    workspace: "legal",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 46.2044, lon: 6.1432, label: "Geneva" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "nda-tracker-washington",
    workspace: "legal",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["file_access", "api_call"],
    location: { lat: 38.9072, lon: -77.0369, label: "Washington DC" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },

  // ── Product ───────────────────────────────────────────────────────
  {
    name: "feature-flag-agent-austin",
    workspace: "product",
    model: "gpt-4o",
    provider: "openai",
    capabilities: ["api_call", "code_execution"],
    location: { lat: 30.2672, lon: -97.7431, label: "Austin" },
    inputPrice: 2.5,
    outputPrice: 10,
  },
  {
    name: "ab-test-runner-stockholm",
    workspace: "product",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    capabilities: ["api_call", "code_execution"],
    location: { lat: 59.3293, lon: 18.0686, label: "Stockholm" },
    inputPrice: 3,
    outputPrice: 15,
  },
  {
    name: "metrics-reporter-singapore",
    workspace: "product",
    model: "gpt-4o-mini",
    provider: "openai",
    capabilities: ["api_call", "internet_access"],
    location: { lat: 1.3521, lon: 103.8198, label: "Singapore" },
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
];

// ── Proxies ───────────────────────────────────────────────────────────────────
// A handful of demo proxies — each fronts a fake upstream, has a mix of
// no_check/governed rules, and a roster of principals in different states
// (active/pending) so the /admin/proxies pages have realistic, non-empty data.

export interface ProxyUpstreamConfig {
  name: string;
  baseUrl: string;
}

export interface ProxyPrincipalIdSourceConfig {
  from: "header" | "url" | "body";
  key: string;
}

export interface ProxyRuleConfig {
  method: string;
  urlPattern: string;
  mode: "no_check" | "governed";
  governanceRule?: string;
  principalIdSource?: ProxyPrincipalIdSourceConfig;
}

export interface ProxyPrincipalConfig {
  externalId: string;
  tag?: string;
  governanceRules: string[];
  status: "pending" | "active" | "revoked";
}

export interface ProxyConfig {
  name: string;
  defaultMode: "passthrough" | "deny";
  upstreams: ProxyUpstreamConfig[];
  rules: ProxyRuleConfig[];
  principals: ProxyPrincipalConfig[];
}

/**
 * Deterministic fake DID for a demo proxy's principal. Demo principals are
 * simulated callers/agents, not real running processes with their own
 * VaultysId — a stable hash-derived DID is enough to keep seed-demo.ts and
 * proxy-sim.ts in agreement without needing real keypairs for entities that
 * never actually sign anything.
 */
export function demoPrincipalDid(proxyName: string, externalId: string): string {
  const hex = crypto
    .createHash("sha1")
    .update(`proxy-principal:${proxyName}:${externalId}`)
    .digest("hex")
    .slice(0, 32);
  return `did:vaultys:${hex}`;
}

export const DEMO_PROXIES: ProxyConfig[] = [
  {
    name: "acme-crm-proxy",
    defaultMode: "deny",
    upstreams: [{ name: "acme-crm", baseUrl: "https://crm.acme-demo.internal" }],
    rules: [
      {
        method: "GET",
        urlPattern: "https://crm.acme-demo.internal/health",
        mode: "no_check",
      },
      {
        method: "POST",
        urlPattern: "https://crm.acme-demo.internal/api/*",
        mode: "governed",
        governanceRule: "crm_write",
        principalIdSource: { from: "header", key: "X-Agent-Id" },
      },
    ],
    principals: [
      { externalId: "sales-assistant-agent", tag: "ai_agent", governanceRules: ["crm_write"], status: "active" },
      { externalId: "billing-sync-service", tag: "service", governanceRules: [], status: "pending" },
    ],
  },
  {
    name: "partner-api-proxy",
    defaultMode: "deny",
    upstreams: [{ name: "partner-integrations", baseUrl: "https://partner-api.demo.internal" }],
    rules: [
      {
        method: "GET",
        urlPattern: "https://partner-api.demo.internal/v1/*",
        mode: "governed",
        governanceRule: "partner_read",
        principalIdSource: { from: "header", key: "X-Partner-Id" },
      },
    ],
    principals: [
      { externalId: "partner-widget-co", tag: "service", governanceRules: ["partner_read"], status: "active" },
      { externalId: "partner-newco", tag: "service", governanceRules: [], status: "pending" },
    ],
  },
  {
    name: "internal-tools-proxy",
    defaultMode: "passthrough",
    upstreams: [{ name: "internal-wiki", baseUrl: "https://wiki.demo.internal" }],
    rules: [
      {
        method: "GET",
        urlPattern: "https://wiki.demo.internal/public/*",
        mode: "no_check",
      },
      {
        method: "POST",
        urlPattern: "https://wiki.demo.internal/api/edit",
        mode: "governed",
        governanceRule: "wiki_edit",
        principalIdSource: { from: "header", key: "X-Agent-Id" },
      },
    ],
    principals: [
      { externalId: "docs-writer-bangalore", tag: "ai_agent", governanceRules: ["wiki_edit"], status: "active" },
    ],
  },
];

/** The plaintext demo API key — hashed in seed, sent as x-api-key header by runner */
export const DEMO_API_KEY = "vc-demo-0000-0000-0000-000000000001";

export const WS_URL = process.env.CONTROL_PLANE_WS_URL ?? "ws://localhost:8080";
export const BASE_URL = process.env.CONTROL_PLANE_URL ?? "http://localhost:3000";
