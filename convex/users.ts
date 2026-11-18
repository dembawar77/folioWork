import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const vGoogleMethod = v.object({ name: v.literal("google"), profile: vGoogleProfile });

export const createUserGoogle = internalMutation({
  args: { method: vGoogleMethod },
  returns: v.id("users"),
  handler: async (ctx, { method }) => {
    const { profile } = method;
    return await ctx.db.insert("users", {
      name: profile.name,
      email: profile.emailVerified ? profile.email : undefined,
      image: profile.picture,
    });
  },
});

export const onSignInGoogle = internalMutation({
  args: { method: vGoogleMethod, userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { method, userId }) => {
    const { profile } = method;
    await ctx.db.patch(userId, { name: profile.name, image: profile.picture });
    return null;
  },
});

/** Identifiant de l'utilisateur connecté, ou erreur. */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Non connecté");
  return userId as Id<"users">;
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId as Id<"users">);
  },
});
