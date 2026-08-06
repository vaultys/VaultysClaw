"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import {
  approvePendingRegistration,
  denyPendingRegistration,
} from "@/lib/registrations";
import { ActorDAO, ActorLinkDAO, UserDAO, InvitationDAO } from "@/db";
import { encodeDidParam } from "@/lib/actor-route";
import { geocodeCity } from "@/lib/geocode";
import { recordEvent } from "@/lib/audit";
import {
  actorPayload,
  actorAdminUrl,
  buildAdminUrl,
  diffFields,
  proxyConfigPayload,
} from "@/lib/webhook-payloads";
import { parseProxyKindConfig, type ProxyKindConfig } from "@/lib/proxy-kind";
import { getWSServerInstance } from "@/lib/ws-server";
import type { ProxyRule } from "@/lib/proxy-rules";
import type { AgentCapability } from "@vaultysclaw/policy";

const EXPIRY_PRESET_MS: Record<string, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** "Reveal once" pattern (app/admin/integrations/actions.ts's createWebhookAction) — the raw
 *  invite link is only ever returned here, directly to the calling Client Component, never
 *  persisted or round-tripped through a URL/redirect. */
export async function createInvitationAction(
  formData: FormData
): Promise<{ url: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const workspaceId = (formData.get("workspaceId") as string) || null;
  const capabilities = formData.getAll("capabilities") as AgentCapability[];
  const expiryPreset = (formData.get("expiryPreset") as string) || "7d";
  if (!name) throw new Error("Name is required");

  const expiresAt = new Date(
    Date.now() + (EXPIRY_PRESET_MS[expiryPreset] ?? EXPIRY_PRESET_MS["7d"])
  );

  const { invitation, rawToken } = await InvitationDAO.create({
    name,
    email,
    capabilities,
    workspaceId,
    createdBy: session.user.did,
    expiresAt,
  });

  const performedBy = {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  };
  await recordEvent({
    eventType: "human.invited",
    payload: {
      name: invitation.name,
      email: invitation.email,
      workspaceId: invitation.workspaceId,
      expiresAt: invitation.expiresAt,
      createdBy: invitation.createdBy,
      performedBy,
    },
    performedBy,
  });

  return { url: buildAdminUrl(`/invite/${rawToken}`) ?? `/invite/${rawToken}` };
}

export async function approveRegistrationAction(
  formData: FormData
): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const registrationId = formData.get("registrationId") as string;
  const capabilities = formData.getAll("capabilities") as AgentCapability[];

  await approvePendingRegistration(registrationId, capabilities, {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  });
  revalidatePath("/admin/actors");
  revalidatePath("/admin");
}

export async function denyRegistrationAction(
  formData: FormData
): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const registrationId = formData.get("registrationId") as string;
  await denyPendingRegistration(registrationId, {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  });
  revalidatePath("/admin/actors");
  revalidatePath("/admin");
}

/** Edits an Actor's own record — name/workspace for any kind, email additionally for humans
 *  (`User` is a 1:1 profile extension, see `packages/controlplane/CLAUDE.md`'s Actor/User note),
 *  and `ownerDid` ("belongs to / acts for") for any non-human kind. */
export async function updateActorAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const did = formData.get("did") as string;
  const name = (formData.get("name") as string)?.trim();
  const workspaceId = (formData.get("workspaceId") as string) || null;
  const ownerDid = (formData.get("ownerDid") as string) || null;
  if (!did || !name) throw new Error("Name is required");
  if (ownerDid === did) throw new Error("An Actor can't be its own owner");

  const actor = await ActorDAO.findByDid(did);
  if (!actor) throw new Error("Actor not found");

  const updated = await ActorDAO.update(did, { name, workspaceId, ownerDid });
  const changes = diffFields(actor, updated, [
    "name",
    "workspaceId",
    "ownerDid",
  ]);

  if (actor.kind === "human") {
    const beforeEmail =
      (await UserDAO.findByDid(did))?.humanProfile?.email ?? null;
    const email = (formData.get("email") as string)?.trim();
    await UserDAO.updateEmail(did, email || null);
    changes.push(
      ...diffFields({ email: beforeEmail }, { email: email || null }, ["email"])
    );
    // An admin fixing up a human's profile counts as "done" too — otherwise this human would
    // still hit the first-login prompt (app/welcome) on their next sign-in despite already having
    // a real name here.
    await UserDAO.markProfileCompleted(did);
  }
  const performedBy = {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  };
  await recordEvent({
    eventType: "actor.updated",
    payload: {
      ...actorPayload(updated),
      performedBy,
      adminUrl: actorAdminUrl(updated.did),
      changes,
    },
    performedBy,
    targetType: "actor",
    targetId: updated.did,
  });

  revalidatePath(`/admin/actors/${encodeDidParam(did)}`);
  revalidatePath("/admin/actors");
}

async function saveActorLocation(
  did: string,
  location: { lat: number; lon: number; label: string } | null
): Promise<void> {
  await ActorDAO.updateLocation(did, location);
  revalidatePath(`/admin/actors/${encodeDidParam(did)}`);
  revalidatePath("/admin/actors");
  revalidatePath("/admin/map");
}

/** The map page's pin editor calls this directly (a client component invoking a Server Action) —
 *  geocoding stays server-side so it can set Nominatim's required identifying User-Agent, which a
 *  browser fetch can't do (see lib/geocode.ts). */
export async function resolveCityLocationAction(
  city: string
): Promise<{ lat: number; lon: number; label: string } | null> {
  return geocodeCity(city);
}

/** Callable directly from a client component (the map page's pin editor), not just a `<form>` —
 *  Server Actions accept any serializable arguments, not only FormData. */
export async function setActorLocationAction(
  did: string,
  location: { lat: number; lon: number; label: string } | null
): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  await saveActorLocation(did, location);
}

/** The Actor detail page's plain-form equivalent — `mode` picks which of the three sub-forms
 *  (look up by city, set exact coordinates, clear) was submitted. */
export async function setActorLocationFormAction(
  formData: FormData
): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const did = formData.get("did") as string;
  const mode = formData.get("mode") as string;
  if (!did) throw new Error("Actor is required");

  if (mode === "clear") {
    await saveActorLocation(did, null);
    return;
  }

  if (mode === "city") {
    const city = (formData.get("city") as string)?.trim();
    if (!city) throw new Error("City name is required");
    const result = await geocodeCity(city);
    if (!result)
      throw new Error(
        "City not found — try a more specific name or set coordinates directly"
      );
    await saveActorLocation(did, result);
    return;
  }

  const lat = parseFloat(formData.get("lat") as string);
  const lon = parseFloat(formData.get("lon") as string);
  if (Number.isNaN(lat) || Number.isNaN(lon))
    throw new Error("Invalid coordinates");
  const label =
    (formData.get("label") as string)?.trim() ||
    `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  await saveActorLocation(did, { lat, lon, label });
}

/** A directed, freely-labeled edge to another Actor ("reports to", "belongs to", ...) —
 *  lib/capabilities.ts-style generic allow-anything, not a fixed relation type. */
export async function addActorLinkAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const fromDid = formData.get("fromDid") as string;
  const toDid = formData.get("toDid") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!fromDid || !toDid || !label)
    throw new Error("From, to, and a label are all required");
  if (fromDid === toDid) throw new Error("An Actor can't link to itself");

  await ActorLinkDAO.create({ fromDid, toDid, label });
  revalidatePath(`/admin/actors/${encodeDidParam(fromDid)}`);
  revalidatePath(`/admin/actors/${encodeDidParam(toDid)}`);
}

export async function deleteActorLinkAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const returnToDid = formData.get("returnToDid") as string;
  await ActorLinkDAO.delete(id);
  if (returnToDid)
    revalidatePath(`/admin/actors/${encodeDidParam(returnToDid)}`);
}

// ─── kind: "proxy" configuration (docs/PROXY_ARCHITECTURE.md §12) ─────────────
// Three narrow actions rather than one form posting the whole config: a rule
// list is easier to edit correctly as add/remove than as an editable JSON blob,
// and it keeps this page free of client-side state like every other section on
// it.
//
// All three go through `parseProxyKindConfig` before writing. That is not
// belt-and-braces: the Go verifier rejects a structurally invalid rule *set*
// rather than skipping the offending rule — because silently dropping a `deny`
// would widen access — so one bad rule disables the whole set on every host that
// loads it. Validating on save turns a fleet-wide loss of enforcement into a
// form error.

/** Load and validate a proxy's current config, refusing non-proxy Actors. */
async function loadProxyConfig(did: string): Promise<ProxyKindConfig> {
  const actor = await ActorDAO.findByDid(did);
  if (!actor) throw new Error("Actor not found");
  if (actor.kind !== "proxy") {
    throw new Error(`Actor ${did} is kind "${actor.kind}", not "proxy"`);
  }
  return parseProxyKindConfig(actor.kindConfig);
}

/**
 * Persist a config, record it, and push it.
 *
 * The push is best-effort by design: a connected proxy applies the change now, a
 * disconnected one picks it up on its next reconnect, and either way it keeps
 * enforcing its last *verified* config in the meantime. The panel reads the same
 * live connection map to tell the admin which of the two just happened, rather
 * than implying immediacy that may not hold.
 *
 * `recordEvent` is awaited and comes *before* the push, unlike the fire-and-forget
 * push itself. Changing what an interception point refuses is one of the most
 * consequential actions in this admin console, and an unrecorded one is
 * indistinguishable from no change at all — for a governance product that is
 * worse than the change failing. (An earlier version of this function omitted it
 * entirely: the rules changed, the proxy was updated, and the Audit Log and every
 * webhook subscriber saw nothing.)
 */
async function saveProxyConfig(
  did: string,
  config: ProxyKindConfig,
  performedBy: { did: string; name: string }
): Promise<void> {
  // Read the previous config first so the audit entry can say which rule moved,
  // not merely that something did.
  const actor = await ActorDAO.findByDid(did);
  const before = actor ? parseProxyKindConfig(actor.kindConfig) : null;

  await ActorDAO.mergeKindConfig(did, { ...config });

  await recordEvent({
    eventType: "proxy.config_updated",
    payload: {
      ...proxyConfigPayload(actor ?? { did }, before, config),
      performedBy,
      adminUrl: actorAdminUrl(did),
    },
    performedBy,
    targetType: "actor",
    targetId: did,
  });

  await getWSServerInstance()?.pushActorConfig(did);
  revalidatePath(`/admin/actors/${encodeDidParam(did)}`);
  revalidatePath("/admin/audit");
}

/**
 * Both proxy-config actions return `{ error }` rather than throwing on a
 * validation failure.
 *
 * A Server Action that throws renders Next.js's generic "A server error
 * occurred" page, which discards the message — so the whole point of validating
 * carefully (telling an admin *why* a wildcard host is refused, and what the
 * verifier accepts instead) would never reach them. Found by driving this panel
 * in a real browser: the rule was correctly rejected and an opaque error page
 * was all that showed. The caller is a Client Component that renders the string
 * inline, the same pattern `NewWebhookForm.tsx` uses to surface a one-time
 * secret.
 */
export interface ProxyActionResult {
  error?: string;
}

export async function updateProxySettingsAction(
  formData: FormData
): Promise<ProxyActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  const performedBy = {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  };

  const did = formData.get("did") as string;

  try {
    const config = await loadProxyConfig(did);

    const mode = formData.get("mode") as string;
    if (mode !== "explicit" && mode !== "system")
      return { error: "Invalid mode" };

    const rawAge = (formData.get("maxStatusAgeSeconds") as string)?.trim();
    const maxStatusAgeSeconds = Number(rawAge);
    if (!Number.isInteger(maxStatusAgeSeconds)) {
      return {
        error:
          "Max status age must be a whole number of seconds (negative for unbounded)",
      };
    }

    const listenAddr = (formData.get("listenAddr") as string)?.trim();

    await saveProxyConfig(
      did,
      {
        ...config,
        mode,
        maxStatusAgeSeconds,
        ...(listenAddr ? { listenAddr } : {}),
      },
      performedBy
    );
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addProxyRuleAction(
  formData: FormData
): Promise<ProxyActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  const performedBy = {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  };

  const did = formData.get("did") as string;

  try {
    const config = await loadProxyConfig(did);

    const subject = formData.get("subject") as ProxyRule["subject"];
    const effect = formData.get("effect") as ProxyRule["effect"];
    const id = (formData.get("id") as string)?.trim();
    const workloadId = (formData.get("workloadId") as string)?.trim();

    // Hosts and ports are entered as free text — one per line or comma-separated,
    // whichever an admin reaches for.
    const hosts = splitList(formData.get("hosts") as string);
    const ports = splitList(formData.get("ports") as string).map(Number);
    if (ports.some((p) => !Number.isInteger(p))) {
      return { error: "Ports must be whole numbers" };
    }

    const rule: ProxyRule = {
      id,
      subject,
      hosts,
      effect,
      ...(workloadId ? { workloadId } : {}),
      ...(ports.length > 0 ? { ports } : {}),
    };

    // parseProxyKindConfig validates the whole set, so a rule that would break the
    // set is rejected here with the verifier's own reasoning.
    await saveProxyConfig(
      did,
      parseProxyKindConfig({ ...config, rules: [...config.rules, rule] }),
      performedBy
    );
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteProxyRuleAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  const performedBy = {
    did: session.user.did,
    name: session.user.name ?? "Unnamed",
  };

  const did = formData.get("did") as string;
  const ruleId = formData.get("ruleId") as string;
  const config = await loadProxyConfig(did);

  await saveProxyConfig(
    did,
    { ...config, rules: config.rules.filter((r) => r.id !== ruleId) },
    performedBy
  );
}

/** Split a textarea/input value on newlines or commas, dropping blanks. */
function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
