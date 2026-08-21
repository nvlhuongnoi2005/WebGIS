import { useState } from "react";
import {
  Stack,
} from "@mui/material";
import "maplibre-gl/dist/maplibre-gl.css";

import SearchBar from "../SearchBar/SearchBar";
import ToolPanel from "../ToolPanel/ToolPanel";
import LanguageSwitcher from "../LanguageSwitcher/LanguageSwitcher";
import LayerPanel from "./LayerPanel";
import MeasurePanel from "./MeasurePanel";

import { useBaseMapStyle } from "../../hooks/useBaseMapStyle";
import { useMapInstance } from "../../hooks/useMapInstance";
import { useMapLanguage } from "../../hooks/useMapLanguage";
import { useMeasureLayers } from "../../hooks/useMeasureLayers";
import { useMeasureTool } from "../../hooks/useMeasureTool";
import { useOverlayLayers } from "../../hooks/useOverlayLayers";
import type { MapTool } from "../../types/map";
import type { OverlayLayerId } from "../../tools/MapOverlayTool";
import Profile from "../Profile/Profile";
import "./MapView.css";

function MapView() {
  const [activeTool, setActiveTool] = useState<MapTool>(null);
  const [activeOverlayLayers, setActiveOverlayLayers] = useState<OverlayLayerId[]>([]);

  const {
    mapContainer,
    map,
    mapLoaded,
  } = useMapInstance();

  const {
    baseMapStyle,
    changeBaseMapStyle,
    mapStyleVersion,
  } = useBaseMapStyle(map);

  useMapLanguage({
    map,
    mapLoaded,
    mapStyleVersion,
  });

  const measure = useMeasureTool({
    map,
    mapLoaded,
    activeTool,
    setActiveTool,
  });

  useMeasureLayers({
    map,
    mapLoaded,
    mapStyleVersion,
    measureMode: measure.measureMode,
    measurePoints: measure.measurePoints,
  });

  useOverlayLayers({
    map,
    mapLoaded,
    mapStyleVersion,
    activeOverlayLayers,
  });

  const handleSelectTool = (tool: MapTool) => {
    if (tool === "measure") {
      measure.startMeasure();
    }

    setActiveTool(tool);
  };

  const handleFinishMeasure = () => {
    measure.resetMeasure();
    setActiveTool(null);
  };

  const handleToggleOverlayLayer = (overlayLayer: OverlayLayerId) => {
    setActiveOverlayLayers(currentLayers => {
      if (currentLayers.includes(overlayLayer)) {
        return currentLayers.filter(layer => layer !== overlayLayer);
      }

      return [...currentLayers, overlayLayer];
    });
  };

  return (
    <div className="map-wrapper">
      <div
        ref={mapContainer}
        className="map-container"
      />

      <SearchBar map={map} />

      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: "var(--z-top-controls)",
          alignItems: "center",
        }}
      >
        <LanguageSwitcher />

        <Profile />
      </Stack>

      <ToolPanel
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
      />

      {activeTool === "layer" && (
        <LayerPanel
          baseMapStyle={baseMapStyle}
          onChange={changeBaseMapStyle}
          activeOverlayLayers={activeOverlayLayers}
          onToggleOverlayLayer={handleToggleOverlayLayer}
        />
      )}

      {activeTool === "measure" && (
        <MeasurePanel
          error={measure.measureError}
          isAreaComplete={measure.isAreaComplete}
          measureMode={measure.measureMode}
          measurePoints={measure.measurePoints}
          canRedo={measure.canRedo}
          canUndo={measure.canUndo}
          onChangeMode={measure.changeMeasureMode}
          onClear={measure.clearMeasure}
          onFinish={handleFinishMeasure}
          onRedo={measure.redoMeasure}
          onUndo={measure.undoMeasure}
        />
      )}
    </div>
  );
}

export default MapView;
