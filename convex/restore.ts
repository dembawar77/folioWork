import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { vPriority, vRecurrence, vRequest, vWaitingFor } from "./schema";
import { requireUser } from "./users";
import { getPrefs } from "./preferences";
import { MAX_NOTE, MAX_TITLE, MAX_WORKSTREAM, nameKey, scheduleFollowUp, syncReminder } from "./tasks";
import { nextOccurrence } from "./lib/time";

/**
 * Restauration d'une sauvegarde (.json) : ajoute ce qui manque, ne supprime ni ne modifie rien.
 * Une tâche est « déjà là » si elle existe encore sous son identifiant d'origine,
 * ou si elle a déjà été restaurée (marquée `r-<id d'origine>`) : restaurer deux fois ne crée pas de doublon.
 */

const ID_RE = /^[a-z0-9]{10,60}$/;
const restoreKey = (originalId: string) => `r-${originalId}`;

async function alreadyThere(ctx: QueryCtx, userId: Id<"users">, originalId: string): Promise<boolean> {
  const id = ctx.db.normalizeId("tasks", originalId);
  if (id) {
    const t = await ctx.db.get(id);
    if (t && t.userId === userId) return true;
  }
  const restored = await ctx.db
    .query("tasks")
    .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", restoreKey(originalId)))
    .first();
  return !!restored;
}

/** Ce qui manque dans le compte, avant de confirmer. */
export const preview = query({
  args: { taskIds: v.array(v.string()), contactNames: v.array(v.string()) },
  handler: async (ctx, { taskIds, contactNames }) => {
    const userId = await requireUser(ctx);
    if (taskIds.length > 500 || contactNames.length > 500) throw new ConvexError("Trop d'éléments à la fois");
    const missingTasks: string[] = [];
    for (const id of taskIds) if (ID_RE.test(id) && !(await alreadyThere(ctx, userId, id))) missingTasks.push(id);
    const missingContacts: string[] = [];
    for (const name of contactNames) {
      const key = nameKey(name);
      if (!key) continue;
      const c = await ctx.db
        .query("contacts")
        .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("nameKey", key))
        .first();
      if (!c) missingContacts.push(name);
    }
    return { missingTasks, missingContacts };
  },
});

const vImportTask = v.object({
  id: v.string(),
  title: v.string(),
  completed: v.boolean(),
  completedAt: v.optional(v.number()),
  priority: vPriority,
  workstream: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  remindAt: v.optional(v.number()),
  recurrence: v.optional(vRecurrence),
  note: v.optional(v.string()),
  noteText: v.optional(v.string()),
  checklistTotal: v.optional(v.number()),
  checklistDone: v.optional(v.number()),
  waitingFor: v.optional(vWaitingFor),
  request: v.optional(vRequest),
});

export const importTasks = mutation({
  args: { tasks: v.array(vImportTask) },
  handler: async (ctx, { tasks }) => {
    const userId = await requireUser(ctx);
    if (tasks.length > 25) throw new ConvexError("Trop de tâches à la fois");
    const prefs = await getPrefs(ctx, userId);
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    for (const t of tasks) {
      const title = t.title.trim().slice(0, MAX_TITLE);
      if (!ID_RE.test(t.id) || !title || (await alreadyThere(ctx, userId, t.id))) {
        skipped++;
        continue;
      }
      const note = t.note && t.note.length <= MAX_NOTE ? t.note : undefined;
      const id = await ctx.db.insert("tasks", {
        userId,
        title,
        completed: t.completed,
        completedAt: t.completed ? (t.completedAt ?? now) : undefined,
        priority: t.priority,
        workstream: t.workstream?.trim().slice(0, MAX_WORKSTREAM) || undefined,
        dueAt: t.dueAt,
        remindAt: t.remindAt,
        recurrence: t.recurrence,
        note,
        noteText: note ? t.noteText?.slice(0, 20_000) : undefined,
        checklistTotal: note ? t.checklistTotal : undefined,
        checklistDone: note ? t.checklistDone : undefined,
        waitingFor: t.waitingFor ? { ...t.waitingFor, name: t.waitingFor.name.slice(0, 60), lastNotifiedAt: undefined } : undefined,
        request: t.request ? { ...t.request, seen: true } : undefined,
        clientId: restoreKey(t.id),
        updatedAt: now,
      });
      // Rappels et relances à venir : reprogrammés. Les relances déjà dues partent demain 9h, pas toutes d'un coup maintenant.
      await syncReminder(ctx, id);
      if (!t.completed && t.waitingFor) {
        const next = t.waitingFor.nextFollowUpAt > now ? t.waitingFor.nextFollowUpAt : nextOccurrence("09:00", prefs.timezone, now + 3_600_000);
        await scheduleFollowUp(ctx, id, next);
      }
      added++;
    }
    return { added, skipped };
  },
});

export const importContacts = mutation({
  args: { contacts: v.array(v.object({ name: v.string(), phone: v.optional(v.string()) })) },
  handler: async (ctx, { contacts }) => {
    const userId = await requireUser(ctx);
    if (contacts.length > 500) throw new ConvexError("Trop de contacts à la fois");
    let added = 0;
    for (const c of contacts) {
      const name = c.name.trim().slice(0, 60);
      const key = nameKey(name);
      if (!key) continue;
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("nameKey", key))
        .first();
      if (existing) continue;
      const phone = c.phone && /^\d{6,15}$/.test(c.phone) ? c.phone : undefined;
      await ctx.db.insert("contacts", { userId, name, nameKey: key, phone });
      added++;
    }
    return { added };
  },
});

