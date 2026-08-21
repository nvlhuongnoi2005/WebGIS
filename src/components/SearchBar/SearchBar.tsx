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
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import "./SearchBar.css";

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
      }).setDOMContent(popupContent);

      const marker = new maplibregl.Marker({
        color: "#e53935",
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
    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

    if (!apiKey || !searchQuery.trim()) {
      return [];
    }

    let proximityParam = "";

    if (map.current) {
      const center = map.current.getCenter();
      proximityParam = `&proximity=${center.lng},${center.lat}`;
    }

    const activeLang = (
      i18n.resolvedLanguage ||
      i18n.language ||
      "vi"
    ).startsWith("vi")
      ? "vi,en"
      : "en,vi";

    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
        searchQuery.trim()
      )}.json?key=${apiKey}&language=${activeLang}${proximityParam}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Geocoding failed with status: ${response.status}`
        );
      }

      const data = await response.json();

      return (data.features as GeocodingFeature[]) || [];
    } catch (error) {
      console.error("Geocoding fetch error:", error);

      return [];
    }
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setQuery(value);

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
    }, 280);
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
    <div
      ref={containerRef}
      className="search-bar"
    >
      <form
        className="search-input-wrapper"
        onSubmit={handleSearchSubmit}
      >
        <Search
          className="search-icon"
          size={18}
        />

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder")}
          autoComplete="off"
          spellCheck="false"
        />

        {isLoading ? (
          <Loader2
            className="search-loading-icon"
            size={16}
          />
        ) : query ? (
          <button
            type="button"
            className="search-clear-button"
            onClick={handleClear}
            title={t("search.clearTitle")}
          >
            <X size={15} />
          </button>
        ) : null}

        <button
          type="submit"
          className="search-button"
          disabled={isLoading}
        >
          {t("search.button")}
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="search-suggestions-dropdown">
          {suggestions.map(feature => (
            <div
              key={feature.id}
              className="search-suggestion-item"
              onClick={() => selectLocation(feature)}
            >
              <MapPin
                className="suggestion-pin-icon"
                size={16}
              />
              <div className="suggestion-text-wrapper">
                <span className="suggestion-title">
                  {feature.text || feature.place_name}
                </span>
                {feature.place_name && (
                  <span className="suggestion-subtitle">
                    {feature.place_name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;