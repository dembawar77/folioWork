import { useConvexAuth } from "convex/react";
import { SignIn } from "./components/SignIn";
import { Workspace } from "./components/Workspace";

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="font-display text-lg font-bold tracking-tight text-ink-3">FolioWork</span>
      </div>
    );
  }
  return isAuthenticated ? <Workspace /> : <SignIn />;
}
