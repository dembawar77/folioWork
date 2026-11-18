import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./users";

/** Clé publique VAPID, nécessaire au navigateur pour s'abonner. */
export const vapidPublicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return subs.map((s) => ({ _id: s._id, endpoint: s.endpoint, deviceLabel: s.deviceLabel, createdAt: s._creationTime }));
  },
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), deviceLabel: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!args.endpoint.startsWith("https://")) throw new ConvexError("Abonnement invalide");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const doc = { ...args, userId, deviceLabel: args.deviceLabel.slice(0, 60) };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("pushSubscriptions", doc);
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing && existing.userId === userId) await ctx.db.delete(existing._id);
  },
});

export const sendTest = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    await ctx.scheduler.runAfter(0, internal.notify.sendTest, { userId });
  },
});

// ─── Interne ────────────────────────────────────────────────────────────────

export const targetsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const telegram = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      subscriptions: subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      telegramChatId: telegram?.chatId ?? null,
    };
  },
});

export const removeDeadSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
