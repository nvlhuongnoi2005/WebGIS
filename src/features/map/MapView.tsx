import { useState } from "react";
import { Box, Stack } from "@mui/material";
import "maplibre-gl/dist/maplibre-gl.css";

import LanguageSwitcher from "../../components/LanguageSwitcher/LanguageSwitcher";
import Profile from "../../components/Profile/Profile";
import SearchBar from "../../components/SearchBar/SearchBar";
import { useBaseMapStyle } from "../../hooks/useBaseMapStyle";
import { useDrawLayers } from "../../hooks/useDrawLayers";
import { useDrawTool } from "../../hooks/useDrawTool";
import { useMapInstance } from "../../hooks/useMapInstance";
import { useMapLanguage } from "../../hooks/useMapLanguage";
import { useMeasureLayers } from "../../hooks/useMeasureLayers";
import { useMeasureTool } from "../../hooks/useMeasureTool";
import type { MapTool } from "../../types/map";
import DrawPanel from "./components/DrawPanel";
import CRSPanel from "./components/CRSPanel";
import LayerPanel from "./components/LayerPanel";
import MeasurePanel from "./components/MeasurePanel";
import ToolPanel from "./components/ToolPanel";
import {
  type CoordinateReferenceSystem,
} from "../../tools/CoordinateTool";
import "./MapView.css";

function MapView() {
  const [activeTool, setActiveTool] = useState<MapTool>(null);
  const [coordinateReferenceSystem, setCoordinateReferenceSystem] =
    useState<CoordinateReferenceSystem>("EPSG:4326");
  const { mapContainer, map, mapLoaded } = useMapInstance(
    coordinateReferenceSystem,
    activeTool !== "draw" && activeTool !== "measure"
  );
  const {
    baseMapStyle,
    changeBaseMapStyle,
    mapDataSource,
    changeMapDataSource,
    mapStyleVersion,
  } = useBaseMapStyle(map);

  useMapLanguage({ map, mapLoaded, mapStyleVersion });

  const measure = useMeasureTool({ map, mapLoaded, activeTool, setActiveTool });
  const draw = useDrawTool({ map, mapLoaded, activeTool, setActiveTool });

  useMeasureLayers({
    map,
    mapLoaded,
    mapStyleVersion,
    measureMode: measure.measureMode,
    measurePoints: measure.measurePoints,
  });

  useDrawLayers({
    map,
    mapLoaded,
    mapStyleVersion,
    drawings: draw.drawings,
    draftCoordinates: draw.draftCoordinates,
    selectedFeatureId: draw.selectedFeatureId,
    mode: draw.editorMode,
  });

  const handleSelectTool = (tool: MapTool) => {
    if (activeTool === tool) {
      if (tool === "measure") {
        measure.resetMeasure();
      }

      setActiveTool(null);
      return;
    }

    if (tool === "measure") measure.startMeasure();
    setActiveTool(tool);
  };

  const handleFinishMeasure = () => {
    measure.resetMeasure();
    setActiveTool(null);
  };

  return (
    <Box className="map-wrapper">
      <Box ref={mapContainer} className="map-container" />
      <SearchBar map={map} />
      <ToolPanel activeTool={activeTool} onSelectTool={handleSelectTool} />
      <Stack
        direction="row"
        spacing={1.5}
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

     

      {activeTool === "layer" && (
        <LayerPanel
          baseMapStyle={baseMapStyle}
          onChange={changeBaseMapStyle}
          mapDataSource={mapDataSource}
          onChangeDataSource={changeMapDataSource}
        />
      )}

      {activeTool === "CRS" && (
        <CRSPanel
          value={coordinateReferenceSystem}
          onChange={setCoordinateReferenceSystem}
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

      {activeTool === "draw" && (
        <DrawPanel
          drawingCount={draw.drawings.features.length}
          draftPointCount={draw.draftCoordinates.length}
          error={draw.drawError}
          mode={draw.editorMode}
          hasSelection={Boolean(draw.selectedFeatureId)}
          canFinish={draw.canFinish}
          canRedo={draw.canRedo}
          canUndo={draw.canUndo}
          onChangeMode={draw.changeMode}
          onClear={draw.clearAllDrawings}
          onDelete={draw.deleteSelected}
          onFinish={draw.finishDraft}
          onRedo={draw.redoDraw}
          onUndo={draw.undoDraw}
        />
      )}
    </Box>
  );
}

export default MapView;
