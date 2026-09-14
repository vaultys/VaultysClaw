import type { KillSwitch } from "@prisma/client";
import { prisma } from "./client";

/** The `id` of the org-wide switch. A per-workspace one uses the workspace's own id. */
export const GLOBAL_KILL_SWITCH_ID = "global";

/**
 * The emergency, reversible suspension of authorization (see the model in
 * `schema.prisma` and the predicate in `lib/kill-switch.ts`).
 *
 * **A row's existence is the whole state**: armed means present, disarmed means
 * gone. There is deliberately no `disarmedAt` column — arm/disarm history is an
 * audit-log concern (`killswitch.armed` / `killswitch.disarmed`), and keeping
 * dead rows here would make the hot-path read "find the newest row that is not
 * yet disarmed" instead of a primary-key lookup.
 *
 * Nothing in this class touches `CapabilityCertificate`. That is the point: the
 * ledger keeps recording what was actually issued, and disarming needs no
 * certificate re-issuance.
 */
export class KillSwitchDAO {
  /** Every armed switch, global and per-workspace, in one read. */
  static async list(): Promise<KillSwitch[]> {
    return prisma.killSwitch.findMany();
  }

  static async findGlobal(): Promise<KillSwitch | null> {
    return prisma.killSwitch.findUnique({ where: { id: GLOBAL_KILL_SWITCH_ID } });
  }

  static async findByWorkspace(workspaceId: string): Promise<KillSwitch | null> {
    return prisma.killSwitch.findUnique({ where: { workspaceId } });
  }

  /**
   * Arm a switch, or refresh the reason/author of one already armed.
   *
   * An upsert rather than a create so re-arming an already-armed scope is not an
   * error an admin has to reason about mid-incident — it just records the newer
   * reason and moves on.
   */
  static async arm(data: {
    id: string;
    scopeType: "global" | "workspace";
    workspaceId: string | null;
    reason: string;
    armedBy: string;
  }): Promise<KillSwitch> {
    const { id, ...rest } = data;
    return prisma.killSwitch.upsert({
      where: { id },
      create: { id, ...rest },
      update: { reason: rest.reason, armedBy: rest.armedBy, armedAt: new Date() },
    });
  }

  /** Disarm. Returns the row that was armed, or null if it already wasn't. */
  static async disarm(id: string): Promise<KillSwitch | null> {
    const existing = await prisma.killSwitch.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.killSwitch.delete({ where: { id } });
    return existing;
  }
}
