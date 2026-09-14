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
import { useAuth } from "../../features/auth";
import ProfileDialog from "./ProfileDialog";
import ProfilePanel from "./ProfilePanel";

export default function Profile() {
  const { t } = useTranslation();
  const { logout, updateAvatar, updateContactDetails, user } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const isOpen = Boolean(anchorEl);

  if (!user) return null;

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
            borderRadius: 3,
            border: "2px solid #ffffff",
            backgroundColor: "#ffffff",
            boxShadow: "0 8px 20px rgb(20 45 82 / 16%)",
            overflow: "hidden",
            boxSizing: "border-box",
            "&:hover": {
              boxShadow: "0 10px 24px rgb(20 45 82 / 20%)",
              backgroundColor: "#ffffff",
            },
            "&:focus-visible": {
              outline: "2px solid #1565c0",
              outlineOffset: 2,
            },
          }}
        >
          <Avatar
            src={user.avatarUrl}
            alt={user.name}
            sx={{
              width: "100%",
              height: "100%",
              border: "3px solid #dce9ff",
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
        slotProps={{
          paper: {
            sx: {
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 4,
              boxShadow: "0 18px 42px rgb(20 45 82 / 20%)",
            },
          },
        }}
      >
        <Box sx={{ p: 1, minWidth: 300 }}>
          <ProfilePanel
            userName={user.name}
            userEmail={user.email}
            organization={user.organization}
            avatarUrl={user.avatarUrl ?? ""}
            onAvatarChange={updateAvatar}
            onClose={handleClosePanel}
            onViewProfile={() => setIsProfileDialogOpen(true)}
            onSignOut={logout}
          />
        </Box>
      </Popover>
      {isProfileDialogOpen && (
        <ProfileDialog
          open
          user={user}
          onClose={() => setIsProfileDialogOpen(false)}
          onSave={updateContactDetails}
        />
      )}
    </>
  );
}
