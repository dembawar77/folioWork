import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./users";
import { getPrefs } from "./preferences";

/** Ce qu'une tâche exporte : son contenu, sans les rouages internes (programmations, jetons). */
function exportTask(t: Doc<"tasks">) {
  return {
    id: t._id,
    createdAt: t._creationTime,
    updatedAt: t.updatedAt,
    title: t.title,
    completed: t.completed,
    completedAt: t.completedAt,
    priority: t.priority,
    workstream: t.workstream,
    dueAt: t.dueAt,
    remindAt: t.remindAt,
    recurrence: t.recurrence,
    note: t.note,
    noteText: t.noteText,
    checklistTotal: t.checklistTotal,
    checklistDone: t.checklistDone,
    waitingFor: t.waitingFor,
    request: t.request,
  };
}

/** Toutes les tâches (ouvertes et terminées), par pages : l'export n'a pas de limite de taille. */
export const tasksPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await requireUser(ctx);
    const page = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 200) });
    return { ...page, page: page.page.map(exportTask) };
  },
});

/** Compte, préférences, contacts et boîte de dépôt. */
export const meta = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
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
  },
});
