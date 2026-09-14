import { Layers, MapPin, Navigation, Pen, Ruler } from "lucide-react";
import { IconButton, Paper, Stack, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { MapTool } from "../../../types/map";

interface ToolPanelProps {
  activeTool: MapTool;
  onSelectTool: (tool: MapTool) => void;
}

const tools = [
  { id: "route", icon: Navigation, label: "tools.route" },
  { id: "draw", icon: Pen, label: "tools.draw" },
  { id: "measure", icon: Ruler, label: "tools.measure" },
  { id: "marker", icon: MapPin, label: "tools.marker" },
  { id: "layer", icon: Layers, label: "tools.layer" },
] as const;

function ToolPanel({ activeTool, onSelectTool }: ToolPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper
      className="map-tool-rail"
      component="nav"
      aria-label={t("accessibility.mapTools")}
      elevation={3}
      sx={{
        position: "absolute",
        right: { xs: 12, sm: 20 },
        top: { xs: 120, sm: 100 },
        zIndex: "var(--z-tool-panel)",
        p: 0.75,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.5,
        bgcolor: "rgba(255, 255, 255, 0.94)",
      }}
    >
      <Stack spacing={0.5}>
        {tools.map(({ id, icon: Icon, label }) => {
          const isActive = activeTool === id;
          const translatedLabel = t(label);

          return (
            <Tooltip key={id} title={translatedLabel} placement="left">
              <IconButton
                size="small"
                color={isActive ? "primary" : "default"}
                onClick={() => onSelectTool(id)}
                aria-label={translatedLabel}
                aria-pressed={isActive}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: isActive ? "primary.light" : "transparent",
                  "&:hover": { bgcolor: isActive ? "primary.light" : "action.hover" },
                }}
              >
                <Icon size={18} />
              </IconButton>
            </Tooltip>
          );
        })}
      </Stack>
    </Paper>
  );
}

export default ToolPanel;
