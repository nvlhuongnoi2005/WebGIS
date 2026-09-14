import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAuth } from "./useAuth";

interface PasswordResetDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function PasswordResetDialog({ open, onClose }: PasswordResetDialogProps) {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValidEmail(email)) {
      setError(t("auth.emailInvalid"));
      return;
    }

    if (password.length < 6) {
      setError(t("auth.passwordLength"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    const result = await resetPassword(email, password);
    if (!result.ok) {
      setError(t(`auth.${result.code}`));
      return;
    }

    setError(null);
    setIsComplete(true);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={event => void handleSubmit(event)} noValidate>
        <DialogTitle>{t("auth.resetPasswordTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("auth.resetPasswordDescription")}
            </Typography>
            <TextField
              autoComplete="email"
              autoFocus
              label={t("auth.email")}
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              fullWidth
              disabled={isComplete}
            />
            <TextField
              autoComplete="new-password"
              type="password"
              label={t("auth.newPassword")}
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              fullWidth
              disabled={isComplete}
            />
            <TextField
              autoComplete="new-password"
              type="password"
              label={t("auth.confirmPassword")}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              required
              fullWidth
              disabled={isComplete}
            />
            {error && <Alert severity="error">{error}</Alert>}
            {isComplete && <Alert severity="success">{t("auth.passwordResetSuccess")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose}>{t(isComplete ? "auth.close" : "auth.cancel")}</Button>
          {!isComplete && <Button type="submit" variant="contained">{t("auth.resetPassword")}</Button>}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
