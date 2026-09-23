import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { AccessibilitySettingsButton } from "./features/accessibility";
import { AuthProvider, LoginPage, useAuth } from "./features/auth";
import ForcePasswordChangePage from "./features/auth/ForcePasswordChangePage";
import { NotificationProvider } from "./features/notifications";
import AdminDashboard from "./admin/AdminDashboard";
import BillingPage from "./features/billing/BillingPage";
import { MapView } from "./features/map";
import SharedGeoJSONPage from "./features/map/SharedGeoJSONPage";
import SharedWithMePage from "./features/map/SharedWithMePage";
import SwaggerPage from "./swagger/SwaggerPage";
import { AppNavigationContext } from "./appNavigation";

// Register the Vite-emitted worker before any map instance is created.
setWorkerUrl(maplibreWorkerUrl);

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  return (
    <NotificationProvider key={user?.id ?? "anonymous"} userId={user?.id}>
      <AppRoutes />
    </NotificationProvider>
  );
}

function AppRoutes() {
  const { user, isLoading, reauthenticationRequired, acknowledgeReauthentication } = useAuth();
  const { t } = useTranslation();
  const [pathname, setPathname] = useState(getPathname);

  useEffect(() => {
    const handlePopState = () => setPathname(getPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (to: AppPath, replace = false) => {
    if (window.location.pathname !== to) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", to);
      setPathname(to);
    }
  };

  let content: React.ReactNode;
  if (isLoading) {
    content = null;
  } else if (user?.mustChangePassword) {
    content = <ForcePasswordChangePage onComplete={() => navigate("/login", true)} />;
  } else if (pathname === "/swagger") {
    content = <SwaggerPage />;
  } else if (pathname.startsWith("/share/")) {
    content = <SharedGeoJSONPage token={pathname.slice("/share/".length)} />;
  } else if (pathname.startsWith("/shared-with-me/")) {
    content = user
      ? <SharedGeoJSONPage shareId={pathname.slice("/shared-with-me/".length)} />
      : <Redirect to="/login" navigate={navigate} />;
  } else if (pathname === "/shared-with-me") {
    content = user
      ? <SharedWithMePage />
      : <Redirect to="/login" navigate={navigate} />;
  } else if (pathname === "/login") {
    content = user
      ? <Redirect to="/map" navigate={navigate} />
      : <LoginPage onAuthenticated={() => navigate("/map", true)} />;
  } else if (pathname === "/map") {
    content = user
      ? <MapView onNavigate={navigate} />
      : <Redirect to="/login" navigate={navigate} />;
  } else if (pathname === "/billing") {
    content = user
      ? <BillingPage />
      : <Redirect to="/login" navigate={navigate} />;
  } else if (pathname === "/admin" || pathname === "/admin/billing" || pathname === "/admin/users" || pathname === "/admin/audit") {
    content = user?.role === "admin"
      ? <AdminDashboard />
      : <Redirect to={user ? "/map" : "/login"} navigate={navigate} />;
  } else {
    content = <Redirect to={user ? "/map" : "/login"} navigate={navigate} />;
  }

  return (
    <AppNavigationContext.Provider value={navigate}>
      <>
      <a className="skip-link" href="#main-content">{t("accessibility.skipToContent")}</a>
      {content}
      {pathname === "/login" && !user && <AccessibilitySettingsButton />}
      <Dialog open={reauthenticationRequired} aria-labelledby="session-updated-title">
        <DialogTitle id="session-updated-title">{t("auth.sessionUpdatedTitle")}</DialogTitle>
        <DialogContent><Typography>{t("auth.sessionUpdatedDescription")}</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="contained" onClick={acknowledgeReauthentication}>{t("auth.sessionUpdatedAction")}</Button>
        </DialogActions>
      </Dialog>
      </>
    </AppNavigationContext.Provider>
  );
}

interface RedirectProps {
  to: AppPath;
  navigate: (to: AppPath, replace?: boolean) => void;
}

function Redirect({ to, navigate }: RedirectProps) {
  useEffect(() => {
    navigate(to, true);
  }, [navigate, to]);

  return null;
}

function getPathname(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

type AppPath = string;

export default App;
