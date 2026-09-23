import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { KeyRound, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./useAuth";

interface ForcePasswordChangePageProps {
  onComplete: () => void;
}

export default function ForcePasswordChangePage({ onComplete }: ForcePasswordChangePageProps) {
  const { t } = useTranslation();
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError(t("auth.passwordLength"));
      return;
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError(t("auth.passwordPolicy"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t("auth.newPasswordSameAsCurrent"));
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.code === "currentPasswordInvalid"
        ? t("auth.currentPasswordInvalid")
        : result.code === "newPasswordInvalid"
          ? t("auth.passwordPolicy")
          : result.code === "newPasswordSameAsCurrent"
            ? t("auth.newPasswordSameAsCurrent")
          : t("auth.passwordChangeFailed"));
      return;
    }
    onComplete();
  };

  const handleLogout = async () => {
    await logout();
    onComplete();
  };

  return (
    <Box component="main" id="main-content" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper elevation={3} sx={{ width: "100%", maxWidth: 480, p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}>
        <Stack component="form" spacing={2} onSubmit={event => void handleSubmit(event)}>
          <Box sx={{ color: "primary.main" }}><KeyRound size={28} /></Box>
          <Typography variant="h5" sx={{ fontWeight: 750 }}>{t("auth.temporaryPasswordTitle")}</Typography>
          <Typography color="text.secondary">{t("auth.temporaryPasswordDescription")}</Typography>
          <TextField
            type="password"
            autoComplete="current-password"
            label={t("auth.currentPassword")}
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            required
            autoFocus
            fullWidth
          />
          <TextField
            type="password"
            autoComplete="new-password"
            label={t("auth.newPassword")}
            helperText={t("auth.passwordPolicy")}
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            required
            fullWidth
          />
          <TextField
            type="password"
            autoComplete="new-password"
            label={t("auth.confirmPassword")}
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            required
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={submitting}>
            {t("auth.changePassword")}
          </Button>
          <Button type="button" variant="text" startIcon={<LogOut size={17} />} onClick={() => void handleLogout()}>
            {t("profile.signOut")}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
