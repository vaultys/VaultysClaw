import { SettingsDAO } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/vault";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerName: string;
}

/**
 * Read OIDC config. Env vars take precedence over DB values so deployments
 * using env-based config continue to work without any DB writes.
 */
export async function getOidcConfig(): Promise<OidcConfig | null> {
  // Env var override
  const envIssuer = process.env.OIDC_ISSUER;
  const envClientId = process.env.OIDC_CLIENT_ID;
  const envClientSecret = process.env.OIDC_CLIENT_SECRET;
  if (envIssuer && envClientId && envClientSecret) {
    return {
      issuer: envIssuer,
      clientId: envClientId,
      clientSecret: envClientSecret,
      providerName: process.env.OIDC_PROVIDER_NAME ?? "SSO",
    };
  }

  // DB config
  const keys = ["oidc_issuer", "oidc_client_id", "oidc_client_secret_enc", "oidc_provider_name"];
  const settings = await SettingsDAO.getMany(keys);
  const issuer = settings["oidc_issuer"];
  const clientId = settings["oidc_client_id"];
  const secretEnc = settings["oidc_client_secret_enc"];
  if (!issuer || !clientId || !secretEnc) return null;

  let clientSecret: string;
  try {
    clientSecret = await decryptSecret(secretEnc);
  } catch {
    return null;
  }

  return {
    issuer,
    clientId,
    clientSecret,
    providerName: settings["oidc_provider_name"] ?? "SSO",
  };
}

/** Strip trailing slash and any accidentally-included discovery-document suffix. */
function normalizeIssuer(raw: string): string {
  return raw
    .trim()
    .replace(/\/$/, "")
    .replace(/\/.well-known\/(openid-configuration|oauth-authorization-server)\/?$/, "");
}

export async function saveOidcConfig(cfg: OidcConfig): Promise<void> {
  const secretEnc = await encryptSecret(cfg.clientSecret);
  await Promise.all([
    SettingsDAO.set("oidc_issuer", normalizeIssuer(cfg.issuer)),
    SettingsDAO.set("oidc_client_id", cfg.clientId),
    SettingsDAO.set("oidc_client_secret_enc", secretEnc),
    SettingsDAO.set("oidc_provider_name", cfg.providerName || "SSO"),
  ]);
}

export async function deleteOidcConfig(): Promise<void> {
  await Promise.all([
    SettingsDAO.delete("oidc_issuer"),
    SettingsDAO.delete("oidc_client_id"),
    SettingsDAO.delete("oidc_client_secret_enc"),
    SettingsDAO.delete("oidc_provider_name"),
  ]);
}

export async function testOidcConnection(issuer: string): Promise<{
  ok: boolean;
  checks: Array<{ id: string; label: string; status: "ok" | "fail"; detail: string | null }>;
}> {
  const checks: Array<{ id: string; label: string; status: "ok" | "fail"; detail: string | null }> = [];
  const normalized = normalizeIssuer(issuer);
  const discoveryUrl = `${normalized}/.well-known/openid-configuration`;

  let doc: Record<string, unknown> | null = null;
  try {
    const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    doc = (await res.json()) as Record<string, unknown>;
    checks.push({ id: "discovery", label: "Discovery document reachable", status: "ok", detail: discoveryUrl });
  } catch (err) {
    checks.push({ id: "discovery", label: "Discovery document reachable", status: "fail", detail: String(err) });
    return { ok: false, checks };
  }

  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    checks.push({
      id: field,
      label: field.replace(/_/g, " "),
      status: doc[field] ? "ok" : "fail",
      detail: doc[field] ? String(doc[field]) : "Not present in discovery document",
    });
  }

  const ok = checks.every((c) => c.status === "ok");
  return { ok, checks };
}
