import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./users";
import { tg } from "./lib/telegram";

const CODE_TTL = 10 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** État de la liaison Telegram pour l'écran Alertes. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      linked: !!link,
      username: link?.username ?? null,
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    };
  },
});

/** Génère un code à usage unique (10 min) à envoyer au bot via /start CODE. */
export const createLinkCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const old = await ctx.db
      .query("telegramLinkCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const o of old) await ctx.db.delete(o._id);
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    await ctx.db.insert("telegramLinkCodes", { userId, code, expiresAt: Date.now() + CODE_TTL });
    return code;
  },
});

export const unlink = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (link) await ctx.db.delete(link._id);
  },
});

// ─── Interne (webhook) ──────────────────────────────────────────────────────

export const linkChat = internalMutation({
  args: { code: v.string(), chatId: v.string(), username: v.optional(v.string()) },
  handler: async (ctx, { code, chatId, username }) => {
    const entry = await ctx.db
      .query("telegramLinkCodes")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!entry) return "invalid" as const;
    await ctx.db.delete(entry._id);
    if (entry.expiresAt < Date.now()) return "expired" as const;

    // Un chat = un compte, un compte = un chat.
    for (const index of ["by_user", "by_chat"] as const) {
      const existing =
        index === "by_user"
          ? await ctx.db.query("telegramLinks").withIndex("by_user", (q) => q.eq("userId", entry.userId)).collect()
          : await ctx.db.query("telegramLinks").withIndex("by_chat", (q) => q.eq("chatId", chatId)).collect();
      for (const e of existing) await ctx.db.delete(e._id);
    }
    await ctx.db.insert("telegramLinks", { userId: entry.userId, chatId, username });
    return "linked" as const;
  },
});

export const userForChat = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .unique();
    return link?.userId ?? null;
  },
});

/**
 * À lancer une fois après avoir défini TELEGRAM_BOT_TOKEN et TELEGRAM_WEBHOOK_SECRET :
 *   npx convex run telegram:setup
 */
export const setup = internalAction({
  args: {},
  handler: async () => {
    const site = process.env.CONVEX_SITE_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new ConvexError("Définissez d'abord TELEGRAM_WEBHOOK_SECRET");
    const webhook = await tg("setWebhook", {
      url: `${site}/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    await tg("setMyCommands", {
      commands: [
        { command: "aujourdhui", description: "Mes tâches du jour" },
        { command: "aide", description: "Comment ajouter une tâche" },
      ],
      language_code: "fr",
    });
    await tg("setMyCommands", {
      commands: [
        { command: "aujourdhui", description: "Mes tâches du jour" },
        { command: "aide", description: "Comment ajouter une tâche" },
      ],
    });
    const me = await tg("getMe", {});
    return { webhookSet: webhook === true, bot: me?.username, url: `${site}/telegram/webhook` };
  },
});
