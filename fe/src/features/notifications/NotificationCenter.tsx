import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type PropsWithChildren,
} from "react";
import {
  Badge,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Bell, CheckCheck, Info, Share2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppNavigationContext } from "../../appNavigation";
import {
  type AppNotification,
  type NewNotification,
  subscribeToNotifications,
} from "./notificationEvents";

interface NotificationContextValue {
  notifications: AppNotification[];
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function createNotification(notification: NewNotification): AppNotification {
  return {
    ...notification,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    read: false,
  };
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }, []);

  useEffect(
    () =>
      subscribeToNotifications((notification) => {
        setNotifications((current) => {
          if (
            notification.dedupeKey &&
            current.some((item) => item.dedupeKey === notification.dedupeKey)
          )
            return current;
          return [createNotification(notification), ...current].slice(0, 20);
        });
      }),
    []
  );

  const value = useMemo(() => ({ notifications, markAllRead }), [markAllRead, notifications]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

function useNotificationCenter(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("NotificationButton must be used within NotificationProvider");
  return value;
}

export function NotificationButton() {
  const { t } = useTranslation();
  const { notifications, markAllRead } = useNotificationCenter();
  const navigate = useContext(AppNavigationContext);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const open = Boolean(anchor);
  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget);
    markAllRead();
  };

  return (
    <>
      <Tooltip title={t("notifications.open")}>
        <IconButton
          type="button"
          aria-label={t("notifications.open")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={openMenu}
          sx={controlSx}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={9}
            aria-label={t("notifications.unreadCount", { count: unreadCount })}
          >
            <Bell size={20} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { "aria-label": t("notifications.title") },
          paper: {
            sx: {
              mt: 1.5,
              width: { xs: "calc(100vw - 32px)", sm: 360 },
              maxHeight: 440,
              borderRadius: 2,
            },
          },
        }}
      >
        <Stack
          direction="row"
          sx={{ px: 2, pt: 1.5, pb: 0.75, alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography variant="subtitle1">{t("notifications.title")}</Typography>
          {notifications.length > 0 && (
            <Button size="small" startIcon={<CheckCheck size={16} />} onClick={markAllRead}>
              {t("notifications.markAllRead")}
            </Button>
          )}
        </Stack>
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Button
            onClick={() => navigate("/shared-with-me")}
            size="small"
            fullWidth
            startIcon={<Share2 size={16} />}
          >
            {t("notifications.sharedWithMe")}
          </Button>
        </Box>
        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography color="text.secondary">{t("notifications.empty")}</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {notifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </List>
        )}
      </Menu>
    </>
  );
}

function NotificationItem({ notification }: { notification: AppNotification }) {
  const { t } = useTranslation();
  const navigate = useContext(AppNavigationContext);
  const Icon =
    notification.kind === "quota" ? TriangleAlert : notification.kind === "share" ? Share2 : Info;
  return (
    <ListItem
      divider
      sx={{
        alignItems: "flex-start",
        gap: 1.25,
        py: 1.5,
        bgcolor: notification.read ? "transparent" : "action.selected",
      }}
    >
      <Box sx={{ color: notification.kind === "quota" ? "error.main" : "primary.main", pt: 0.25 }}>
        <Icon size={19} />
      </Box>
      <ListItemText
        primary={t(notification.titleKey, notification.values)}
        secondary={t(notification.descriptionKey, notification.values)}
        slotProps={{
          primary: { sx: { fontWeight: notification.read ? 600 : 750 } },
          secondary: { sx: { mt: 0.25 } },
        }}
      />
      {notification.actionHref && notification.actionLabelKey && (
        <Button
          size="small"
          onClick={() => navigate(notification.actionHref!)}
          sx={{ flexShrink: 0 }}
        >
          {t(notification.actionLabelKey)}
        </Button>
      )}
    </ListItem>
  );
}

const controlSx = {
  width: 44,
  height: 44,
  color: "text.primary",
  border: "2px solid",
  borderColor: "background.paper",
  bgcolor: "background.paper",
  boxShadow: "0 8px 20px rgb(20 45 82 / 16%)",
  "&:hover": { bgcolor: "action.hover", boxShadow: "0 10px 24px rgb(20 45 82 / 20%)" },
};
