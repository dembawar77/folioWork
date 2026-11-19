import { useConvexAuth } from "convex/react";
import { SignIn } from "./components/SignIn";
import { Workspace } from "./components/Workspace";
import { Wordmark } from "./components/Wordmark";
import { IntakePage } from "./components/IntakePage";

export function App() {
  // Page publique de la boîte de dépôt : aucune connexion requise.
  const intake = window.location.pathname.match(/^\/demande\/([a-z0-9-]{3,30})\/?$/i);
  if (intake) return <IntakePage slug={intake[1].toLowerCase()} />;
  return <PrivateApp />;
}

function PrivateApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Wordmark muted />
      </div>
    );
  }
  return isAuthenticated ? <Workspace /> : <SignIn />;
}
