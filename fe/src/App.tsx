import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { AccessibilitySettingsButton } from "./features/accessibility";
import { AuthProvider, LoginPage, useAuth } from "./features/auth";
import { MapView } from "./features/map";

// Register the Vite-emitted worker before any map instance is created.
setWorkerUrl(maplibreWorkerUrl);

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [pathname, setPathname] = useState(getPathname);

  useEffect(() => {
    const handlePopState = () => setPathname(getPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (to: "/login" | "/map", replace = false) => {
    if (window.location.pathname !== to) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", to);
      setPathname(to);
    }
  };

  let content: React.ReactNode;
  if (isLoading) {
    content = null;
  } else if (pathname === "/login") {
    content = user
      ? <Redirect to="/map" navigate={navigate} />
      : <LoginPage onAuthenticated={() => navigate("/map", true)} />;
  } else if (pathname === "/map") {
    content = user
      ? <MapView />
      : <Redirect to="/login" navigate={navigate} />;
  } else {
    content = <Redirect to={user ? "/map" : "/login"} navigate={navigate} />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">{t("accessibility.skipToContent")}</a>
      {content}
      {pathname === "/login" && !user && <AccessibilitySettingsButton />}
    </>
  );
}

interface RedirectProps {
  to: "/login" | "/map";
  navigate: (to: "/login" | "/map", replace?: boolean) => void;
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

export default App;
