import { serviceTypeLabel } from "@/lib/apprise";

/** The one non-sensitive thing worth showing about a channel's service URLs — the scheme(s), not
 *  the URLs themselves (encrypted, write-only after entry). Empty means either no URL was ever
 *  recognized as a valid apprise:// scheme, or (for a row created before this field existed) it
 *  hasn't been backfilled. */
export default function ServiceTypeBadges({ types }: { types: string[] }) {
  if (types.length === 0) {
    return <span className="text-foreground-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <span
          key={t}
          className="text-xs px-2 py-0.5 rounded-full border bg-secondary-100 text-secondary-700 border-secondary-200"
        >
          {serviceTypeLabel(t)}
        </span>
      ))}
    </div>
  );
}
