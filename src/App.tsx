import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { SignIn } from "./components/SignIn";
import { Workspace } from "./components/Workspace";
import { IntakePage } from "./components/IntakePage";
import { hideSplash } from "./lib/splash";

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
  // Tant que la session se vérifie, l'écran de lancement animé (index.html) reste affiché.
  useEffect(() => {
    if (!isLoading) hideSplash();
  }, [isLoading]);
  if (isLoading) return null;
  return isAuthenticated ? <Workspace /> : <SignIn />;
}
