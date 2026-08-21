import type * as maplibregl from "maplibre-gl";

export type OverlayLayerId =
  | "labels"
  | "hillshade";

interface OverlayConfig {
  sourceId: string;
  layerId: string;
  maxzoom: number;
  tileSize: number;
  tiles: string[];
  opacity: number;
}

const OVERLAY_CONFIG: Record<OverlayLayerId, OverlayConfig> = {
  labels: {
    sourceId: "overlay-labels-source",
    layerId: "overlay-labels-layer",
    maxzoom: 20,
    tileSize: 256,
    tiles: [
      "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    ],
    opacity: 0.95,
  },
  hillshade: {
    sourceId: "overlay-hillshade-source",
    layerId: "overlay-hillshade-layer",
    maxzoom: 15,
    tileSize: 256,
    tiles: [
      "https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png",
    ],
    opacity: 0.45,
  },
};

export function syncOverlayLayers(
  map: maplibregl.Map,
  activeOverlays: OverlayLayerId[]
) {
  const activeSet = new Set(activeOverlays);

  (Object.keys(OVERLAY_CONFIG) as OverlayLayerId[]).forEach(overlayId => {
    if (activeSet.has(overlayId)) {
      ensureOverlayLayer(map, overlayId);
      return;
    }

    removeOverlayLayer(map, overlayId);
  });
}

function ensureOverlayLayer(
  map: maplibregl.Map,
  overlayId: OverlayLayerId
) {
  const config = OVERLAY_CONFIG[overlayId];

  if (!map.getSource(config.sourceId)) {
    map.addSource(config.sourceId, {
      type: "raster",
      tiles: config.tiles,
      tileSize: config.tileSize,
      maxzoom: config.maxzoom,
      attribution: "Map data overlay",
    });
  }

  if (!map.getLayer(config.layerId)) {
    map.addLayer({
      id: config.layerId,
      type: "raster",
      source: config.sourceId,
      paint: {
        "raster-opacity": config.opacity,
      },
    });
  }
}

function removeOverlayLayer(
  map: maplibregl.Map,
  overlayId: OverlayLayerId
) {
  const config = OVERLAY_CONFIG[overlayId];

  if (map.getLayer(config.layerId)) {
    map.removeLayer(config.layerId);
  }

  if (map.getSource(config.sourceId)) {
    map.removeSource(config.sourceId);
  }
}
