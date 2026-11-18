import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { App } from "./App";
import { registerServiceWorker } from "./lib/push";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

const root = createRoot(document.getElementById("root")!);

if (!url) {
  root.render(
    <div className="p-8 font-sans text-ink-2">
      <p>
        Configuration manquante : <code className="tabular">VITE_CONVEX_URL</code>. Voir <code>SETUP.md</code>.
      </p>
    </div>,
  );
} else {
  const convex = new ConvexReactClient(url);
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
