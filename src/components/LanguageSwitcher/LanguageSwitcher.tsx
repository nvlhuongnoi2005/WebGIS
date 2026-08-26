import {
  Box,
  ButtonBase,
  Tooltip,
  Typography,
} from "@mui/material";
import ReactCountryFlag from "react-country-flag";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.resolvedLanguage || i18n.language || "vi";
  const isVi = currentLang.startsWith("vi");

  const toggleLanguage = () => {
    const nextLang = isVi ? "en" : "vi";
    i18n.changeLanguage(nextLang);
  };

  return (
    <Tooltip title={isVi ? t("language.switchToEn") : t("language.switchToVi")}>
      <ButtonBase
        type="button"
        onClick={toggleLanguage}
        aria-label={t("tools.language")}
        sx={{
          minWidth: 64,
          height: 38,
          px: 1.125,
          gap: 0.75,
          borderRadius: 19,
          border: "2px solid #ffffff",
          backgroundColor: "#ffffff",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
          boxSizing: "border-box",
          transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease",
          "&:hover": {
            transform: "scale(1.1)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.28)",
          },
          "&:active": {
            transform: "scale(0.94)",
          },
          "&:focus-visible": {
            outline: "2px solid #1565c0",
            outlineOffset: 2,
          },
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            flex: "0 0 22px",
            borderRadius: "50%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ReactCountryFlag
            countryCode={isVi ? "VN" : "GB"}
            svg
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
        </Box>
        <Typography
          component="span"
          sx={{
            color: "#1f2937",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {isVi ? "vn" : "en"}
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
}

export default LanguageSwitcher;
