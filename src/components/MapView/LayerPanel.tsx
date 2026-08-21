import { useTranslation } from "react-i18next";
import type { BaseMapStyle } from "../../tools/MapStyleTool";
import type { OverlayLayerId } from "../../tools/MapOverlayTool";

interface LayerPanelProps {
  baseMapStyle: BaseMapStyle;
  onChange: (style: BaseMapStyle) => void;
  activeOverlayLayers: OverlayLayerId[];
  onToggleOverlayLayer: (overlayLayer: OverlayLayerId) => void;
}

function LayerPanel({
  baseMapStyle,
  onChange,
}: LayerPanelProps) {

  const { t } = useTranslation();

  return (
    <div className="layer-panel">
      <span>{t("layers.baseMap")}</span>

      <button
        className={
          baseMapStyle === "streets"
            ? "layer-option active"
            : "layer-option"
        }
        onClick={() => onChange("streets")}
      >
        {t("layers.streets")}
      </button>

      <button
        className={
          baseMapStyle === "satellite"
            ? "layer-option active"
            : "layer-option"
        }
        onClick={() => onChange("satellite")}
      >
        {t("layers.satellite")}
      </button>

      <button
        className={
          baseMapStyle === "outdoor"
            ? "layer-option active"
            : "layer-option"
        }
        onClick={() => onChange("outdoor")}
      >
        {t("layers.outdoor")}
      </button>
    </div>
  );
}

export default LayerPanel;
