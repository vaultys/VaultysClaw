import { getActorKindMeta } from "@/lib/actor-kinds";

export function ActorKindBadge({ kind }: { kind: string }) {
  const meta = getActorKindMeta(kind);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.badgeClass}`}>
      {meta.label}
    </span>
  );
}
