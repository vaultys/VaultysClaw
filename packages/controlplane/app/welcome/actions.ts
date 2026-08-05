"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { ActorDAO, UserDAO } from "@/db";
import { recordEvent } from "@/lib/audit";
import { actorPayload, actorAdminUrl, diffFields } from "@/lib/webhook-payloads";

/** The one-time first-login profile-completion prompt (app/welcome/page.tsx) — a human setting
 *  their own name/email, not an admin editing someone else's, but recorded through the same
 *  `actor.updated` event (it genuinely is one) so it shows up in the Audit Log like any other
 *  profile change. */
export async function completeProfileAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  const did = session.user.did;

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  if (!name) throw new Error("Name is required");

  const actor = await ActorDAO.findByDid(did);
  if (!actor || actor.kind !== "human") throw new Error("Not a human Actor");

  const beforeEmail = (await UserDAO.findByDid(did))?.humanProfile?.email ?? null;
  const updated = await ActorDAO.update(did, { name });
  await UserDAO.updateEmail(did, email);
  await UserDAO.markProfileCompleted(did);

  const changes = [
    ...diffFields(actor, updated, ["name"]),
    ...diffFields({ email: beforeEmail }, { email }, ["email"]),
  ];
  const performedBy = { did, name: updated.name };
  await recordEvent({
    eventType: "actor.updated",
    payload: { ...actorPayload(updated), performedBy, adminUrl: actorAdminUrl(did), changes },
    performedBy,
    targetType: "actor",
    targetId: did,
  });

  redirect("/");
}

/** Explicitly skipping — no profile change to record, just marks the prompt done so it doesn't
 *  reappear every login. */
export async function skipProfileAction(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");
  await UserDAO.markProfileCompleted(session.user.did);
  redirect("/");
}
