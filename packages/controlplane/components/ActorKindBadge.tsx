import { getActorKindMeta } from "@/lib/actor-kinds";
import { Badge } from "@/components/ui/Badge";

export function ActorKindBadge({ kind }: { kind: string }) {
  const meta = getActorKindMeta(kind);
  return <Badge tone={meta.enforces ? "negative" : "neutral"}>{meta.label}</Badge>;
}
