import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  MutableRefObject,
} from "react";
import type { Feature } from "geojson";

import * as maplibregl from "maplibre-gl";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDmsCoordinates } from "../../tools/coordinate/CoordinateTool";
import {
  fetchGeocoding as fetchGeocodingResults,
  fetchGeocodingSuggestions,
  getGeocodingLanguage,
} from "../../tools/geocoding/GeocodingTool";
import type {
  GeocodingFeature,
  GeocodingSuggestion,
} from "../../tools/geocoding/GeocodingTool";
import type { MapTool } from "../../types/map";

export type { GeocodingFeature } from "../../tools/geocoding/GeocodingTool";

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_GEOMETRY_SOURCE = "search-result-geometry";
const SEARCH_GEOMETRY_FILL_LAYER = "search-result-geometry-fill";
const SEARCH_GEOMETRY_LINE_LAYER = "search-result-geometry-line";

type SearchResult = GeocodingFeature | GeocodingSuggestion;

function isGeocodingFeature(result: SearchResult): result is GeocodingFeature {
  return "geometry" in result;
}

interface SearchBarProps {
  activeTool: MapTool;
  map: MutableRefObject<maplibregl.Map | null>;
  onDirections: (coordinates: [number, number]) => void;
  onSearch: () => void;
}

function SearchBar({ activeTool, map, onDirections, onSearch }: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selectedFeature, setSelectedFeature] =
    useState<GeocodingFeature | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const searchCacheRef = useRef<Map<string, SearchResult[]>>(new Map());

  const clearMarker = () => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
  };

  const clearSearchGeometry = () => {
    const currentMap = map.current;
    if (!currentMap) return;

    if (currentMap.getLayer(SEARCH_GEOMETRY_LINE_LAYER)) {
      currentMap.removeLayer(SEARCH_GEOMETRY_LINE_LAYER);
    }
    if (currentMap.getLayer(SEARCH_GEOMETRY_FILL_LAYER)) {
      currentMap.removeLayer(SEARCH_GEOMETRY_FILL_LAYER);
    }
    if (currentMap.getSource(SEARCH_GEOMETRY_SOURCE)) {
      currentMap.removeSource(SEARCH_GEOMETRY_SOURCE);
    }
  };

  const showSearchGeometry = (feature: GeocodingFeature) => {
    const currentMap = map.current;
    if (!currentMap || feature.geometry.type === "Point") return;

    const geometryFeature: Feature = {
      type: "Feature",
      properties: {},
      geometry: feature.geometry,
    };

    currentMap.addSource(SEARCH_GEOMETRY_SOURCE, {
      type: "geojson",
      data: geometryFeature,
    });
    currentMap.addLayer({
      id: SEARCH_GEOMETRY_FILL_LAYER,
      type: "fill",
      source: SEARCH_GEOMETRY_SOURCE,
      paint: {
        "fill-color": "#e0002b",
        "fill-opacity": 0.18,
      },
    });
    currentMap.addLayer({
      id: SEARCH_GEOMETRY_LINE_LAYER,
      type: "line",
      source: SEARCH_GEOMETRY_SOURCE,
      paint: {
        "line-color": "#a90020",
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
  };

  const selectLocation = (
    feature: GeocodingFeature,
    closeActiveTool = true
  ) => {
    if (closeActiveTool) {
      onSearch();
    }

    setQuery(feature.place_name);
    setSelectedFeature(feature);
    setIsOpen(false);

    if (!map.current) {
      return;
    }

    clearMarker();
    clearSearchGeometry();

    const coordinates: [number, number] = feature.center;

    if (feature.bbox) {
      map.current.fitBounds(feature.bbox, {
        padding: 60,
        maxZoom: 16,
        duration: 1200,
      });
    } else if (coordinates) {
      map.current.flyTo({
        center: coordinates,
        zoom: 16,
        duration: 1200,
      });
    }

    showSearchGeometry(feature);

    if (feature.isArea) {
      return;
    }

    if (coordinates) {
      const popupContent = document.createElement("div");
      popupContent.className = "search-popup-container";

      const title = document.createElement("strong");
      title.innerText = feature.text || feature.place_name;
      popupContent.appendChild(title);

      if (feature.place_name && feature.place_name !== feature.text) {
        const desc = document.createElement("div");
        desc.className = "search-popup-desc";
        desc.innerText = feature.context || feature.place_name;
        popupContent.appendChild(desc);
      }

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: true,
        closeOnClick: false,
      })
        .setLngLat(coordinates)
        .setDOMContent(popupContent);

      const marker = new maplibregl.Marker({
        color: "#e0002b",
        anchor: "bottom",
        offset: [0, 6],
        subpixelPositioning: true,
      })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map.current);

      marker.togglePopup();
      searchMarkerRef.current = marker;
    }
  };

  const fetchSuggestions = async (
    searchQuery: string
  ): Promise<SearchResult[]> => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const activeLang = getGeocodingLanguage(
      i18n.resolvedLanguage || i18n.language
    );
    const cacheKey = `${activeLang}:${normalizedQuery}`;
    const cachedResults = searchCacheRef.current.get(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const results = await fetchGeocodingSuggestions(searchQuery, controller.signal);

      searchCacheRef.current.set(cacheKey, results);

      return results;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      // Keep search available while Elasticsearch is rebuilding or unavailable.
      try {
        return await fetchGeocodingResults(searchQuery, activeLang, controller.signal);
      } catch (fallbackError) {
        if (fallbackError instanceof DOMException && fallbackError.name === "AbortError") {
          return [];
        }
        console.error("Search fetch error:", fallbackError);
        return [];
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  };

  const cancelPendingSearch = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  };

  const selectSearchResult = async (
    result: SearchResult,
    closeActiveTool = true
  ) => {
    if (isGeocodingFeature(result)) {
      selectLocation(result, closeActiveTool);
      return;
    }

    setIsLoading(true);
    try {
      const activeLang = getGeocodingLanguage(
        i18n.resolvedLanguage || i18n.language
      );
      // Elasticsearch ranks the suggestion. Nominatim is the source of truth
      // for its geometry, so selecting an area still draws its real polygon.
      const [feature] = await fetchGeocodingResults(result.resolveQuery, activeLang);
      if (feature) {
        selectLocation(feature, closeActiveTool);
      }
    } catch (error) {
      console.error("Suggestion resolution error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setQuery(value);
    setSelectedFeature(null);
    cancelPendingSearch();

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (value.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);

      return;
    }

    setIsLoading(true);

    debounceTimerRef.current = window.setTimeout(async () => {
      const results = await fetchSuggestions(value);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setIsLoading(false);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSearchSubmit = async (event?: FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    onSearch();

    if (!query.trim()) {
      return;
    }

    if (suggestions.length > 0) {
      await selectSearchResult(suggestions[0], false);

      return;
    }

    setIsLoading(true);
    const results = await fetchGeocodingResults(
      query,
      getGeocodingLanguage(i18n.resolvedLanguage || i18n.language)
    );
    setIsLoading(false);

    if (results.length > 0) {
      selectLocation(results[0], false);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setSelectedFeature(null);
    setIsOpen(false);
    clearMarker();
    clearSearchGeometry();
  };

  const handleDirections = () => {
    if (!selectedFeature) {
      return;
    }

    onDirections(selectedFeature.center);
    setSelectedFeature(null);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Escape") {
      setIsOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSearchSubmit();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      cancelPendingSearch();
    };
  }, []);

  useEffect(() => {
    const currentMap = map.current;

    return () => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
      if (!currentMap) return;
      if (currentMap.getLayer(SEARCH_GEOMETRY_LINE_LAYER)) {
        currentMap.removeLayer(SEARCH_GEOMETRY_LINE_LAYER);
      }
      if (currentMap.getLayer(SEARCH_GEOMETRY_FILL_LAYER)) {
        currentMap.removeLayer(SEARCH_GEOMETRY_FILL_LAYER);
      }
      if (currentMap.getSource(SEARCH_GEOMETRY_SOURCE)) {
        currentMap.removeSource(SEARCH_GEOMETRY_SOURCE);
      }
    };
  }, [map]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "absolute",
        top: { xs: 12, sm: 20 },
        left: { xs: 12, sm: 20 },
        zIndex: "var(--z-top-controls)",
        width: { xs: "calc(100% - 24px)", sm: 450 },
        maxWidth: { xs: "calc(100% - 24px)", sm: "calc(100% - 40px)" },
      }}
    >
      <Paper
        className="map-search-surface"
        component="form"
        onSubmit={handleSearchSubmit}
        elevation={3}
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 48,
          px: 1,
          borderRadius: 16,
          border: "1px solid",
          borderColor: "divider",
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: theme => `0 3px 12px ${theme.palette.primary.main}40`,
          },
        }}
      >
        <Search size={18} />
        <InputBase
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder")}
          autoComplete="off"
          spellCheck={false}
          inputProps={{ "aria-label": t("search.placeholder") }}
          sx={{ flex: 1, ml: 1, minWidth: 0, fontSize: 14 }}
        />

        {isLoading ? (
          <CircularProgress size={17} sx={{ mr: 1 }} />
        ) : query ? (
          <IconButton
            type="button"
            size="small"
            onClick={handleClear}
            title={t("search.clearTitle")}
            aria-label={t("search.clearTitle")}
            sx={{ mr: 0.5 }}
          >
            <X size={15} />
          </IconButton>
        ) : null}

        <Button
          type="submit"
          variant="contained"
          size="small"
          disabled={isLoading}
          sx={{ minWidth: 86, minHeight: 36, borderRadius: 2.5 }}
        >
          {t("search.button")}
        </Button>
      </Paper>

      {selectedFeature && activeTool !== "route" && (
        <Paper className="map-floating-panel" elevation={4} sx={{ mt: 0.75, p: 1.5 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {selectedFeature.text || selectedFeature.place_name}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.35 }}
            >
              {selectedFeature.context || selectedFeature.place_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("search.coordinates")}: {formatDmsCoordinates(
                selectedFeature.center[0],
                selectedFeature.center[1]
              )}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Navigation size={15} />}
              onClick={handleDirections}
              sx={{ alignSelf: "flex-start", textTransform: "none" }}
            >
              {t("search.directions")}
            </Button>
          </Stack>
        </Paper>
      )}

      {isOpen && suggestions.length > 0 && (
        <Paper className="map-floating-panel" elevation={5} sx={{ mt: 0.75, maxHeight: 280, overflowY: "auto" }}>
          <List disablePadding>
            {suggestions.map(feature => (
              <ListItemButton key={feature.id} onClick={() => void selectSearchResult(feature)}>
                <ListItemIcon sx={{ minWidth: 32, color: "error.main" }}>
                  <MapPin size={16} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 600 }}>
                      {feature.text || feature.place_name}
                    </Box>
                  }
                  secondary={
                    <Box component="span" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                      {feature.context || feature.place_name}
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}

export default SearchBar;
