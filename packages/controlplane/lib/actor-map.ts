import { ActorDAO } from "@/db";
import { getWSServerInstance } from "./ws-server";
import type { MapMarker } from "@/components/map/world-map/types";

/** Every located Actor, as a map marker — `online` reflects the live WS connection, not a stored
 *  field (the same rule every other "online" indicator in this app follows). */
export async function listActorMapMarkers(): Promise<MapMarker[]> {
  const actors = await ActorDAO.listLocated();
  const ws = getWSServerInstance();
  return actors.map((actor) => ({
    id: actor.did,
    type: actor.kind,
    label: actor.name,
    lat: actor.locationLat!,
    lon: actor.locationLon!,
    online: ws?.isConnected(actor.did),
    meta: { did: actor.did },
  }));
}
