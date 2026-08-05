"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { approvePendingRegistration, denyPendingRegistration } from "@/lib/registrations";
import { ActorDAO, ActorLinkDAO, UserDAO } from "@/db";
import { encodeDidParam } from "@/lib/actor-route";
import { geocodeCity } from "@/lib/geocode";
import { recordEvent } from "@/lib/audit";
import { actorPayload, actorAdminUrl, diffFields } from "@/lib/webhook-payloads";
import type { AgentCapability } from "@vaultysclaw/policy";

export async function approveRegistrationAction(formData: FormData): Promise<void> {
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

export async function denyRegistrationAction(formData: FormData): Promise<void> {
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
 *  (`User` is a 1:1 profile extension, see `packages/controlplane/CLAUDE.md`'s Actor/User note). */
export async function updateActorAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const did = formData.get("did") as string;
  const name = (formData.get("name") as string)?.trim();
  const workspaceId = (formData.get("workspaceId") as string) || null;
  if (!did || !name) throw new Error("Name is required");

  const actor = await ActorDAO.findByDid(did);
  if (!actor) throw new Error("Actor not found");

  const updated = await ActorDAO.update(did, { name, workspaceId });
  const changes = diffFields(actor, updated, ["name", "workspaceId"]);

  if (actor.kind === "human") {
    const beforeEmail = (await UserDAO.findByDid(did))?.humanProfile?.email ?? null;
    const email = (formData.get("email") as string)?.trim();
    await UserDAO.updateEmail(did, email || null);
    changes.push(...diffFields({ email: beforeEmail }, { email: email || null }, ["email"]));
  }
  const performedBy = { did: session.user.did, name: session.user.name ?? "Unnamed" };
  await recordEvent({
    eventType: "actor.updated",
    payload: { ...actorPayload(updated), performedBy, adminUrl: actorAdminUrl(updated.did), changes },
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
export async function setActorLocationFormAction(formData: FormData): Promise<void> {
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
    if (!result) throw new Error("City not found — try a more specific name or set coordinates directly");
    await saveActorLocation(did, result);
    return;
  }

  const lat = parseFloat(formData.get("lat") as string);
  const lon = parseFloat(formData.get("lon") as string);
  if (Number.isNaN(lat) || Number.isNaN(lon)) throw new Error("Invalid coordinates");
  const label = (formData.get("label") as string)?.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
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
  if (!fromDid || !toDid || !label) throw new Error("From, to, and a label are all required");
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
  if (returnToDid) revalidatePath(`/admin/actors/${encodeDidParam(returnToDid)}`);
}
