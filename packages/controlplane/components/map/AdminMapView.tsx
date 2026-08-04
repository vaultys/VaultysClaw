"use client";

import { useRouter } from "next/navigation";
import { WorldMap } from "./WorldMap";
import { setActorLocationAction } from "@/app/admin/actors/actions";
import type { MapMarker } from "./world-map/types";

export function AdminMapView({ markers }: { markers: MapMarker[] }) {
  const router = useRouter();
  return (
    <WorldMap
      markers={markers}
      height={600}
      className="border border-neutral-200/60 rounded-xl overflow-hidden"
      canEditLocation
      onSaveLocation={async (marker, loc) => {
        await setActorLocationAction(marker.id, loc);
        router.refresh(); // re-fetch the server-rendered marker list so the map reflects the edit
      }}
    />
  );
}
