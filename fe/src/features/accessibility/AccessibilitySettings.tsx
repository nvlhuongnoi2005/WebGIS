import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Accessibility as AccessibilityIcon, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccessibility, type ColorPreference } from "./AccessibilityContext";

interface AccessibilitySettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AccessibilitySettingsDialog({ open, onClose }: AccessibilitySettingsDialogProps) {
  const { t } = useTranslation();
  const {
    colorMode,
    highContrast,
    largeText,
    reduceMotion,
    setColorMode,
    setHighContrast,
    setLargeText,
    setReduceMotion,
    resetPreferences,
  } = useAccessibility();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-describedby="accessibility-settings-description">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <AccessibilityIcon size={22} aria-hidden />
        {t("accessibility.settings")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 0.5 }}>
          <Typography id="accessibility-settings-description" variant="body2" color="text.secondary">
            {t("accessibility.settingsDescription")}
          </Typography>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t("accessibility.colorMode")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={colorMode}
              onChange={(_, value: ColorPreference | null) => value && setColorMode(value)}
              aria-label={t("accessibility.colorMode")}
            >
              <ToggleButton value="system" aria-label={t("accessibility.system")}>
                <Monitor size={17} />
              </ToggleButton>
              <ToggleButton value="light" aria-label={t("accessibility.light")}>
                <Sun size={17} />
              </ToggleButton>
              <ToggleButton value="dark" aria-label={t("accessibility.dark")}>
                <Moon size={17} />
              </ToggleButton>
            </ToggleButtonGroup>
            <Stack direction="row" sx={{ mt: 0.75, justifyContent: "space-between" }}>
              <Typography variant="caption" color="text.secondary">{t("accessibility.system")}</Typography>
              <Typography variant="caption" color="text.secondary">{t("accessibility.light")}</Typography>
              <Typography variant="caption" color="text.secondary">{t("accessibility.dark")}</Typography>
            </Stack>
          </Box>

          <Divider />

          <PreferenceSwitch
            checked={highContrast}
            onChange={setHighContrast}
            title={t("accessibility.highContrast")}
            description={t("accessibility.highContrastDescription")}
          />
          <PreferenceSwitch
            checked={largeText}
            onChange={setLargeText}
            title={t("accessibility.largeText")}
            description={t("accessibility.largeTextDescription")}
          />
          <PreferenceSwitch
            checked={reduceMotion}
            onChange={setReduceMotion}
            title={t("accessibility.reduceMotion")}
            description={t("accessibility.reduceMotionDescription")}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between" }}>
        <Button color="inherit" startIcon={<RotateCcw size={16} />} onClick={resetPreferences}>
          {t("accessibility.reset")}
        </Button>
        <Button variant="contained" onClick={onClose}>{t("auth.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

interface PreferenceSwitchProps {
  checked: boolean;
  description: string;
  onChange: (checked: boolean) => void;
  title: string;
}

function PreferenceSwitch({ checked, description, onChange, title }: PreferenceSwitchProps) {
  return (
    <FormControlLabel
      sx={{ alignItems: "flex-start", gap: 1, m: 0 }}
      control={<Switch checked={checked} onChange={event => onChange(event.target.checked)} />}
      label={
        <Box sx={{ pt: 0.4 }}>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
      }
    />
  );
}

export function AccessibilitySettingsButton() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Tooltip title={t("accessibility.settings")}>
        <IconButton
          type="button"
          aria-label={t("accessibility.settings")}
          onClick={() => setIsOpen(true)}
          sx={{
            position: "fixed",
            zIndex: 1300,
            top: 16,
            right: 16,
            width: 44,
            height: 44,
            color: "text.primary",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: "0 8px 20px rgb(20 45 82 / 16%)",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <AccessibilityIcon size={20} />
        </IconButton>
      </Tooltip>
      <AccessibilitySettingsDialog open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export function ThemeModeSwitcher() {
  const { t } = useTranslation();
  const { resolvedColorMode, setColorMode } = useAccessibility();
  const isDark = resolvedColorMode === "dark";
  const actionLabel = t(isDark ? "accessibility.switchToLight" : "accessibility.switchToDark");

  return (
    <Tooltip title={actionLabel}>
      <IconButton
        type="button"
        aria-label={actionLabel}
        aria-pressed={isDark}
        onClick={() => setColorMode(isDark ? "light" : "dark")}
        sx={{
          width: 44,
          height: 44,
          color: "text.primary",
          border: "2px solid",
          borderColor: "background.paper",
          bgcolor: "background.paper",
          boxShadow: "0 8px 20px rgb(20 45 82 / 16%)",
          "&:hover": {
            bgcolor: "action.hover",
            boxShadow: "0 10px 24px rgb(20 45 82 / 20%)",
          },
        }}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </IconButton>
    </Tooltip>
  );
}
