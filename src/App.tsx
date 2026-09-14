import { useEffect, useState } from "react";
import { AuthProvider, LoginPage, useAuth } from "./features/auth";
import { MapView } from "./features/map";

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user } = useAuth();
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

  if (pathname === "/login") {
    if (user) return <Redirect to="/map" navigate={navigate} />;
    return <LoginPage onAuthenticated={() => navigate("/map", true)} />;
  }

  if (pathname === "/map") {
    if (!user) return <Redirect to="/login" navigate={navigate} />;
    return <MapView />;
  }

  return <Redirect to={user ? "/map" : "/login"} navigate={navigate} />;
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
