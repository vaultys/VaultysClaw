import PageChrome from "@/components/layout/PageChrome";
import { AdminMapView } from "@/components/map/AdminMapView";
import { listActorMapMarkers } from "@/lib/actor-map";
import { MARKER_TYPES, typeColor } from "@/components/map/world-map/types";

/**
 * World map (docs/PAGE_DESIGN.md — ported from packages/control-plane's OpenLayers map): every
 * located Actor as a pin, clustered when zoomed out. Click a pin to see it, or (admin) set/change
 * its location right from the map — the same action the Actor detail page's location form uses.
 */
export default async function MapPage() {
  const markers = await listActorMapMarkers();

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Map",
          description: `${markers.length} located actor${markers.length === 1 ? "" : "s"}`,
        }}
        breadcrumbs={[{ label: "Map" }]}
      />

      <div className="flex items-center gap-4 text-xs text-foreground-500">
        {MARKER_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className="w-2 h-2 rounded-full" style={{ background: typeColor(type) }} />
            {type}
          </span>
        ))}
      </div>

      {markers.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center">
          <h2 className="text-sm font-semibold text-foreground mb-1">No located actors yet</h2>
          <p className="text-sm text-foreground-500">
            Set a location from any Actor&apos;s detail page (by city name or exact coordinates) to
            see it here.
          </p>
        </div>
      ) : (
        <AdminMapView markers={markers} />
      )}
    </div>
  );
}
