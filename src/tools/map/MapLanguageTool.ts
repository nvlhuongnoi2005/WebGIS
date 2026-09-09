import type { ExpressionSpecification, Map } from "maplibre-gl";

export type MapLanguage = "vi" | "en";

export function setMapLanguage(map: Map, lang: MapLanguage) {
  if (!map.isStyleLoaded()) {
    return;
  }

  const style = map.getStyle();
  if (!style || !style.layers) {
    return;
  }

  const isVi = lang === "vi";

  const textFieldExpr: ExpressionSpecification = isVi
    ? [
        "coalesce",
        ["get", "name:vi"],
        ["get", "name_vi"],
        ["get", "name:latin"],
        ["get", "name_en"],
        ["get", "name:en"],
        ["get", "name"],
      ]
    : [
        "coalesce",
        ["get", "name:en"],
        ["get", "name_en"],
        ["get", "name:latin"],
        ["get", "name:vi"],
        ["get", "name:vi"],
        ["get", "name"],
      ];

  for (const layer of style.layers) {
    if (
      layer.type === "symbol" &&
      layer.layout &&
      "text-field" in layer.layout
    ) {
      // Keep application-specific measure or search layers intact
      if (layer.id.startsWith("measure-") || layer.id.startsWith("search-")) {
        continue;
      }

      try {
        map.setLayoutProperty(layer.id, "text-field", textFieldExpr);
      } catch {
        // Silently skip if a layer does not support layout property modification
      }
    }
  }
}
