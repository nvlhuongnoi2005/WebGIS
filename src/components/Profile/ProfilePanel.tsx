import {
  Avatar,
  Button,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import {
  type ChangeEvent,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";

interface ProfilePanelProps {
  userName: string;
  avatarUrl: string;
  onAvatarChange: (avatarUrl: string) => void;
  onClose: () => void;
  onViewProfile: () => void;
  onSignOut: () => void;
}

export default function ProfilePanel({
  userName,
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
    <Stack spacing={1.5} sx={{ width: 280 }}>
      <Stack
        spacing={1}
        sx={{
          pt: 0.5,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Avatar
          src={avatarUrl}
          alt={userName}
          sx={{
            width: 50,
            height: 50,
            border: "3px solid #e2e8f0",
          }}
        />

        <Button
          variant="outlined"
          size="small"
          onClick={handleOpenFilePicker}
        
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

        <Typography
          variant="subtitle1"
          color="text.primary"
          sx={{ fontWeight: 700 }}
        >
          {userName}
        </Typography>
      </Stack>

      <Divider />

      <Button
        variant="contained"
        onClick={handleViewProfile}
        fullWidth
      >
        {t("profile.viewProfile")}
      </Button>

      <Button
        variant="text"
        color="error"
        onClick={handleSignOut}
        fullWidth
      >
        {t("profile.signOut")}
      </Button>
    </Stack>
  );
}
