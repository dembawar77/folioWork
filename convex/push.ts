import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./users";
import { revokeActionTokens } from "./tasks";
import { DEFAULT_PREFS } from "./preferences";

/**
 * Services de notification des navigateurs acceptés (Chrome/Android, Firefox, Safari/iOS, Edge/Windows).
 * Toute autre adresse est refusée : le serveur ne doit contacter que ces services.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const B64URL = /^[A-Za-z0-9_-]+$/;

function checkSubscription(endpoint: string, p256dh: string, auth: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ConvexError("Abonnement invalide");
  }
  if (url.protocol !== "https:" || url.port || url.username || !PUSH_HOSTS.some((re) => re.test(url.hostname))) {
    throw new ConvexError("Service de notification non pris en charge");
  }
  // Clé publique P-256 non compressée (65 octets) et secret d'authentification (16 octets), en base64url.
  if (!B64URL.test(p256dh) || p256dh.length !== 87 || !B64URL.test(auth) || auth.length !== 22) {
    throw new ConvexError("Abonnement invalide");
  }
}

const TEST_COOLDOWN = 30_000;

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
    if (args.endpoint.length > 1000) throw new ConvexError("Abonnement invalide");
    checkSubscription(args.endpoint, args.p256dh, args.auth);
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
    // Appareil retiré ou déconnecté : les boutons des notifications déjà affichées ne servent plus.
    await revokeActionTokens(ctx, userId);
  },
});

export const sendTest = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const prefs = await ctx.db
      .query("preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (prefs?.lastTestPushAt && now - prefs.lastTestPushAt < TEST_COOLDOWN) {
      throw new ConvexError("Un test vient d'être envoyé. Patientez 30 secondes.");
    }
    if (prefs) await ctx.db.patch(prefs._id, { lastTestPushAt: now });
    else await ctx.db.insert("preferences", { userId, ...DEFAULT_PREFS, lastTestPushAt: now });
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
