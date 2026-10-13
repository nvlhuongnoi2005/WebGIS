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
          primary: { main: "#075985", light: "#e0f2fe", dark: "#0c4a6e", contrastText: "#ffffff" },
          secondary: { main: "#047857", light: "#d1fae5", dark: "#065f46" },
          error: { main: "#b91c1c" },
          success: { main: "#047857" },
          background: { default: "#ffffff", paper: "#ffffff" },
          text: { primary: "#000000", secondary: "#1f1f1f" },
          divider: "#1f1f1f",
          action: { hover: "#f0f9ff", selected: "#e0f2fe" },
        }
    : isDark
      ? {
          primary: { main: "#7dd3fc", light: "#164e63", dark: "#bae6fd", contrastText: "#082f49" },
          secondary: { main: "#6ee7b7", light: "#064e3b", dark: "#a7f3d0" },
          error: { main: "#ffb4ab" },
          success: { main: "#8fd99d" },
          background: { default: "#071923", paper: "#0d2531" },
          text: { primary: "#e0f2fe", secondary: "#b6d5df" },
          divider: "#245166",
          action: { hover: "#123845", selected: "#164e63" },
        }
      : {
          primary: { main: "#0369a1", light: "#e0f2fe", dark: "#075985", contrastText: "#ffffff" },
          secondary: { main: "#059669", light: "#d1fae5", dark: "#047857" },
          error: { main: "#b91c1c" },
          success: { main: "#059669" },
          background: { default: "#eef7f8", paper: "#ffffff" },
          text: { primary: "#12313f", secondary: "#526f7a" },
          divider: "#cfe0e4",
          action: { hover: "#edf8fa", selected: "#e0f2fe" },
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
            boxShadow: isDark ? "0 2px 6px rgb(0 0 0 / 32%)" : "0 2px 5px rgb(3 105 161 / 24%)",
            "&:hover": {
              boxShadow: isDark ? "0 4px 10px rgb(0 0 0 / 42%)" : "0 4px 10px rgb(3 105 161 / 30%)",
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
