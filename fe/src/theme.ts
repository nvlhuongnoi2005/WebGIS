import { createTheme, type PaletteMode } from "@mui/material/styles";

export interface AppThemeOptions {
  mode: PaletteMode;
  highContrast: boolean;
}

export function createAppTheme({ mode, highContrast }: AppThemeOptions) {
  const isDark = mode === "dark";
  const palette = highContrast
    ? isDark
      ? {
          primary: { main: "#ffffff", light: "#1f1f1f", dark: "#ffffff", contrastText: "#000000" },
          secondary: { main: "#7fffd4", light: "#123b35", dark: "#bffff0" },
          error: { main: "#ffb4ab" },
          success: { main: "#9cffad" },
          background: { default: "#000000", paper: "#000000" },
          text: { primary: "#ffffff", secondary: "#ffffff" },
          divider: "#ffffff",
          action: { hover: "#2b2b2b", selected: "#343434" },
        }
      : {
          primary: { main: "#a90020", light: "#f2e8ea", dark: "#630012", contrastText: "#ffffff" },
          secondary: { main: "#7b1024", light: "#f3eaec", dark: "#4d0614" },
          error: { main: "#a60000" },
          success: { main: "#006b24" },
          background: { default: "#ffffff", paper: "#ffffff" },
          text: { primary: "#000000", secondary: "#1f1f1f" },
          divider: "#1f1f1f",
          action: { hover: "#f3f3f4", selected: "#f2e8ea" },
        }
    : isDark
      ? {
          primary: { main: "#ff9aaa", light: "#5b1825", dark: "#ffd5dc", contrastText: "#5b0011" },
          secondary: { main: "#f4a7b5", light: "#4a1720", dark: "#ffd6dd" },
          error: { main: "#ffb4ab" },
          success: { main: "#8fd99d" },
          background: { default: "#160d10", paper: "#211014" },
          text: { primary: "#fde9ed", secondary: "#e4bdc5" },
          divider: "#59313a",
          action: { hover: "#351720", selected: "#5b1825" },
        }
      : {
          primary: { main: "#e0002b", light: "#f2e8ea", dark: "#a90020", contrastText: "#ffffff" },
          secondary: { main: "#087f73", light: "#e2f3f0", dark: "#04564e" },
          error: { main: "#ba1a1a" },
          success: { main: "#087f73" },
          background: { default: "#eef2f1", paper: "#ffffff" },
          text: { primary: "#142a32", secondary: "#587078" },
          divider: "#d7e2e0",
          action: { hover: "#edf5f3", selected: "#e1f0ed" },
        };

  return createTheme({
    palette: { mode, ...palette },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      h4: { fontWeight: 800, letterSpacing: "0" },
      h5: { fontWeight: 800, letterSpacing: "0" },
      subtitle1: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 700 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            margin: 0,
            color: palette.text.primary,
            backgroundColor: palette.background.default,
          },
          "::selection": {
            color: palette.primary.contrastText,
            backgroundColor: palette.primary.main,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { minHeight: 40, borderRadius: 10, letterSpacing: 0 },
          contained: {
            boxShadow: isDark ? "0 2px 6px rgb(0 0 0 / 32%)" : "0 2px 5px rgb(224 0 43 / 24%)",
            "&:hover": {
              boxShadow: isDark ? "0 4px 10px rgb(0 0 0 / 42%)" : "0 4px 10px rgb(224 0 43 / 30%)",
            },
          },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
    },
  });
}

export default createAppTheme;
