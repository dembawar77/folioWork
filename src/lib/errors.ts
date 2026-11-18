import { ConvexError } from "convex/values";

export function errorMessage(err: unknown, fallback = "Une erreur est survenue"): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  if (err instanceof Error && !err.message.includes("Server Error")) return err.message;
  return fallback;
}
