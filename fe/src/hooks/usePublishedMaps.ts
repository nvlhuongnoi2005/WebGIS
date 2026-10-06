import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Map, StyleSpecification } from "maplibre-gl";
import { authFetch } from "../features/auth/authClient";

type Publication = { id: string; name: string; styleUrl: string };

// Published GIS layers are supplied only by the ACL-filtered catalog. Each
// reload of the application fetches the catalog again, so a new grant or
// publication appears without retaining a client-side entitlement cache.
export function usePublishedMaps({
  map,
  mapLoaded,
  mapStyleVersion,
}: {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
}) {
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapLoaded) return;
    let disposed = false;
    const sourceIDs: string[] = [];
    const layerIDs: string[] = [];

    const load = async () => {
      const catalogResponse = await authFetch("/api/maps/catalog");
      if (!catalogResponse.ok || disposed) return;
      const catalog = (await catalogResponse.json()) as { maps?: Publication[] };
      for (const publication of catalog.maps ?? []) {
        const styleResponse = await authFetch(publication.styleUrl);
        if (!styleResponse.ok || disposed) continue;
        const style = (await styleResponse.json()) as StyleSpecification;
        const prefix = `publication-${publication.id}-`;
        for (const [sourceID, source] of Object.entries(style.sources ?? {})) {
          const id = `${prefix}${sourceID}`;
          if (instance.getSource(id)) continue;
          instance.addSource(id, source as never);
          sourceIDs.push(id);
        }
        for (const layer of style.layers ?? []) {
          const id = `${prefix}${layer.id}`;
          if (instance.getLayer(id)) continue;
          const next = structuredClone(layer) as Record<string, unknown>;
          next.id = id;
          if (typeof next.source === "string") next.source = `${prefix}${next.source}`;
          instance.addLayer(next as never);
          layerIDs.push(id);
        }
      }
    };
    void load().catch(() => undefined);
    return () => {
      disposed = true;
      for (const id of layerIDs.reverse()) if (instance.getLayer(id)) instance.removeLayer(id);
      for (const id of sourceIDs.reverse()) if (instance.getSource(id)) instance.removeSource(id);
    };
  }, [map, mapLoaded, mapStyleVersion]);
}
