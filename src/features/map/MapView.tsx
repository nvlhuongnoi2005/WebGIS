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
import {
  transformFromWgs84,
  type CoordinateReferenceSystem,
} from "../../tools/CoordinateTool";
import DrawPanel from "./components/DrawPanel";
import LayerPanel from "./components/LayerPanel";
import MapPositionPopup from "./components/MapPositionPopup";
import MeasurePanel from "./components/MeasurePanel";
import ToolPanel from "./components/ToolPanel";
import "./MapView.css";

function MapView() {
  const [activeTool, setActiveTool] = useState<MapTool>(null);
  const [coordinateReferenceSystem, setCoordinateReferenceSystem] =
    useState<CoordinateReferenceSystem>("EPSG:4326");
  const {
    mapContainer,
    map,
    mapLoaded,
    hoveredCoordinate,
    placeMarkerAtCurrentLocation,
  } = useMapInstance(
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

    if (tool === "marker") {
      placeMarkerAtCurrentLocation();
    }

    if (tool === "measure") measure.startMeasure();
    setActiveTool(tool);
  };

  const handleFinishMeasure = () => {
    measure.resetMeasure();
    setActiveTool(null);
  };

  const hoveredDisplayCoordinate = transformFromWgs84(
    hoveredCoordinate,
    coordinateReferenceSystem
  );

  return (
    <Box className="map-wrapper">
      <Box ref={mapContainer} className="map-container" />
      <Box className="map-coordinate-hover-panel">
        <MapPositionPopup
          longitude={hoveredDisplayCoordinate[0]}
          latitude={hoveredDisplayCoordinate[1]}
          crs={coordinateReferenceSystem}
          compact
          onCrsChange={setCoordinateReferenceSystem}
        />
      </Box>
      <SearchBar map={map} />
      <ToolPanel activeTool={activeTool} onSelectTool={handleSelectTool} />
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          position: "absolute",
          top: { xs: 64, sm: 20 },
          right: { xs: 12, sm: 20 },
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
          geoJSON={draw.geoJSON}
          selectedFeatureId={draw.selectedFeatureId}
          onChangeMode={draw.changeMode}
          onApplyGeoJSON={draw.applyGeoJSON}
          onSelectFeature={draw.selectFeature}
          onUpdateFeatureProperties={draw.updateFeatureProperties}
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
