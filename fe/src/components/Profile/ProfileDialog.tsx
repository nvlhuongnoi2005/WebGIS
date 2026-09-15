import { useState, type FormEvent } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { AuthResult, AuthUser } from "../../features/auth/AuthStore";

interface ProfileDialogProps {
  open: boolean;
  user: AuthUser;
  onClose: () => void;
  onSave: (email: string, phone: string) => Promise<AuthResult>;
}

export default function ProfileDialog({
  open,
  user,
  onClose,
  onSave,
}: ProfileDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setError(t("profile.emailRequired"));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t("profile.emailInvalid"));
      return;
    }

    if (!phone.trim()) {
      setError(t("profile.phoneRequired"));
      return;
    }

    if (!isValidPhone(phone)) {
      setError(t("profile.phoneInvalid"));
      return;
    }

    const result = await onSave(email, phone);
    if (!result.ok) {
      setError(t(`auth.${result.code}`));
      return;
    }

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { overflow: "hidden" } } }}
    >
      <Box component="form" onSubmit={event => void handleSubmit(event)} noValidate>
        <DialogTitle sx={{ px: 3, pt: 2.5, pb: 2.25, bgcolor: "primary.light", borderBottom: "1px solid", borderColor: "divider" }}>
          {t("profile.accountTitle")}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Stack spacing={2.25}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1.5, borderRadius: 3, bgcolor: "action.hover" }}>
              <Avatar
                src={user.avatarUrl}
                alt={user.name}
                sx={{ width: 56, height: 56, border: "3px solid", borderColor: "background.paper", boxShadow: "0 4px 12px rgb(11 87 208 / 20%)" }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{user.name}</Typography>
                <Typography variant="body2" color="text.secondary">{user.organization ?? "—"}</Typography>
              </Box>
            </Stack>

            <Divider />

            <TextField
              label={t("profile.fullName")}
              value={user.name}
              slotProps={{ input: { readOnly: true } }}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label={t("profile.dateOfBirth")}
                value={user.dateOfBirth ?? "—"}
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
              <TextField
                label={t("profile.organization")}
                value={user.organization ?? "—"}
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
            </Stack>
            <TextField
              autoComplete="email"
              label={t("profile.email")}
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              fullWidth
            />
            <TextField
              autoComplete="tel"
              type="tel"
              label={t("profile.phone")}
              value={phone}
              onChange={event => setPhone(event.target.value)}
              required
              fullWidth
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose}>{t("profile.cancel")}</Button>
          <Button type="submit" variant="contained">{t("profile.saveChanges")}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value.replace(/[\s().-]/g, ""));
}
