import { createContext, useContext } from "react";

export type ColorPreference = "system" | "light" | "dark";

export interface AccessibilityPreferences {
  colorMode: ColorPreference;
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
}

export interface AccessibilityContextValue extends AccessibilityPreferences {
  resolvedColorMode: "light" | "dark";
  setColorMode: (colorMode: ColorPreference) => void;
  setHighContrast: (highContrast: boolean) => void;
  setLargeText: (largeText: boolean) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  resetPreferences: () => void;
}

export const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider.");
  }

  return context;
}
