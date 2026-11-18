import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { vPriority } from "./schema";
import { requireUser } from "./users";
import { getPrefs } from "./preferences";
import { parseQuickTask } from "./lib/parse";
import { localDayBounds } from "./lib/time";

const MAX_TITLE = 300;
const MAX_NOTE = 100_000;
const MAX_WORKSTREAM = 40;

function cleanTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new ConvexError("Le titre est vide");
  if (t.length > MAX_TITLE) throw new ConvexError(`Titre trop long (${MAX_TITLE} caractères max)`);
  return t;
}

function cleanWorkstream(ws: string | undefined | null): string | undefined {
  const t = ws?.trim();
  if (!t) return undefined;
  return t.slice(0, MAX_WORKSTREAM);
}

async function ownTask(ctx: MutationCtx, userId: Id<"users">, id: Id<"tasks">): Promise<Doc<"tasks">> {
  const task = await ctx.db.get(id);
  if (!task || task.userId !== userId) throw new ConvexError("Tâche introuvable");
  return task;
}

async function cancelJob(ctx: MutationCtx, jobId: Id<"_scheduled_functions"> | undefined) {
  if (!jobId) return;
  const job = await ctx.db.system.get(jobId);
  if (job && job.state.kind === "pending") await ctx.scheduler.cancel(jobId);
}

/**
 * Annule l'éventuel rappel programmé puis en programme un nouveau à l'heure exacte
 * si la tâche est ouverte et que l'heure du rappel n'est pas dépassée.
 */
export async function syncReminder(ctx: MutationCtx, taskId: Id<"tasks">) {
  const task = await ctx.db.get(taskId);
  if (!task) return;
  await cancelJob(ctx, task.reminderJobId);
  const now = Date.now();
  let reminderJobId: Id<"_scheduled_functions"> | undefined;
  if (!task.completed && task.remindAt !== undefined && task.remindAt > now - 60_000) {
    reminderJobId = await ctx.scheduler.runAt(Math.max(task.remindAt, now), internal.notify.fireReminder, { taskId });
  }
  await ctx.db.patch(taskId, { reminderJobId, reminderSentAt: undefined });
}

async function insertTask(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: { title: string; priority: Doc<"tasks">["priority"]; workstream?: string; dueAt?: number; remindAt?: number | null },
) {
  let remindAt = input.remindAt ?? undefined;
  if (input.remindAt === undefined && input.dueAt !== undefined) {
    const prefs = await getPrefs(ctx, userId);
    remindAt = input.dueAt - prefs.defaultReminderOffsetMinutes * 60_000;
  }
  const id = await ctx.db.insert("tasks", {
    userId,
    title: cleanTitle(input.title),
    completed: false,
    priority: input.priority,
    workstream: cleanWorkstream(input.workstream),
    dueAt: input.dueAt,
    remindAt,
    updatedAt: Date.now(),
  });
  await syncReminder(ctx, id);
  return id;
}

// ─── Lecture ────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed", (q) => q.eq("userId", userId).eq("completed", false))
      .collect();
    const done = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed", (q) => q.eq("userId", userId).eq("completed", true))
      .order("desc")
      .take(300);
    return [...open, ...done].map(({ reminderJobId: _j, actionToken: _t, ...rest }) => rest);
  },
});

// ─── Écriture (application) ────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    priority: v.optional(vPriority),
    workstream: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    /** undefined : délai par défaut ; null : pas de rappel. */
    remindAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return insertTask(ctx, userId, { ...args, priority: args.priority ?? "normal" });
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    priority: v.optional(vPriority),
    workstream: v.optional(v.union(v.string(), v.null())),
    dueAt: v.optional(v.union(v.number(), v.null())),
    remindAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUser(ctx);
    await ownTask(ctx, userId, id);
    const patch: Partial<Doc<"tasks">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = cleanTitle(args.title);
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.workstream !== undefined) patch.workstream = cleanWorkstream(args.workstream);
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt ?? undefined;
    if (args.remindAt !== undefined) patch.remindAt = args.remindAt ?? undefined;
    await ctx.db.patch(id, patch);
    if (args.remindAt !== undefined) await syncReminder(ctx, id);
  },
});

export const saveNote = mutation({
  args: {
    id: v.id("tasks"),
    note: v.string(),
    noteText: v.string(),
    checklistTotal: v.number(),
    checklistDone: v.number(),
  },
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUser(ctx);
    await ownTask(ctx, userId, id);
    if (args.note.length > MAX_NOTE) throw new ConvexError("Note trop longue");
    await ctx.db.patch(id, { ...args, noteText: args.noteText.slice(0, 20_000), updatedAt: Date.now() });
  },
});

async function setCompleted(ctx: MutationCtx, task: Doc<"tasks">, completed: boolean) {
  await ctx.db.patch(task._id, {
    completed,
    completedAt: completed ? Date.now() : undefined,
    updatedAt: Date.now(),
  });
  await syncReminder(ctx, task._id);
}

export const toggle = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    await setCompleted(ctx, task, !task.completed);
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    await cancelJob(ctx, task.reminderJobId);
    await ctx.db.delete(id);
  },
});

async function snoozeTask(ctx: MutationCtx, task: Doc<"tasks">, minutes: number) {
  await ctx.db.patch(task._id, { remindAt: Date.now() + minutes * 60_000, updatedAt: Date.now() });
  await syncReminder(ctx, task._id);
}

export const snooze = mutation({
  args: { id: v.id("tasks"), minutes: v.number() },
  handler: async (ctx, { id, minutes }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    await snoozeTask(ctx, task, Math.min(Math.max(minutes, 1), 7 * 24 * 60));
  },
});

// ─── Interne : notifications et Telegram ────────────────────────────────────

export const getInternal = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => ctx.db.get(taskId),
});

export const markReminderSent = internalMutation({
  args: { taskId: v.id("tasks"), actionToken: v.string() },
  handler: async (ctx, { taskId, actionToken }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    await ctx.db.patch(taskId, { reminderSentAt: Date.now(), reminderJobId: undefined, actionToken });
  },
});

/** Action depuis un bouton de notification (« Terminé », « +15 min »), autorisée par jeton. */
export const actByToken = internalMutation({
  args: { taskId: v.string(), token: v.string(), action: v.union(v.literal("done"), v.literal("snooze")) },
  handler: async (ctx, { taskId, token, action }) => {
    const id = ctx.db.normalizeId("tasks", taskId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || !task.actionToken || task.actionToken !== token) return false;
    if (action === "done") await setCompleted(ctx, task, true);
    else await snoozeTask(ctx, task, 15);
    return true;
  },
});

/** Action depuis Telegram : la tâche doit appartenir à l'utilisateur lié à ce chat. */
export const actForUser = internalMutation({
  args: { userId: v.id("users"), taskId: v.string(), action: v.union(v.literal("done"), v.literal("snooze")) },
  handler: async (ctx, { userId, taskId, action }) => {
    const id = ctx.db.normalizeId("tasks", taskId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || task.userId !== userId) return null;
    if (action === "done") await setCompleted(ctx, task, true);
    else await snoozeTask(ctx, task, 15);
    return task.title;
  },
});

export const createFromText = internalMutation({
  args: { userId: v.id("users"), text: v.string() },
  handler: async (ctx, { userId, text }) => {
    const prefs = await getPrefs(ctx, userId);
    const parsed = parseQuickTask(text.slice(0, MAX_TITLE + 100), { now: Date.now(), timeZone: prefs.timezone });
    const id = await insertTask(ctx, userId, {
      title: parsed.title.slice(0, MAX_TITLE),
      priority: parsed.priority,
      workstream: parsed.workstream,
      dueAt: parsed.dueAt,
    });
    return { id, ...parsed, timezone: prefs.timezone };
  },
});

/** Tâches ouvertes du jour (en retard incluses) pour le résumé et /aujourdhui. */
export const todayDigest = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const prefs = await getPrefs(ctx, userId);
    const { end } = localDayBounds(prefs.timezone, Date.now());
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed", (q) => q.eq("userId", userId).eq("completed", false))
      .collect();
    const now = Date.now();
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
    const today = open
      .filter((t) => t.dueAt !== undefined && t.dueAt < end)
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.dueAt! - b.dueAt!);
    return {
      timezone: prefs.timezone,
      tasks: today.map((t) => ({
        id: t._id,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt!,
        overdue: t.dueAt! < now,
      })),
      openCount: open.length,
    };
  },
});
