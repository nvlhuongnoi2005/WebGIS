import { useEffect } from "react";

import type { MutableRefObject } from "react";
import type * as maplibregl from "maplibre-gl";

import {
  syncOverlayLayers,
  type OverlayLayerId,
} from "../tools/MapOverlayTool";

interface UseOverlayLayersOptions {
  map: MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
  activeOverlayLayers: OverlayLayerId[];
}

export function useOverlayLayers({
  map,
  mapLoaded,
  mapStyleVersion,
  activeOverlayLayers,
}: UseOverlayLayersOptions) {
  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    syncOverlayLayers(map.current, activeOverlayLayers);
  }, [
    map,
    mapLoaded,
    mapStyleVersion,
    activeOverlayLayers,
  ]);
}
