import { Box, ButtonBase, Tooltip, Typography } from "@mui/material";
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
          minWidth: 72,
          height: 44,
          px: 1.125,
          gap: 0.75,
          borderRadius: 16,
          border: "2px solid",
          borderColor: "background.paper",
          backgroundColor: "background.paper",
          boxShadow: "0 8px 20px rgb(20 45 82 / 16%)",
          overflow: "hidden",
          boxSizing: "border-box",
          "&:hover": {
            backgroundColor: "action.hover",
            boxShadow: "0 10px 24px rgb(20 45 82 / 20%)",
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
            color: "text.primary",
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
