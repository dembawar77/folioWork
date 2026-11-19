import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./users";
import { nextBackupAt, nextOccurrence } from "./lib/time";

export const DEFAULT_PREFS = {
  timezone: "Africa/Dakar",
  dailySummaryEnabled: false,
  dailySummaryTime: "08:30",
  defaultReminderOffsetMinutes: 0,
  discreetNotifications: false,
};

export type Prefs = typeof DEFAULT_PREFS;

export async function getPrefs(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Prefs> {
  const doc = await ctx.db
    .query("preferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!doc) return DEFAULT_PREFS;
  const { timezone, dailySummaryEnabled, dailySummaryTime, defaultReminderOffsetMinutes } = doc;
  return { timezone, dailySummaryEnabled, dailySummaryTime, defaultReminderOffsetMinutes, discreetNotifications: doc.discreetNotifications ?? false };
}

export const get = query({
  args: {},
  handler: async (ctx) => getPrefs(ctx, await requireUser(ctx)),
});

export const internalGet = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => getPrefs(ctx, userId),
});

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const save = mutation({
  args: {
    timezone: v.optional(v.string()),
    dailySummaryEnabled: v.optional(v.boolean()),
    dailySummaryTime: v.optional(v.string()),
    defaultReminderOffsetMinutes: v.optional(v.number()),
    discreetNotifications: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.timezone !== undefined && !isValidTimeZone(args.timezone)) throw new ConvexError("Fuseau horaire invalide");
    if (args.dailySummaryTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.dailySummaryTime))
      throw new ConvexError("Heure invalide (format HH:mm)");
    if (args.defaultReminderOffsetMinutes !== undefined && ![0, 15, 30, 60, 1440].includes(args.defaultReminderOffsetMinutes))
      throw new ConvexError("Délai de rappel invalide");

    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(args).filter(([, val]) => val !== undefined));
    // Changement de fuseau : la sauvegarde du dimanche suit la nouvelle heure locale.
    if (existing?.weeklyBackup && args.timezone && args.timezone !== existing.timezone) patch.backupNextAt = nextBackupAt(args.timezone, Date.now());
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("preferences", { userId, ...DEFAULT_PREFS, ...patch });
    await rescheduleSummary(ctx, userId);
  },
});

/** (Re)programme le prochain résumé quotidien de l'utilisateur. */
export async function rescheduleSummary(ctx: MutationCtx, userId: Id<"users">) {
  const doc = await ctx.db
    .query("preferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!doc) return;
  if (doc.summaryJobId) {
    const job = await ctx.db.system.get(doc.summaryJobId);
    if (job && job.state.kind === "pending") await ctx.scheduler.cancel(doc.summaryJobId);
  }
  let summaryJobId: Id<"_scheduled_functions"> | undefined;
  if (doc.dailySummaryEnabled) {
    const at = nextOccurrence(doc.dailySummaryTime, doc.timezone, Date.now());
    summaryJobId = await ctx.scheduler.runAt(at, internal.notify.fireDailySummary, { userId });
  }
  await ctx.db.patch(doc._id, { summaryJobId });
}

export const scheduleNextSummary = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => rescheduleSummary(ctx, userId),
});
