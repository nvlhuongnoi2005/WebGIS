import {
  Alert,
  Avatar,
  Button,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { Accessibility, Building2, Camera, Link2, LogOut, Mail, ReceiptText, UserRound } from "lucide-react";
import {
  type ChangeEvent,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { AuthResult } from "../../features/auth/AuthStore";
interface ProfilePanelProps {
  userName: string;
  userEmail: string;
  organization?: string;
  avatarUrl: string;
  onAvatarChange: (avatarUrl: string) => Promise<AuthResult>;
  onClose: () => void;
  onOpenAccessibility: () => void;
  onViewProfile: () => void;
  onOpenSharedLinks: () => void;
  onSignOut: () => void;
}

export default function ProfilePanel({
  userName,
  userEmail,
  organization,
  avatarUrl,
  onAvatarChange,
  onClose,
  onOpenAccessibility,
  onViewProfile,
  onOpenSharedLinks,
  onSignOut,
}: ProfilePanelProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function handleOpenFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupportedAvatarFile(file)) {
      setAvatarError(t("profile.avatarFormatError"));
      return;
    }

    setAvatarError(null);

    try {
      const nextAvatarUrl = await createAvatarDataUrl(file);
      const result = await onAvatarChange(nextAvatarUrl);

      if (!result.ok) {
        setAvatarError(t("profile.avatarSaveError"));
      }
    } catch {
      setAvatarError(t("profile.avatarProcessError"));
    }
  }

  function handleViewProfile() {
    onViewProfile();
    onClose();
  }

  function handleOpenSharedLinks() {
    onOpenSharedLinks();
    onClose();
  }

  async function handleSignOut() {
    await onSignOut();
    onClose();
  }

  function handleOpenAccessibility() {
    onOpenAccessibility();
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
            border: "3px solid",
            borderColor: "background.paper",
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
          sx={{ minHeight: 40, py: 0.25 }}
        >
          <Stack spacing={0} sx={{ alignItems: "flex-start", lineHeight: 1.1 }}>
            <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
              {t("profile.uploadAvatar")}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {t("profile.avatarFormats")}
            </Typography>
          </Stack>
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          hidden
          onChange={handleAvatarUpload}
        />

        {avatarError && <Alert severity="error" sx={{ width: "100%", py: 0 }}>{avatarError}</Alert>}
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
        variant="outlined"
        startIcon={<Link2 size={17} />}
        onClick={handleOpenSharedLinks}
        fullWidth
      >
        {t("profile.yourLinks")}
      </Button>

      <Button
        component="a"
        href="/billing"
        variant="outlined"
        startIcon={<ReceiptText size={17} />}
        fullWidth
      >
        {t("billing.title")}
      </Button>

      <Button
        variant="outlined"
        startIcon={<Accessibility size={17} />}
        onClick={handleOpenAccessibility}
        fullWidth
      >
        {t("accessibility.settings")}
      </Button>

      <Button
        variant="text"
        color="error"
        startIcon={<LogOut size={17} />}
          onClick={() => void handleSignOut()}
        fullWidth
      >
        {t("profile.signOut")}
      </Button>
    </Stack>
  );
}

function isSupportedAvatarFile(file: File): boolean {
  return ["image/jpeg", "image/png"].includes(file.type)
    || /\.jpe?g$|\.png$/i.test(file.name);
}

async function createAvatarDataUrl(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is not available.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.84);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}
