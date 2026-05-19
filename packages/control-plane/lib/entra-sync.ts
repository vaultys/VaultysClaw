/**
 * Microsoft Entra ID (Azure AD) sync via MS Graph API.
 * Uses the OAuth2 client credentials flow — no user interaction required.
 */

import { getSetting, setSetting, createRealm, getRealmBySlug, addUserToRealm } from "./db";
import { UserDao } from "./user-dao";

/** Sentinel value in groupRealmMap meaning "create a new realm named after this group". */
export const CREATE_REALM_SENTINEL = "__create__";

// ── Config ────────────────────────────────────────────────────────────────────

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function getEntraConfig(): EntraConfig | null {
  const tenantId = getSetting("entra_tenant_id");
  const clientId = getSetting("entra_client_id");
  const clientSecret = getSetting("entra_client_secret");
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function saveEntraConfig(config: EntraConfig): void {
  setSetting("entra_tenant_id", config.tenantId);
  setSetting("entra_client_id", config.clientId);
  setSetting("entra_client_secret", config.clientSecret);
}

// ── MS Graph types ────────────────────────────────────────────────────────────

export interface EntraGroup {
  id: string;
  displayName: string;
  description: string | null;
}

export interface EntraMember {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
}

// ── Token ─────────────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: EntraConfig): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token;
  }

  const url = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Entra token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export type DiagnosticStatus = "ok" | "fail";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string | null;
  hint: string | null;
}

interface GraphErrorBody {
  error?: { code?: string; message?: string };
}

/** Map Graph/token error responses to actionable hints. */
function hintFromError(raw: string, checkId: string): string {
  // Try to parse as JSON first
  let code = "";
  let message = "";
  try {
    const body = JSON.parse(raw) as GraphErrorBody;
    code = body.error?.code ?? "";
    message = body.error?.message ?? "";
  } catch {
    message = raw;
  }

  // Token endpoint errors
  if (checkId === "token") {
    if (raw.includes("AADSTS700016") || raw.includes("application was not found"))
      return "The Client ID does not match any app registration in this tenant. Double-check the Client ID and Tenant ID.";
    if (raw.includes("AADSTS7000215") || raw.includes("Invalid client secret"))
      return "The client secret is incorrect or has expired. Generate a new secret in Certificates & secrets.";
    if (raw.includes("AADSTS90002") || raw.includes("Tenant") )
      return "The Tenant ID was not found. Make sure you copied the Directory (tenant) ID, not the domain name.";
    return `Authentication failed: ${message || raw}`;
  }

  // Graph permission errors
  if (code === "Authorization_RequestDenied" || raw.includes("403")) {
    if (checkId === "users")
      return "User.Read.All is missing or not consented. In API permissions, make sure you added it as an Application permission (not Delegated) and clicked Grant admin consent.";
    if (checkId === "groups")
      return "Group.Read.All is missing or not consented. In API permissions, make sure you added it as an Application permission (not Delegated) and clicked Grant admin consent.";
  }
  if (code === "InvalidAuthenticationToken" || raw.includes("401"))
    return "The access token was rejected. Try saving your credentials again and re-running the check.";

  return message || raw;
}

/**
 * Run a series of diagnostic checks against the Entra configuration and return
 * per-check results so the UI can show exactly which step fails and why.
 */
export async function diagnoseEntraConfig(config: EntraConfig): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // ── 1. Obtain access token ─────────────────────────────────────────────────
  let token: string;
  try {
    // Bypass cache so we always use the credentials provided
    tokenCache = null;
    token = await getAccessToken(config);
    checks.push({ id: "token", label: "Obtain access token", status: "ok", detail: null, hint: null });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    checks.push({
      id: "token",
      label: "Obtain access token",
      status: "fail",
      detail: raw,
      hint: hintFromError(raw, "token"),
    });
    // Cannot proceed without a token
    for (const id of ["users", "groups"] as const) {
      checks.push({
        id,
        label: id === "users" ? "Read users (User.Read.All)" : "Read groups (Group.Read.All)",
        status: "fail",
        detail: "Skipped — token could not be obtained",
        hint: null,
      });
    }
    return checks;
  }

  // ── 2. Read users (User.Read.All) ──────────────────────────────────────────
  try {
    await graphGet<unknown>("/users?$select=id&$top=1", token);
    checks.push({ id: "users", label: "Read users (User.Read.All)", status: "ok", detail: null, hint: null });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    checks.push({
      id: "users",
      label: "Read users (User.Read.All)",
      status: "fail",
      detail: raw,
      hint: hintFromError(raw, "users"),
    });
  }

  // ── 3. Read groups (Group.Read.All) ───────────────────────────────────────
  try {
    await graphGet<unknown>("/groups?$select=id&$top=1", token);
    checks.push({ id: "groups", label: "Read groups (Group.Read.All)", status: "ok", detail: null, hint: null });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    checks.push({
      id: "groups",
      label: "Read groups (Group.Read.All)",
      status: "fail",
      detail: raw,
      hint: hintFromError(raw, "groups"),
    });
  }

  return checks;
}

/** Fetch all pages from a Graph list endpoint. */
async function graphGetAll<T>(path: string, token: string): Promise<T[]> {
  type PageResponse = { value: T[]; "@odata.nextLink"?: string };
  const results: T[] = [];
  let url: string | null = path;
  while (url) {
    const page: PageResponse = await graphGet<PageResponse>(url, token);
    results.push(...page.value);
    const next = page["@odata.nextLink"];
    url = next ? next.replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** List all groups in the tenant. */
export async function listEntraGroups(): Promise<EntraGroup[]> {
  const config = getEntraConfig();
  if (!config) throw new Error("Entra not configured");
  const token = await getAccessToken(config);
  return graphGetAll<EntraGroup>(
    "/groups?$select=id,displayName,description&$top=999",
    token,
  );
}

/** List members of a specific group (users only). */
export async function listGroupMembers(groupId: string): Promise<EntraMember[]> {
  const config = getEntraConfig();
  if (!config) throw new Error("Entra not configured");
  const token = await getAccessToken(config);
  const members = await graphGetAll<EntraMember & { "@odata.type"?: string }>(
    `/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`,
    token,
  );
  // Keep only user objects (not nested groups or service principals)
  return members.filter(
    (m) => !m["@odata.type"] || m["@odata.type"] === "#microsoft.graph.user",
  );
}

/** List all users in the tenant. */
export async function listAllEntraUsers(): Promise<EntraMember[]> {
  const config = getEntraConfig();
  if (!config) throw new Error("Entra not configured");
  const token = await getAccessToken(config);
  return graphGetAll<EntraMember>(
    "/users?$select=id,displayName,mail,userPrincipalName&$top=999",
    token,
  );
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export interface SyncOptions {
  /** Entra group IDs to import. If empty, import all users. */
  groupIds: string[];
  /**
   * Map from Entra group ID to realm ID.
   * Use the sentinel value `CREATE_REALM_SENTINEL` ("__create__") to create a
   * new realm named after the Entra group instead of mapping to an existing one.
   */
  groupRealmMap: Record<string, string>;
  /** Display names of groups, used when creating realms from group names. */
  groupNames?: Record<string, string>;
}

export interface SyncResult {
  created: number;
  skipped: number;
  updated: number;
  errors: string[];
}

/**
 * Sync Entra users into the local DB.
 * - Deduplicates by email (case-insensitive).
 * - Creates placeholder users (did = "entra:{uuid}") for new accounts.
 * - Assigns users to realms based on groupRealmMap.
 */
export async function syncEntraUsers(opts: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = { created: 0, skipped: 0, updated: 0, errors: [] };

  // ── Resolve __create__ sentinels into real realm IDs ──────────────────────
  // Build a resolved copy of groupRealmMap with actual realm IDs.
  const resolvedRealmMap: Record<string, string> = {};
  for (const [gid, value] of Object.entries(opts.groupRealmMap)) {
    if (value !== CREATE_REALM_SENTINEL) {
      resolvedRealmMap[gid] = value;
      continue;
    }

    const groupName = opts.groupNames?.[gid] ?? gid;
    const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Reuse an existing realm with the same slug to keep the operation idempotent.
    const existing = getRealmBySlug(slug);
    if (existing) {
      resolvedRealmMap[gid] = existing.id;
    } else {
      const realm = createRealm({ name: groupName, slug });
      resolvedRealmMap[gid] = realm.id;
    }
  }

  // Collect members per group (or all users if no groups specified)
  const membersByGroup = new Map<string, EntraMember[]>();
  if (opts.groupIds.length > 0) {
    await Promise.all(
      opts.groupIds.map(async (gid) => {
        try {
          membersByGroup.set(gid, await listGroupMembers(gid));
        } catch (err) {
          result.errors.push(`Group ${gid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  } else {
    membersByGroup.set("__all__", await listAllEntraUsers());
  }

  // Deduplicate across groups by Entra object ID
  const seen = new Map<string, { member: EntraMember; groupIds: string[] }>();
  for (const [gid, members] of membersByGroup) {
    for (const m of members) {
      const entry = seen.get(m.id);
      if (entry) {
        if (gid !== "__all__") entry.groupIds.push(gid);
      } else {
        seen.set(m.id, { member: m, groupIds: gid === "__all__" ? [] : [gid] });
      }
    }
  }

  for (const { member, groupIds } of seen.values()) {
    const email = member.mail ?? member.userPrincipalName ?? null;

    try {
      // Check for existing user by Entra ID first, then by email
      let existing = UserDao.getByEntraId(member.id);
      if (!existing && email) existing = UserDao.getByEmail(email);

      if (existing) {
        // Update entra_id link if missing
        if (!existing.entra_id) {
          UserDao.linkEntraIdentity(existing.id, member.id, member.displayName ?? null, email);
          result.updated++;
        } else {
          UserDao.refreshEntraIdentity(member.id, member.displayName ?? null, email);
          result.skipped++;
        }
        // Assign to realm(s)
        for (const gid of groupIds) {
          const realmId = resolvedRealmMap[gid];
          if (realmId) {
            try { addUserToRealm(existing.id, realmId); } catch { /* already member */ }
          }
        }
        continue;
      }

      // Create new placeholder user (did = NULL until they claim via QR)
      const user = UserDao.createFromEntra(member.id, member.displayName ?? null, email);
      result.created++;

      // Assign to realm(s)
      for (const gid of groupIds) {
        const realmId = resolvedRealmMap[gid];
        if (realmId) {
          try { addUserToRealm(user.id, realmId); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      result.errors.push(
        `User ${member.displayName ?? member.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
