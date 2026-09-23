import { createContext } from "react";

export type AppNavigate = (path: string, replace?: boolean) => void;

export const AppNavigationContext = createContext<AppNavigate>(path => {
  window.location.assign(path);
});
