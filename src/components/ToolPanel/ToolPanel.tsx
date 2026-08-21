import {
  Ruler,
  MapPin,
  Layers,
} from "lucide-react";
import {
  Tooltip,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  MapTool,
} from "../../types/map";

import "./ToolPanel.css";

interface ToolPanelProps {
  activeTool: MapTool;

  onSelectTool:
    (tool: MapTool) => void;
}

function ToolPanel({
  activeTool,
  onSelectTool,
}: ToolPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="tool-panel">

      <Tooltip title={t("tools.measure")} placement="left">
        <button
          className={
            activeTool === "measure"
              ? "tool-item active"
              : "tool-item"
          }
          onClick={() =>
            onSelectTool("measure")
          }
          aria-label={t("tools.measure")}
        >
          <Ruler size={18} />
        </button>
      </Tooltip>

      <Tooltip title={t("tools.marker")} placement="left">
        <button
          className="tool-item"
          onClick={() =>
            onSelectTool("marker")
          }
          aria-label={t("tools.marker")}
        >
          <MapPin size={18} />
        </button>
      </Tooltip>

      <Tooltip title={t("tools.layer")} placement="left">
        <button
          className="tool-item"
          onClick={() =>
            onSelectTool("layer")
          }
          aria-label={t("tools.layer")}
        >
          <Layers size={18} />
        </button>
      </Tooltip>

    </div>
  );
}

export default ToolPanel;