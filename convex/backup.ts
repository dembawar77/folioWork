import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./users";
import { DEFAULT_PREFS, getPrefs } from "./preferences";
import { backupJson, exportTask, sortExport, type ExportedTask } from "./lib/backupFormat";
import { localDateKey, nextBackupAt } from "./lib/time";
import { sendDocument } from "./lib/telegram";

// ─── Export depuis l'app ────────────────────────────────────────────────────

async function tasksPageFor(ctx: QueryCtx, userId: Id<"users">, paginationOpts: { numItems: number; cursor: string | null }) {
  const page = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 200) });
  return { ...page, page: page.page.map(exportTask) };
}

async function metaFor(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_user_name", (q) => q.eq("userId", userId))
    .collect();
  const intake = await ctx.db
    .query("intakes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    account: { name: user?.name, email: user?.email },
    preferences: await getPrefs(ctx, userId),
    contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })),
    intake: intake ? { slug: intake.slug, enabled: intake.enabled, intro: intake.intro } : null,
  };
}

/** Toutes les tâches (ouvertes et terminées), par pages : l'export n'a pas de limite de taille. */
export const tasksPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => tasksPageFor(ctx, await requireUser(ctx), paginationOpts),
});

/** Compte, préférences, contacts et boîte de dépôt. */
export const meta = query({
  args: {},
  handler: async (ctx) => metaFor(ctx, await requireUser(ctx)),
});

// ─── Sauvegarde automatique sur Telegram ────────────────────────────────────

const RETRY_MINUTES = [30, 120];
/** Au-delà, un envoi « en cours » est considéré comme perdu. */
const PENDING_TTL = 10 * 60_000;

async function prefsDoc(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("preferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function linkedChat(ctx: QueryCtx, userId: Id<"users">) {
  const link = await ctx.db
    .query("telegramLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return link?.chatId ?? null;
}

/** État affiché dans Alertes → Mes données. */
export const autoStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const doc = await prefsDoc(ctx, userId);
    const pending = !!doc?.backupPendingSince && doc.backupPendingSince > Date.now() - PENDING_TTL;
    return {
      enabled: doc?.weeklyBackup ?? false,
      telegramLinked: !!(await linkedChat(ctx, userId)),
      nextAt: doc?.weeklyBackup ? (doc.backupNextAt ?? null) : null,
      lastAt: doc?.lastBackupAt ?? null,
      lastError: doc?.lastBackupError ?? null,
      pending,
    };
  },
});

export const setWeekly = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await requireUser(ctx);
    const doc = await prefsDoc(ctx, userId);
    const timezone = doc?.timezone ?? DEFAULT_PREFS.timezone;
    const patch = { weeklyBackup: enabled, backupNextAt: enabled ? nextBackupAt(timezone, Date.now()) : undefined };
    if (doc) await ctx.db.patch(doc._id, patch);
    else await ctx.db.insert("preferences", { userId, ...DEFAULT_PREFS, ...patch });
  },
});

/** Programme un envoi immédiat ; refuse si un envoi est déjà en cours. */
async function requestSend(ctx: MutationCtx, userId: Id<"users">): Promise<"queued" | "busy" | "unlinked"> {
  if (!(await linkedChat(ctx, userId))) return "unlinked";
  const now = Date.now();
  let doc = await prefsDoc(ctx, userId);
  // Envoi en cours, ou envoyé il y a moins d'une minute (double appui, commande répétée).
  if (doc?.backupPendingSince && doc.backupPendingSince > now - PENDING_TTL) return "busy";
  if (doc?.lastBackupAt && doc.lastBackupAt > now - 60_000) return "busy";
  if (!doc) {
    const id = await ctx.db.insert("preferences", { userId, ...DEFAULT_PREFS });
    doc = (await ctx.db.get(id))!;
  }
  await ctx.db.patch(doc._id, { backupPendingSince: now });
  await ctx.scheduler.runAfter(0, internal.backup.sendToTelegram, { userId, attempt: 0 });
  return "queued";
}

export const sendNow = mutation({
  args: {},
  handler: async (ctx) => {
    const result = await requestSend(ctx, await requireUser(ctx));
    if (result === "unlinked") throw new ConvexError("Reliez d'abord Telegram (section Telegram ci-dessus)");
    if (result === "busy") throw new ConvexError("Sauvegarde déjà en route : regardez Telegram");
  },
});

/** Commande /sauvegarde du bot. */
export const requestFromBot = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => requestSend(ctx, userId),
});

/** Toutes les heures : lance les sauvegardes du dimanche soir arrivées à échéance. */
export const dispatchWeekly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("preferences")
      .withIndex("by_backup_next", (q) => q.gte("backupNextAt", 0).lte("backupNextAt", now))
      .take(100);
    for (const doc of due) {
      if (!doc.weeklyBackup) {
        await ctx.db.patch(doc._id, { backupNextAt: undefined });
        continue;
      }
      await ctx.db.patch(doc._id, { backupNextAt: nextBackupAt(doc.timezone, now), backupPendingSince: now });
      await ctx.scheduler.runAfter(0, internal.backup.sendToTelegram, { userId: doc.userId, attempt: 0 });
    }
  },
});

export const internalTasksPage = internalQuery({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { userId, paginationOpts }) => tasksPageFor(ctx, userId, paginationOpts),
});

export const internalMeta = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ({ ...(await metaFor(ctx, userId)), chatId: await linkedChat(ctx, userId) }),
});

export const recordResult = internalMutation({
  args: { userId: v.id("users"), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, { userId, ok, error }) => {
    const doc = await prefsDoc(ctx, userId);
    if (!doc) return;
    await ctx.db.patch(doc._id, {
      backupPendingSince: undefined,
      ...(ok ? { lastBackupAt: Date.now(), lastBackupError: undefined } : { lastBackupError: error }),
    });
  },
});

export const sendToTelegram = internalAction({
  args: { userId: v.id("users"), attempt: v.number() },
  handler: async (ctx, { userId, attempt }) => {
    const { chatId, ...meta } = await ctx.runQuery(internal.backup.internalMeta, { userId });
    if (!chatId) {
      await ctx.runMutation(internal.backup.recordResult, { userId, ok: false, error: "Telegram n'est pas relié" });
      return;
    }
    const tasks: ExportedTask[] = [];
    let cursor: string | null = null;
    for (;;) {
      const res: { page: ExportedTask[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.backup.internalTasksPage, {
        userId,
        paginationOpts: { numItems: 200, cursor },
      });
      tasks.push(...res.page);
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    const tz = meta.preferences.timezone;
    const now = Date.now();
    const json = backupJson({
      format: "foliowork-export" as const,
      version: 1 as const,
      exportedAt: new Date(now).toISOString(),
      timeZone: tz,
      ...meta,
      tasks: sortExport(tasks),
    });
    const open = tasks.filter((t) => !t.completed).length;
    const day = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(now));
    const caption = [
      `<b>Sauvegarde FolioWork</b> · ${day}`,
      `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} dont ${open} ouverte${open > 1 ? "s" : ""} · ${meta.contacts.length} contact${meta.contacts.length > 1 ? "s" : ""}`,
      "",
      "Copie complète de votre compte : tâches, notes, contacts, réglages. Gardez ce fichier.",
    ].join("\n");
    const filename = `foliowork-${localDateKey(tz, new Date(now))}.json`;
    const sent = await sendDocument(chatId, new Blob([json], { type: "application/json" }), filename, caption);
    if (sent.ok) {
      await ctx.runMutation(internal.backup.recordResult, { userId, ok: true });
      return;
    }
    const retryIn = sent.retry ? RETRY_MINUTES[attempt] : undefined;
    await ctx.runMutation(internal.backup.recordResult, {
      userId,
      ok: false,
      error: retryIn ? `${sent.error} · nouvel essai dans ${retryIn < 60 ? `${retryIn} min` : `${retryIn / 60} h`}` : sent.error,
    });
    if (retryIn) await ctx.scheduler.runAfter(retryIn * 60_000, internal.backup.sendToTelegram, { userId, attempt: attempt + 1 });
  },
});
