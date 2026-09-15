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
          primary: { main: "#003b85", light: "#dbe9ff", dark: "#001f4d", contrastText: "#ffffff" },
          secondary: { main: "#005c54", light: "#d5f5f0", dark: "#003d38" },
          error: { main: "#a60000" },
          success: { main: "#006b24" },
          background: { default: "#ffffff", paper: "#ffffff" },
          text: { primary: "#000000", secondary: "#1f1f1f" },
          divider: "#1f1f1f",
          action: { hover: "#e7efff", selected: "#dbe9ff" },
        }
    : isDark
      ? {
          primary: { main: "#a8c7fa", light: "#243a5d", dark: "#d8e6ff", contrastText: "#062e5f" },
          secondary: { main: "#75d7d0", light: "#173f3d", dark: "#a9f1ec" },
          error: { main: "#ffb4ab" },
          success: { main: "#8fd99d" },
          background: { default: "#101418", paper: "#181d23" },
          text: { primary: "#e3e9f2", secondary: "#bdc7d5" },
          divider: "#3d4754",
          action: { hover: "#25303d", selected: "#263a59" },
        }
      : {
          primary: { main: "#0b57d0", light: "#e8f0fe", dark: "#073b87", contrastText: "#ffffff" },
          secondary: { main: "#006a6a", light: "#d6f5f3", dark: "#004f4f" },
          error: { main: "#ba1a1a" },
          success: { main: "#146c2e" },
          background: { default: "#f6f8fc", paper: "#ffffff" },
          text: { primary: "#172033", secondary: "#526077" },
          divider: "#dce3ef",
          action: { hover: "#eef4ff", selected: "#e8f0fe" },
        };

  return createTheme({
    palette: { mode, ...palette },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '"Segoe UI", "Noto Sans", sans-serif',
      h4: { fontWeight: 750, letterSpacing: "-0.02em" },
      h5: { fontWeight: 750, letterSpacing: "-0.015em" },
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
            boxShadow: isDark ? "0 2px 6px rgb(0 0 0 / 32%)" : "0 2px 5px rgb(11 87 208 / 22%)",
            "&:hover": {
              boxShadow: isDark ? "0 4px 10px rgb(0 0 0 / 42%)" : "0 4px 10px rgb(11 87 208 / 28%)",
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
