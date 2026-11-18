import { useConvexAuth } from "convex/react";
import { SignIn } from "./components/SignIn";
import { Workspace } from "./components/Workspace";
import { Wordmark } from "./components/Wordmark";

export function App() {
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
