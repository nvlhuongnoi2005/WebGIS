import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Map } from "maplibre-gl";
import { useTranslation } from "react-i18next";
import { setMapLanguage } from "../tools/map/MapLanguageTool";

interface UseMapLanguageOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
}

export function useMapLanguage({
  map,
  mapLoaded,
  mapStyleVersion,
}: UseMapLanguageOptions) {
  const { i18n } = useTranslation();
  const currentLang = (
    i18n.resolvedLanguage ||
    i18n.language ||
    "vi"
  ).startsWith("vi")
    ? "vi"
    : "en";

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    const mapInstance = map.current;

    const applyLanguage = () => {
      setMapLanguage(mapInstance, currentLang);
    };

    if (mapInstance.isStyleLoaded()) {
      applyLanguage();
    }

    mapInstance.on("style.load", applyLanguage);

    return () => {
      mapInstance.off("style.load", applyLanguage);
    };
  }, [currentLang, map, mapLoaded, mapStyleVersion]);
}
