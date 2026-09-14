import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0b57d0",
      light: "#e8f0fe",
      dark: "#073b87",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#006a6a",
      light: "#d6f5f3",
      dark: "#004f4f",
    },
    error: {
      main: "#ba1a1a",
    },
    success: {
      main: "#146c2e",
    },
    background: {
      default: "#f6f8fc",
      paper: "#ffffff",
    },
    text: {
      primary: "#172033",
      secondary: "#526077",
    },
    divider: "#dce3ef",
    action: {
      hover: "#eef4ff",
      selected: "#e8f0fe",
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Segoe UI", "Noto Sans", sans-serif',
    h4: { fontWeight: 750, letterSpacing: "-0.02em" },
    h5: { fontWeight: 750, letterSpacing: "-0.015em" },
    subtitle1: { fontWeight: 700 },
    button: {
      textTransform: "none",
      fontWeight: 700,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          margin: 0,
          color: "#172033",
          backgroundColor: "#f6f8fc",
        },
        "::selection": {
          color: "#ffffff",
          backgroundColor: "#0b57d0",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 10,
          letterSpacing: 0,
        },
        contained: {
          boxShadow: "0 2px 5px rgb(11 87 208 / 22%)",
          "&:hover": { boxShadow: "0 4px 10px rgb(11 87 208 / 28%)" },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20 },
      },
    },
  },
});

export default theme;
