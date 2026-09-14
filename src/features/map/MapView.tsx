import { useMemo, useState } from "react";
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
import { useRouting } from "../../hooks/useRouting";
import type { MapTool } from "../../types/map";
import {
  DEFAULT_COORDINATE_REFERENCE_SYSTEM,
  transformFromWgs84,
  type CoordinateReferenceSystem,
} from "../../tools/coordinate/CoordinateTool";
import { splitTileServerDatasets } from "../../tools/map/MapStyleTool";
import {
  getDrawGeoJSONCrs,
  transformDrawFeatureCollection,
  type DrawFeatureCollection,
} from "../../tools/draw/DrawTool";
import DrawPanel from "./components/DrawPanel";
import LayerPanel from "./components/LayerPanel";
import MapPositionPopup from "./components/MapPositionPopup";
import MeasurePanel from "./components/MeasurePanel";
import ToolPanel from "./components/ToolPanel";
import TileServerBaseMapPanel from "./components/TileServerBaseMapPanel";
import RoutingPanel from "./components/RoutingPanel";
import "./MapView.css";

function MapView() {
  const [activeTool, setActiveTool] = useState<MapTool>(null);
  const [tileServerPanelMode, setTileServerPanelMode] = useState<"base-map" | "layers" | null>(null);
  const [coordinateReferenceSystem, setCoordinateReferenceSystem] =
    useState<CoordinateReferenceSystem>(DEFAULT_COORDINATE_REFERENCE_SYSTEM);
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
    tileServerBaseMap,
    tileServerOverlays,
    tileServerBaseMaps,
    tileServerCatalogStatus,
    tileServerCatalogError,
    loadTileServerBaseMaps,
    changeTileServerBaseMap,
    toggleTileServerOverlay,
    mapStyleVersion,
  } = useBaseMapStyle(map);
  const tileServerDatasets = useMemo(
    () => splitTileServerDatasets(tileServerBaseMaps),
    [tileServerBaseMaps]
  );

  useMapLanguage({ map, mapLoaded, mapStyleVersion });

  const routing = useRouting({
    map,
    mapLoaded,
    mapStyleVersion,
  });

  const handleSearchDirections = (coordinates: [number, number]) => {
    routing.setDestination(coordinates);
    setTileServerPanelMode(null);
    setActiveTool("route");
  };

  const measure = useMeasureTool({ map, mapLoaded, activeTool, setActiveTool });
  const draw = useDrawTool({ map, mapLoaded, activeTool, setActiveTool });

  const handleSearch = () => {
    if (activeTool === "measure") {
      measure.resetMeasure();
    }

    setTileServerPanelMode(null);
    setActiveTool(null);
  };

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
    hiddenFeatureIds: draw.hiddenFeatureIds,
    draftCoordinates: draw.draftCoordinates,
    selectedFeatureId: draw.selectedFeatureId,
    mode: draw.editorMode,
  });

  const handleSelectTool = (tool: MapTool) => {
    if (activeTool === tool) {
      if (tool === "measure") {
        measure.resetMeasure();
      }

      if (tool === "layer") {
        setTileServerPanelMode(null);
      }

      setActiveTool(null);
      return;
    }

    if (tool === "marker") {
      placeMarkerAtCurrentLocation();
    }

    if (tool === "measure") measure.startMeasure();
    if (tool === "route") routing.reset();
    if (tool !== "layer") setTileServerPanelMode(null);
    setActiveTool(tool);
  };

  const handleFinishMeasure = () => {
    measure.resetMeasure();
    setActiveTool(null);
  };

  const openTileServerPanel = (mode: "base-map" | "layers") => {
    setTileServerPanelMode(mode);
    setActiveTool(null);

    if (tileServerCatalogStatus === "idle") {
      void loadTileServerBaseMaps();
    }
  };

  const hoveredDisplayCoordinate = transformFromWgs84(
    hoveredCoordinate,
    coordinateReferenceSystem
  );
  const displayedGeoJSON = useMemo(
    () => transformDrawFeatureCollection(
      draw.geoJSON,
      DEFAULT_COORDINATE_REFERENCE_SYSTEM,
      coordinateReferenceSystem
    ),
    [coordinateReferenceSystem, draw.geoJSON]
  );
  const handleApplyGeoJSON = (nextGeoJSON: DrawFeatureCollection) => {
    const sourceCrs = getDrawGeoJSONCrs(nextGeoJSON);
    setCoordinateReferenceSystem(sourceCrs);
    draw.applyGeoJSON(
      transformDrawFeatureCollection(
        nextGeoJSON,
        sourceCrs,
        DEFAULT_COORDINATE_REFERENCE_SYSTEM
      )
    );
  };

  return (
    <Box component="main" id="main-content" className="map-wrapper">
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
      <SearchBar
        activeTool={activeTool}
        map={map}
        onDirections={handleSearchDirections}
        onSearch={handleSearch}
      />
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
          onOpenBaseMap={() => openTileServerPanel("base-map")}
          onOpenLayers={() => openTileServerPanel("layers")}
          selectedOverlayCount={tileServerOverlays.length}
        />
      )}

      {tileServerPanelMode && (
        <TileServerBaseMapPanel
          mode={tileServerPanelMode}
          selectedBaseMap={tileServerBaseMap}
          baseMaps={tileServerDatasets.baseMaps}
          overlays={tileServerDatasets.overlays}
          selectedOverlayIds={tileServerOverlays.map(overlay => overlay.id)}
          status={tileServerCatalogStatus}
          error={tileServerCatalogError}
          onReload={loadTileServerBaseMaps}
          onSelect={changeTileServerBaseMap}
          onToggleOverlay={toggleTileServerOverlay}
          onClose={() => setTileServerPanelMode(null)}
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

      {activeTool === "route" && (
        <RoutingPanel
          origin={routing.origin}
          destination={routing.destination}
          vehicle={routing.vehicle}
          status={routing.status}
          error={routing.error}
          distanceKm={routing.route?.summary.distanceKm}
          timeSeconds={routing.route?.summary.timeSeconds}
          instructions={routing.route?.instructions}
          onOriginChange={routing.setOrigin}
          onDestinationChange={routing.setDestination}
          onVehicleChange={routing.setVehicle}
          onCalculate={routing.calculateRoute}
          onReset={routing.reset}
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
          geoJSON={displayedGeoJSON}
          hiddenFeatureIds={draw.hiddenFeatureIds}
          selectedFeatureId={draw.selectedFeatureId}
          onChangeMode={draw.changeMode}
          onApplyGeoJSON={handleApplyGeoJSON}
          onSelectFeature={draw.selectFeature}
          onToggleFeatureVisibility={draw.toggleFeatureVisibility}
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
