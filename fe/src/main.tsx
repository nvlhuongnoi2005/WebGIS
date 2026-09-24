import { StrictMode } from "react";

import { createRoot } from "react-dom/client";

import "./index.css";
import "./i18n";

import App from "./App.tsx";
import { AccessibilityProvider } from "./features/accessibility";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccessibilityProvider>
      <App />
    </AccessibilityProvider>
  </StrictMode>
);
