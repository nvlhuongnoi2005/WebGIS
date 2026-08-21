import {
  Avatar,
  Box,
  IconButton,
  Popover,
  Tooltip,
} from "@mui/material";
import {
  type MouseEvent,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { User } from "./profileData";
import ProfilePanel from "./ProfilePanel";

export default function Profile() {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(User.imageUrl);
  const isOpen = Boolean(anchorEl);

  function handleProfileClick(event: MouseEvent<HTMLButtonElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClosePanel() {
    setAnchorEl(null);
  }

  return (
    <>
      <Tooltip title={t("profile.openMenu")}>
        <IconButton
          onClick={handleProfileClick}
          type="button"
          aria-label={t("profile.openMenu")}
          size="small"
          sx={{
            width: 45,
            height: 45,
            p: 0,
            borderRadius: "50%",
            border: "2px solid #ffffff",
            backgroundColor: "#ffffff",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            overflow: "hidden",
            boxSizing: "border-box",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease",
            "&:hover": {
              transform: "scale(1.1)",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.28)",
              backgroundColor: "#ffffff",
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
          <Avatar
            src={avatarUrl}
            alt={User.name}
            sx={{
              width: "100%",
              height: "100%",
              border: "3px solid #e2e8f0",
              objectFit: "cover",
            }}
          />
        </IconButton>
      </Tooltip>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClosePanel}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <Box sx={{ p: 2, minWidth: 240}}>
          <ProfilePanel
            userName={User.name}
            avatarUrl={avatarUrl}
            onAvatarChange={setAvatarUrl}
            onClose={handleClosePanel}
            onViewProfile={handleClosePanel}
            onSignOut={handleClosePanel}
          />
        </Box>
      </Popover>
    </>
  );
}
