/**
 * managed / observed / shadow (vaultysclaw-sensor/docs/vaultysclaw-integration.md §4). The sensor
 * only ever reports observations and identity evidence — it never gets to self-report "I am
 * managed"; deciding organizational ownership is this control plane's job, by correlating a
 * workload's `identityEvidence` (a DID the sensor found locally, e.g. from an
 * operator-configured `agentIdentityPath`) against the real `Actor` table.
 */
import { ActorDAO } from "@/db";
import { SHADOW_THRESHOLD } from "@/db";
import type { Actor, SensorWorkload } from "@prisma/client";

export type WorkloadStatus = "managed" | "observed" | "shadow";

/** Resolves which of `workloads`' `identityEvidence` values are actually real, registered,
 *  non-sensor Actors, keyed by DID for a name/link lookup — a sensor's own DID never counts as
 *  "managing" a workload it observed on itself. Batched (one query), not N+1 per workload. */
export async function resolveManagingActors(
  workloads: Array<Pick<SensorWorkload, "identityEvidence">>
): Promise<Map<string, Actor>> {
  const candidates = [...new Set(workloads.map((w) => w.identityEvidence).filter((d): d is string => !!d))];
  if (candidates.length === 0) return new Map();
  const actors = await ActorDAO.findManyByDid(candidates);
  return new Map(actors.filter((a) => a.kind !== "sensor").map((a) => [a.did, a]));
}

/** managingActors is the pre-resolved output of resolveManagingActors — pass it in rather than
 *  re-querying per workload. */
export function computeWorkloadStatus(
  workload: Pick<SensorWorkload, "agentConfidence" | "identityEvidence">,
  managingActors: ReadonlyMap<string, Actor>
): WorkloadStatus {
  if (workload.identityEvidence && managingActors.has(workload.identityEvidence)) return "managed";
  return workload.agentConfidence >= SHADOW_THRESHOLD ? "shadow" : "observed";
}
