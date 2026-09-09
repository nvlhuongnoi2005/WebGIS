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
} from "@mui/material";
import {
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export interface GeocodingFeature {
  id: string;
  type: string;
  place_name: string;
  text: string;
  center: [number, number];
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  bbox?: [number, number, number, number];
}

interface NominatimResult {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  boundingbox?: [string, string, string, string];
}

const NOMINATIM_URL = "/api/nominatim";
const SEARCH_DEBOUNCE_MS = 150;

interface SearchBarProps {
  map: MutableRefObject<maplibregl.Map | null>;
}

function SearchBar({ map }: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const searchCacheRef = useRef<Map<string, GeocodingFeature[]>>(new Map());

  const clearMarker = () => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
  };

  const selectLocation = (feature: GeocodingFeature) => {
    setQuery(feature.place_name);
    setIsOpen(false);

    if (!map.current) {
      return;
    }

    clearMarker();

    const coordinates: [number, number] =
      feature.center || feature.geometry.coordinates;

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

    if (coordinates) {
      const popupContent = document.createElement("div");
      popupContent.className = "search-popup-container";

      const title = document.createElement("strong");
      title.innerText = feature.text || feature.place_name;
      popupContent.appendChild(title);

      if (feature.place_name && feature.place_name !== feature.text) {
        const desc = document.createElement("div");
        desc.className = "search-popup-desc";
        desc.innerText = feature.place_name;
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
        color: "#e53935",
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

  const fetchGeocoding = async (
    searchQuery: string
  ): Promise<GeocodingFeature[]> => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const activeLang = (
      i18n.resolvedLanguage ||
      i18n.language ||
      "vi"
    ).startsWith("vi")
      ? "vi,en"
      : "en,vi";
    const cacheKey = `${activeLang}:${normalizedQuery}`;
    const cachedResults = searchCacheRef.current.get(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        format: "jsonv2",
        addressdetails: "1",
        limit: "6",
        "accept-language": activeLang,
      });
      const url = `${NOMINATIM_URL}/search?${params.toString()}`;

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(
          `Geocoding failed with status: ${response.status}`
        );
      }

      const data = (await response.json()) as NominatimResult[];

      const results = data.map(result => {
        const longitude = Number(result.lon);
        const latitude = Number(result.lat);
        const coordinates: [number, number] = [longitude, latitude];
        const bbox: [number, number, number, number] | undefined =
          result.boundingbox && [
            Number(result.boundingbox[2]),
            Number(result.boundingbox[0]),
            Number(result.boundingbox[3]),
            Number(result.boundingbox[1]),
          ];

        return {
          id: `${result.osm_type || "place"}-${result.osm_id || result.place_id}`,
          type: "Feature",
          place_name: result.display_name,
          text: result.name || result.display_name,
          center: coordinates,
          geometry: {
            type: "Point",
            coordinates,
          },
          bbox,
        };
      });

      searchCacheRef.current.set(cacheKey, results);

      return results;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      console.error("Geocoding fetch error:", error);

      return [];
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

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setQuery(value);
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
      const results = await fetchGeocoding(value);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setIsLoading(false);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSearchSubmit = async (event?: FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    if (!query.trim()) {
      return;
    }

    if (suggestions.length > 0) {
      selectLocation(suggestions[0]);

      return;
    }

    setIsLoading(true);
    const results = await fetchGeocoding(query);
    setIsLoading(false);

    if (results.length > 0) {
      selectLocation(results[0]);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    clearMarker();
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
    return () => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
    };
  }, []);

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
        component="form"
        onSubmit={handleSearchSubmit}
        elevation={3}
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 42,
          px: 1,
          borderRadius: 21,
          border: "1px solid",
          borderColor: "divider",
          transition: "border-color 0.2s, box-shadow 0.2s",
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: theme => `0 3px 12px ${theme.palette.primary.main}40`,
          },
        }}
      >
        <Search size={18} color="#757575" />
        <InputBase
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder")}
          autoComplete="off"
          spellCheck={false}
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
          sx={{ minWidth: 82, borderRadius: 16 }}
        >
          {t("search.button")}
        </Button>
      </Paper>

      {isOpen && suggestions.length > 0 && (
        <Paper elevation={5} sx={{ mt: 0.75, maxHeight: 280, overflowY: "auto", borderRadius: 3 }}>
          <List disablePadding>
            {suggestions.map(feature => (
              <ListItemButton key={feature.id} onClick={() => selectLocation(feature)}>
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
                      {feature.place_name}
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
