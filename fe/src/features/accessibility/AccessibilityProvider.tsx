import { CssBaseline, ThemeProvider } from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import createAppTheme from "../../theme";
import {
  AccessibilityContext,
  type AccessibilityContextValue,
  type AccessibilityPreferences,
} from "./AccessibilityContext";

const STORAGE_KEY = "vgis-accessibility-preferences";
const defaultPreferences: AccessibilityPreferences = {
  colorMode: "system",
  highContrast: false,
  largeText: false,
  reduceMotion: false,
};

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(readPreferences);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemMode = () => setSystemPrefersDark(mediaQuery.matches);

    updateSystemMode();
    mediaQuery.addEventListener("change", updateSystemMode);
    return () => mediaQuery.removeEventListener("change", updateSystemMode);
  }, []);

  const resolvedColorMode = preferences.colorMode === "system"
    ? systemPrefersDark ? "dark" : "light"
    : preferences.colorMode;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    const root = document.documentElement;
    root.dataset.colorMode = resolvedColorMode;
    root.dataset.highContrast = String(preferences.highContrast);
    root.dataset.textSize = preferences.largeText ? "large" : "normal";
    root.dataset.reduceMotion = String(preferences.reduceMotion);
  }, [preferences, resolvedColorMode]);

  const updatePreferences = useCallback((nextValues: Partial<AccessibilityPreferences>) => {
    setPreferences(current => ({ ...current, ...nextValues }));
  }, []);

  const value = useMemo<AccessibilityContextValue>(() => ({
    ...preferences,
    resolvedColorMode,
    setColorMode: colorMode => updatePreferences({ colorMode }),
    setHighContrast: highContrast => updatePreferences({ highContrast }),
    setLargeText: largeText => updatePreferences({ largeText }),
    setReduceMotion: reduceMotion => updatePreferences({ reduceMotion }),
    resetPreferences: () => setPreferences(defaultPreferences),
  }), [preferences, resolvedColorMode, updatePreferences]);
  const theme = useMemo(
    () => createAppTheme({ mode: resolvedColorMode, highContrast: preferences.highContrast }),
    [preferences.highContrast, resolvedColorMode]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AccessibilityContext.Provider>
  );
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function readPreferences(): AccessibilityPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultPreferences;

    const parsed = JSON.parse(stored) as Partial<AccessibilityPreferences>;
    return {
      colorMode: parsed.colorMode === "light" || parsed.colorMode === "dark" || parsed.colorMode === "system"
        ? parsed.colorMode
        : defaultPreferences.colorMode,
      highContrast: Boolean(parsed.highContrast),
      largeText: Boolean(parsed.largeText),
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return defaultPreferences;
  }
}
