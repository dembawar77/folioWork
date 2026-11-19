import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { App } from "./App";
import { registerServiceWorker } from "./lib/push";
import { hideSplash } from "./lib/splash";
import { loadOffline, startSync } from "./lib/offline";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

// Contenu partagé depuis une autre app (WhatsApp, Gmail…) : lu tout de suite et mis de côté,
// avant que l'app ne réécrive l'adresse — et même si une connexion est d'abord nécessaire.
{
  const p = new URLSearchParams(window.location.search);
  const shared = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).join(" ").trim();
  if (shared) {
    try {
      sessionStorage.setItem("fw-shared", shared.slice(0, 380));
    } catch {
      (window as unknown as { __fwShared?: string }).__fwShared = shared.slice(0, 380);
    }
  }
}

const root = createRoot(document.getElementById("root")!);

if (!url) {
  hideSplash();
  root.render(
    <div className="p-8 font-sans text-ink-2">
      <p>
        Configuration manquante : <code className="tabular">VITE_CONVEX_URL</code>. Voir <code>SETUP.md</code>.
      </p>
    </div>,
  );
} else {
  const convex = new ConvexReactClient(url);
  startSync(convex);
  // Les dernières données gardées sur l'appareil sont lues avant le premier affichage.
  await loadOffline();
  root.render(
    <StrictMode>
      <ConvexAuthProvider
        client={convex}
        api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
      >
        <App />
      </ConvexAuthProvider>
    </StrictMode>,
  );
  registerServiceWorker();
}
