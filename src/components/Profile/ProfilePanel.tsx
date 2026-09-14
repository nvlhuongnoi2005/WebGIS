import {
  Avatar,
  Button,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { Building2, Camera, LogOut, Mail, UserRound } from "lucide-react";
import {
  type ChangeEvent,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
interface ProfilePanelProps {
  userName: string;
  userEmail: string;
  organization?: string;
  avatarUrl: string;
  onAvatarChange: (avatarUrl: string) => void;
  onClose: () => void;
  onViewProfile: () => void;
  onSignOut: () => void;
}

export default function ProfilePanel({
  userName,
  userEmail,
  organization,
  avatarUrl,
  onAvatarChange,
  onClose,
  onViewProfile,
  onSignOut,
}: ProfilePanelProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleOpenFilePicker() {
    fileInputRef.current?.click();
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextAvatarUrl = reader.result;

      if (typeof nextAvatarUrl === "string") {
        onAvatarChange(nextAvatarUrl);
      }
    };

    reader.readAsDataURL(file);
  }

  function handleViewProfile() {
    onViewProfile();
    onClose();
  }

  function handleSignOut() {
    onSignOut();
    onClose();
  }

  return (
    <Stack spacing={1} sx={{ width: 300 }}>
      <Stack
        spacing={1.25}
        sx={{
          p: 1.5,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "primary.light",
          bgcolor: "primary.light",
        }}
      >
        <Avatar
          src={avatarUrl}
          alt={userName}
          sx={{
            width: 60,
            height: 60,
            border: "3px solid #ffffff",
            boxShadow: "0 4px 12px rgb(11 87 208 / 20%)",
          }}
        />

        <Typography
          variant="subtitle1"
          color="text.primary"
          sx={{ maxWidth: "100%", fontWeight: 750, textAlign: "center" }}
          noWrap
        >
          {userName}
        </Typography>
        <Stack spacing={0.5} sx={{ width: "100%" }}>
          <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center", color: "text.secondary" }}>
            <Mail size={15} />
            <Typography variant="caption" noWrap>{userEmail}</Typography>
          </Stack>
          {organization && (
            <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center", color: "text.secondary" }}>
              <Building2 size={15} />
              <Typography variant="caption" noWrap>{organization}</Typography>
            </Stack>
          )}
        </Stack>

        <Button
          variant="text"
          size="small"
          startIcon={<Camera size={15} />}
          onClick={handleOpenFilePicker}
          sx={{ minHeight: 32 }}
        >
          {t("profile.uploadAvatar")}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleAvatarUpload}
        />
      </Stack>

      <Divider sx={{ my: 0.5 }} />

      <Button
        variant="contained"
        startIcon={<UserRound size={17} />}
        onClick={handleViewProfile}
        fullWidth
      >
        {t("profile.viewProfile")}
      </Button>

      <Button
        variant="text"
        color="error"
        startIcon={<LogOut size={17} />}
        onClick={handleSignOut}
        fullWidth
      >
        {t("profile.signOut")}
      </Button>
    </Stack>
  );
}
