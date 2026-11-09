import { serviceTypeLabel } from "@/lib/apprise";
import { Badge } from "@/components/ui/Badge";

/** The one non-sensitive thing worth showing about a channel's service URLs — the scheme(s), not
 *  the URLs themselves (encrypted, write-only after entry). Empty means either no URL was ever
 *  recognized as a valid apprise:// scheme, or (for a row created before this field existed) it
 *  hasn't been backfilled. */
export default function ServiceTypeBadges({ types }: { types: string[] }) {
  if (types.length === 0) {
    return <span className="text-foreground-500">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <Badge key={t} mono>
          {serviceTypeLabel(t)}
        </Badge>
      ))}
    </div>
  );
}
