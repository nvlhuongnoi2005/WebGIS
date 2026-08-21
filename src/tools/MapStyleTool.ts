export type BaseMapStyle =
  | "streets"
  | "satellite"
  | "outdoor";

const MAP_STYLE_IDS:
  Record<BaseMapStyle, string> = {
    streets: "streets-v4",
    satellite: "satellite-v4",
    outdoor: "outdoor-v4",
  };

export function getMapStyleUrl(
  style: BaseMapStyle,
  apiKey: string
): string {
  return `https://api.maptiler.com/maps/${MAP_STYLE_IDS[style]}/style.json?key=${apiKey}`;
}
