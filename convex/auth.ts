import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { components, internal } from "./_generated/api";

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

function allowedOrigins(): string[] {
  const fromEnv = (process.env.SITE_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...fromEnv, "http://localhost:5173"];
}

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: allowedOrigins(),
}).attachUserCallbacks({
  createUser: internal.users.createUserGoogle,
  onSignIn: internal.users.onSignInGoogle,
});
