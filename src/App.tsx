import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { SignIn } from "./components/SignIn";
import { Workspace } from "./components/Workspace";
import { IntakePage } from "./components/IntakePage";
import { hideSplash } from "./lib/splash";
import { clearOffline, hasCachedData } from "./lib/offline";

export function App() {
  // Page publique de la boîte de dépôt : aucune connexion requise.
  const intake = window.location.pathname.match(/^\/demande\/([a-z0-9-]{3,30})\/?$/i);
  useEffect(() => {
    if (intake) hideSplash();
  }, [intake]);
  if (intake) return <IntakePage slug={intake[1].toLowerCase()} />;
  return <PrivateApp />;
}

function PrivateApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  // Session enregistrée sur l'appareil et données déjà reçues : on ouvre tout de suite
  // sur les tâches gardées en mémoire, sans attendre le serveur (indispensable hors ligne).
  const token = useAuthToken();
  const instant = isLoading && !!token && hasCachedData();
  const ready = !isLoading || instant;
  // Session terminée (déconnexion, session révoquée) : rien ne reste sur l'appareil.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !token) void clearOffline();
  }, [isLoading, isAuthenticated, token]);
  // Tant que la session se vérifie, l'écran de lancement animé (index.html) reste affiché.
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);
  if (!ready) return null;
  return isAuthenticated || instant ? <Workspace /> : <SignIn />;
}
