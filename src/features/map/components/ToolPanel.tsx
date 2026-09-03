import { Layers, MapPin, Pen, Ruler } from "lucide-react";
import { IconButton, Paper, Stack, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { MapTool } from "../../../types/map";

interface ToolPanelProps {
  activeTool: MapTool;
  onSelectTool: (tool: MapTool) => void;
}

const tools = [
  { id: "draw", icon: Pen, label: "tools.draw" },
  { id: "measure", icon: Ruler, label: "tools.measure" },
  { id: "marker", icon: MapPin, label: "tools.marker" },
  { id: "layer", icon: Layers, label: "tools.layer" },
] as const;

function ToolPanel({ activeTool, onSelectTool }: ToolPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper
      elevation={3}
      sx={{
        position: "absolute",
        right: { xs: 12, sm: 20 },
        top: { xs: 120, sm: 100 },
        zIndex: "var(--z-tool-panel)",
        p: 0.5,
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
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  bgcolor: isActive ? "primary.50" : "transparent",
                  "&:hover": { bgcolor: isActive ? "primary.100" : "action.hover" },
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
