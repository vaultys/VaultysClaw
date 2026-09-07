"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SsoConnectionDAO } from "@/db";
import { encryptSecret } from "@/lib/vault";
import { requireAdmin } from "@/lib/require-admin";
import { recordEvent } from "@/lib/audit";
import { buildAdminUrl, diffFields } from "@/lib/webhook-payloads";
import {
  entraIssuer,
  isSsoKind,
  issuerMismatch,
  normalizeIssuer,
  testClientCredentials,
  testDiscovery,
} from "@/lib/sso-config";
import { decryptSecret } from "@/lib/vault";
import type { ClientCheckVerdict } from "@/lib/sso-config";
import type { SsoConnection } from "@prisma/client";

/**
 * Identity (SSO) connections. In its own file rather than appended to the tab's
 * shared `actions.ts` because, unlike Webhooks/Channels/Models, these actions
 * change **how people sign in** — a broken row here locks users out rather than
 * degrading a feature — and that is worth keeping visibly separate.
 *
 * No `sso.*` webhook events exist in the shared catalog, and inventing some here
 * would mean emitting events packages/control-plane's catalog doesn't define
 * (the rule stated in the Model Registry section). These are audited via
 * `recordEvent` with existing generic plumbing instead — the audit row is what
 * matters for a config change of this weight, and it deliberately never carries
 * the client secret.
 */

/** Where the issuer comes from depends on the kind: Entra derives it from the
 *  tenant so an admin can't paste a subtly wrong Microsoft URL. */
function resolveIssuer(kind: string, formData: FormData): string {
  if (kind === "entra") {
    const tenantId = (formData.get("tenantId") as string)?.trim();
    if (!tenantId) throw new Error("Tenant ID is required for Microsoft Entra ID");
    return entraIssuer(tenantId);
  }
  const issuer = (formData.get("issuer") as string)?.trim();
  if (!issuer) throw new Error("Issuer URL is required");
  return normalizeIssuer(issuer);
}

/** The audit payload for a connection — never includes `clientSecretEnc`. */
function connectionPayload(c: SsoConnection): Record<string, unknown> {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    issuer: c.issuer,
    clientId: c.clientId,
    tenantId: c.tenantId,
    isActive: c.isActive,
  };
}

export async function createSsoConnectionAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const kind = (formData.get("kind") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string)?.trim();
  const clientSecret = (formData.get("clientSecret") as string)?.trim();
  const tenantId = (formData.get("tenantId") as string)?.trim() || null;

  if (!isSsoKind(kind)) throw new Error(`Unknown connection type: ${kind}`);
  if (!name || !clientId || !clientSecret) {
    throw new Error("Name, client ID and client secret are required");
  }
  const issuer = resolveIssuer(kind, formData);

  // Refuse to save a connection that can't possibly work. Unlike a webhook URL
  // (which may legitimately not exist yet) an IdP is live infrastructure, and a
  // connection saved against a bad issuer produces a login button that fails
  // only for whoever clicks it first.
  const discovery = await testDiscovery(issuer);
  if (!discovery.ok) {
    throw new Error(`Could not verify the IdP at ${issuer}: ${discovery.error}`);
  }

  // Discovery only proves the *issuer* is real. Client credentials are what fail
  // at the token endpoint, after the person has already been bounced through the
  // IdP — so they get checked here too, or a connection saves clean and breaks
  // for whoever signs in first (see `testClientCredentials`).
  const client = await testClientCredentials(issuer, clientId, clientSecret);
  if (client.verdict === "rejected") {
    throw new Error(`Client credentials were not accepted by ${issuer}: ${client.detail}`);
  }

  const connection = await SsoConnectionDAO.create({
    kind,
    name,
    issuer,
    clientId,
    clientSecretEnc: await encryptSecret(clientSecret),
    tenantId: kind === "entra" ? tenantId : null,
    createdBy: performedBy.did,
  });

  await recordEvent({
    eventType: "actor.updated",
    payload: {
      ssoConnection: connectionPayload(connection),
      action: "sso_connection_created",
      performedBy,
      adminUrl: buildAdminUrl("/admin/integrations?tab=identity"),
    },
    performedBy,
    targetType: "sso_connection",
    targetId: connection.id,
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=identity");
}

export async function updateSsoConnectionAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string)?.trim();
  // Blank means "keep the current secret" — same write-only convention as every
  // other admin-supplied credential in this package.
  const clientSecret = (formData.get("clientSecret") as string)?.trim();
  const tenantId = (formData.get("tenantId") as string)?.trim() || null;

  const before = await SsoConnectionDAO.findById(id);
  if (!before) throw new Error("Connection not found");
  if (!name || !clientId) throw new Error("Name and client ID are required");

  const issuer = resolveIssuer(before.kind, formData);
  if (issuer !== before.issuer) {
    const discovery = await testDiscovery(issuer);
    if (!discovery.ok) {
      throw new Error(`Could not verify the IdP at ${issuer}: ${discovery.error}`);
    }
  }

  // Re-checked whenever any part of the triple changes — a new secret, a renamed
  // client, or a re-pointed issuer can each invalidate the other two. Uses the
  // stored secret when the write-only field was left blank, so an edit that only
  // fixes the client ID is still verified against the real secret.
  if (clientSecret || clientId !== before.clientId || issuer !== before.issuer) {
    const effectiveSecret = clientSecret || (await decryptSecret(before.clientSecretEnc));
    const client = await testClientCredentials(issuer, clientId, effectiveSecret);
    if (client.verdict === "rejected") {
      throw new Error(`Client credentials were not accepted by ${issuer}: ${client.detail}`);
    }
  }

  const updated = await SsoConnectionDAO.update(id, {
    name,
    issuer,
    clientId,
    tenantId: before.kind === "entra" ? tenantId : null,
    ...(clientSecret ? { clientSecretEnc: await encryptSecret(clientSecret) } : {}),
  });

  const changes = diffFields(
    before as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ["name", "issuer", "clientId", "tenantId", "isActive"]
  );
  if (clientSecret) changes.push({ field: "clientSecret", from: "***", to: "***" });

  await recordEvent({
    eventType: "actor.updated",
    payload: {
      ssoConnection: connectionPayload(updated),
      action: "sso_connection_updated",
      changes,
      performedBy,
      adminUrl: buildAdminUrl("/admin/integrations?tab=identity"),
    },
    performedBy,
    targetType: "sso_connection",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=identity");
}

export async function toggleSsoConnectionAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";
  const before = await SsoConnectionDAO.findById(id);
  if (!before) throw new Error("Connection not found");

  const updated = await SsoConnectionDAO.update(id, { isActive });

  await recordEvent({
    eventType: "actor.updated",
    payload: {
      ssoConnection: connectionPayload(updated),
      action: isActive ? "sso_connection_enabled" : "sso_connection_disabled",
      performedBy,
      adminUrl: buildAdminUrl("/admin/integrations?tab=identity"),
    },
    performedBy,
    targetType: "sso_connection",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
}

export async function deleteSsoConnectionAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const connection = await SsoConnectionDAO.findById(id);
  if (!connection) return;

  // The bound identities cascade away with the connection (schema), which
  // deliberately does NOT delete the Actors themselves — those humans keep their
  // DIDs, certificates and wallet login. They just lose this route in. Saying so
  // in the audit entry matters, because "deleted the SSO connection" and
  // "removed those people" are very different facts.
  const boundCount = await SsoConnectionDAO.boundIdentityCount(id);
  await SsoConnectionDAO.delete(id);

  await recordEvent({
    eventType: "actor.updated",
    payload: {
      ssoConnection: connectionPayload(connection),
      action: "sso_connection_deleted",
      unboundIdentities: boundCount,
      note: "Actors keep their DIDs and certificates; only this sign-in route was removed.",
      performedBy,
      adminUrl: buildAdminUrl("/admin/integrations?tab=identity"),
    },
    performedBy,
    targetType: "sso_connection",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
}

/**
 * Live pre-save check from the form: the IdP's discovery document, and — when the
 * form has credentials to check — whether those credentials actually authenticate.
 *
 * Returns its findings rather than throwing them, and that is load-bearing: a
 * production Next.js build redacts Server Action error messages, so the save-time
 * `throw`s above reach an admin as "Minified React error". This is the path that
 * can actually *tell* someone their client secret is wrong.
 *
 * Admin-gated like every other action here — it makes the server fetch a
 * caller-supplied URL, and now POST to one.
 */
export async function testSsoConnectionAction(
  kind: string,
  issuerOrTenant: string,
  clientId?: string,
  clientSecret?: string,
  connectionId?: string
): Promise<{
  ok: boolean;
  issuer: string;
  error?: string;
  documentIssuer?: string;
  client?: { verdict: ClientCheckVerdict; detail: string };
}> {
  await requireAdmin();
  if (!issuerOrTenant.trim()) {
    return { ok: false, issuer: "", error: kind === "entra" ? "No tenant ID" : "No issuer URL" };
  }
  const issuer = kind === "entra" ? entraIssuer(issuerOrTenant) : normalizeIssuer(issuerOrTenant);
  const discovery = await testDiscovery(issuer);
  if (!discovery.ok) return { ok: false, issuer, error: discovery.error };
  // Only reported when it actually differs, so the form can render it as a plain
  // "there is something to know" line rather than a field that is always present.
  const documentIssuer = issuerMismatch(issuer, discovery.documentIssuer)
    ? discovery.documentIssuer
    : undefined;

  // On an edit the secret field is blank when unchanged, so fall back to the
  // stored one — otherwise "Test connection" could only ever check a connection
  // whose secret you were in the middle of retyping.
  let secret = clientSecret?.trim() ?? "";
  if (!secret && connectionId) {
    const existing = await SsoConnectionDAO.findById(connectionId);
    if (existing) {
      try {
        secret = await decryptSecret(existing.clientSecretEnc);
      } catch {
        return {
          ok: true,
          issuer,
          documentIssuer,
          client: { verdict: "inconclusive", detail: "Stored client secret could not be decrypted" },
        };
      }
    }
  }

  if (!clientId?.trim() || !secret) return { ok: true, issuer, documentIssuer };
  return {
    ok: true,
    issuer,
    documentIssuer,
    client: await testClientCredentials(issuer, clientId.trim(), secret),
  };
}
