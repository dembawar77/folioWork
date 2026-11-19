import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { vPriority, vRecurrence } from "./schema";
import { requireUser } from "./users";
import { getPrefs } from "./preferences";
import { parseQuickTask } from "./lib/parse";
import { localDayBounds } from "./lib/time";
import { dayAt, firstDue, localTime, nextDue, withAnchor, type Recurrence } from "./lib/recurrence";
import { normalizePhone } from "./lib/whatsapp";

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
  await ctx.db.patch(taskId, { reminderJobId, reminderSentAt: undefined, reminderError: undefined });
}

export async function insertTask(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: {
    title: string;
    priority: Doc<"tasks">["priority"];
    workstream?: string;
    dueAt?: number;
    remindAt?: number | null;
    recurrence?: Recurrence;
    waitingFor?: string;
  },
) {
  const prefs = await getPrefs(ctx, userId);
  let dueAt = input.dueAt;
  let recurrence: Recurrence | undefined;
  if (input.recurrence) {
    checkRecurrence(input.recurrence);
    dueAt ??= firstDue(input.recurrence, prefs.timezone, Date.now());
    recurrence = withAnchor(input.recurrence, dueAt, prefs.timezone);
  }
  let remindAt = input.remindAt ?? undefined;
  if (input.remindAt === undefined && dueAt !== undefined) {
    remindAt = dueAt - prefs.defaultReminderOffsetMinutes * 60_000;
  }
  const id = await ctx.db.insert("tasks", {
    userId,
    title: cleanTitle(input.title),
    completed: false,
    priority: input.priority,
    workstream: cleanWorkstream(input.workstream),
    dueAt,
    remindAt,
    recurrence,
    updatedAt: Date.now(),
  });
  await syncReminder(ctx, id);
  if (input.waitingFor) await startWaiting(ctx, userId, id, { name: input.waitingFor, everyDays: DEFAULT_FOLLOW_UP_DAYS });
  return id;
}

// ─── En attente de… / relances ──────────────────────────────────────────────

const DEFAULT_FOLLOW_UP_DAYS = 2;
const FOLLOW_UP_TIME = "09:00";
const nameKey = (name: string) => name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function upsertContact(ctx: MutationCtx, userId: Id<"users">, name: string, phone: string | undefined) {
  const existing = await ctx.db
    .query("contacts")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("nameKey", nameKey(name)))
    .unique();
  if (existing) {
    if (phone && phone !== existing.phone) await ctx.db.patch(existing._id, { phone });
    // Le nom déjà connu fait foi (« moussa » → « Moussa »).
    return { name: existing.name, phone: phone ?? existing.phone };
  }
  await ctx.db.insert("contacts", { userId, name, nameKey: nameKey(name), phone });
  return { name, phone };
}

/**
 * Programme la prochaine notification de relance (annule la précédente).
 * `keepDue` : simple rappel d'une relance déjà due, sans changer sa date d'échéance.
 */
export async function scheduleFollowUp(ctx: MutationCtx, taskId: Id<"tasks">, at: number | null, opts: { keepDue?: boolean } = {}) {
  const task = await ctx.db.get(taskId);
  if (!task) return;
  await cancelJob(ctx, task.followUpJobId);
  let followUpJobId: Id<"_scheduled_functions"> | undefined;
  if (at !== null && task.waitingFor && !task.completed) {
    followUpJobId = await ctx.scheduler.runAt(Math.max(at, Date.now()), internal.notify.fireFollowUp, { taskId });
    if (!opts.keepDue) await ctx.db.patch(taskId, { waitingFor: { ...task.waitingFor, nextFollowUpAt: at } });
  }
  await ctx.db.patch(taskId, { followUpJobId });
}

async function startWaiting(
  ctx: MutationCtx,
  userId: Id<"users">,
  taskId: Id<"tasks">,
  input: { name: string; phone?: string; everyDays: number },
) {
  const typedName = input.name.trim().slice(0, 60);
  if (!typedName) throw new ConvexError("Indiquez le nom de la personne");
  if (![1, 2, 3, 5, 7].includes(input.everyDays)) throw new ConvexError("Délai de relance invalide");
  const typed = input.phone?.trim() ? normalizePhone(input.phone) : undefined;
  if (input.phone?.trim() && !typed) throw new ConvexError("Numéro WhatsApp invalide");
  const { name, phone } = await upsertContact(ctx, userId, typedName, typed);
  const task = await ctx.db.get(taskId);
  if (!task) return;
  const prefs = await getPrefs(ctx, userId);
  const now = Date.now();
  const at = dayAt(now, input.everyDays, FOLLOW_UP_TIME, prefs.timezone);
  await ctx.db.patch(taskId, {
    waitingFor: {
      name,
      phone,
      since: task.waitingFor?.since ?? now,
      everyDays: input.everyDays,
      nextFollowUpAt: at,
      nudges: task.waitingFor?.nudges ?? 0,
      lastNudgeAt: task.waitingFor?.lastNudgeAt,
    },
    updatedAt: now,
  });
  await scheduleFollowUp(ctx, taskId, at);
}

/** « J'ai relancé » : on compte la relance et on programme la suivante. */
async function recordNudge(ctx: MutationCtx, task: Doc<"tasks">) {
  if (!task.waitingFor) return;
  const prefs = await getPrefs(ctx, task.userId);
  const now = Date.now();
  await ctx.db.patch(task._id, {
    waitingFor: { ...task.waitingFor, nudges: task.waitingFor.nudges + 1, lastNudgeAt: now },
    updatedAt: now,
  });
  await scheduleFollowUp(ctx, task._id, dayAt(now, task.waitingFor.everyDays, FOLLOW_UP_TIME, prefs.timezone));
}

/** Retour reçu : la tâche n'attend plus personne. */
async function stopWaiting(ctx: MutationCtx, task: Doc<"tasks">) {
  await cancelJob(ctx, task.followUpJobId);
  await ctx.db.patch(task._id, { waitingFor: undefined, followUpJobId: undefined, updatedAt: Date.now() });
}

async function postponeFollowUp(ctx: MutationCtx, task: Doc<"tasks">, days: number) {
  if (!task.waitingFor) return;
  const prefs = await getPrefs(ctx, task.userId);
  await scheduleFollowUp(ctx, task._id, dayAt(Date.now(), days, FOLLOW_UP_TIME, prefs.timezone));
}

export const setWaiting = mutation({
  args: { id: v.id("tasks"), name: v.string(), phone: v.optional(v.string()), everyDays: v.number() },
  handler: async (ctx, { id, ...input }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    if (task.completed) throw new ConvexError("La tâche est terminée");
    await startWaiting(ctx, userId, id, input);
  },
});

export const received = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    await stopWaiting(ctx, await ownTask(ctx, userId, id));
  },
});

export const markSeen = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    if (task.request && !task.request.seen) await ctx.db.patch(id, { request: { ...task.request, seen: true } });
  },
});

export const delayFollowUp = mutation({
  args: { id: v.id("tasks"), days: v.number() },
  handler: async (ctx, { id, days }) => {
    const userId = await requireUser(ctx);
    if (![1, 2, 7].includes(days)) throw new ConvexError("Délai invalide");
    await postponeFollowUp(ctx, await ownTask(ctx, userId, id), days);
  },
});

export const nudged = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    await recordNudge(ctx, await ownTask(ctx, userId, id));
  },
});

export const contacts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db
      .query("contacts")
      .withIndex("by_user_name", (q) => q.eq("userId", userId))
      .collect();
    return list.map((c) => ({ name: c.name, phone: c.phone }));
  },
});

export const prepareFollowUp = internalMutation({
  args: { taskId: v.id("tasks"), actionToken: v.string() },
  handler: async (ctx, { taskId, actionToken }) => {
    const task = await ctx.db.get(taskId);
    if (task?.waitingFor && !task.completed) await ctx.db.patch(taskId, issueToken(actionToken, "followup"));
  },
});

/**
 * Notification « à relancer » partie (ou non). La relance reste due — la personne reste dans
 * la liste « à relancer » — jusqu'à « J'ai relancé », « Reçu » ou « Reporter ». Sans action,
 * on le rappelle le lendemain à 9h ; un échec d'envoi temporaire est réessayé dans 10 min.
 */
export const followUpNotified = internalMutation({
  args: { taskId: v.id("tasks"), delivered: v.boolean(), retry: v.boolean() },
  handler: async (ctx, { taskId, delivered, retry }) => {
    const task = await ctx.db.get(taskId);
    if (!task?.waitingFor || task.completed) return;
    const prefs = await getPrefs(ctx, task.userId);
    const now = Date.now();
    if (delivered) await ctx.db.patch(taskId, { waitingFor: { ...task.waitingFor, lastNotifiedAt: now } });
    const at = !delivered && retry ? now + 10 * 60_000 : dayAt(now, 1, FOLLOW_UP_TIME, prefs.timezone);
    await scheduleFollowUp(ctx, taskId, at, { keepDue: true });
  },
});

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
      .withIndex("by_user_completed_at", (q) => q.eq("userId", userId).eq("completed", true))
      .order("desc")
      .take(300);
    return [...open, ...done].map(strip);
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
    recurrence: v.optional(vRecurrence),
    waitingFor: v.optional(v.string()),
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
    /** null : ne plus répéter. */
    recurrence: v.optional(v.union(vRecurrence, v.null())),
  },
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    const patch: Partial<Doc<"tasks">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = cleanTitle(args.title);
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.workstream !== undefined) patch.workstream = cleanWorkstream(args.workstream);
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt ?? undefined;
    if (args.remindAt !== undefined) patch.remindAt = args.remindAt ?? undefined;
    const dueAt = args.dueAt !== undefined ? (args.dueAt ?? undefined) : task.dueAt;
    if (args.recurrence !== undefined) {
      if (args.recurrence === null) patch.recurrence = undefined;
      else {
        checkRecurrence(args.recurrence);
        if (dueAt === undefined) throw new ConvexError("Ajoutez d'abord une échéance pour répéter la tâche");
        const prefs = await getPrefs(ctx, userId);
        patch.recurrence = withAnchor(args.recurrence, dueAt, prefs.timezone);
      }
    } else if (args.dueAt === null && task.recurrence) {
      patch.recurrence = undefined; // plus d'échéance : plus de répétition
    } else if (args.dueAt != null && task.recurrence?.freq === "monthly") {
      const prefs = await getPrefs(ctx, userId);
      patch.recurrence = withAnchor(task.recurrence, args.dueAt, prefs.timezone);
    }
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

function checkRecurrence(r: Recurrence) {
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 52) throw new ConvexError("Intervalle de répétition invalide");
}

/** Copie la note en décochant ses cases : chaque occurrence repart d'une liste vierge. */
function resetChecklist(note: string | undefined): string | undefined {
  if (!note) return note;
  try {
    const doc = JSON.parse(note);
    const walk = (n: any) => {
      if (n?.type === "taskItem" && n.attrs) n.attrs.checked = false;
      n?.content?.forEach(walk);
    };
    walk(doc);
    return JSON.stringify(doc);
  } catch {
    return note;
  }
}

async function setCompleted(ctx: MutationCtx, task: Doc<"tasks">, completed: boolean) {
  const now = Date.now();
  const patch: Partial<Doc<"tasks">> = { completed, completedAt: completed ? now : undefined, updatedAt: now };

  const existingNext = task.nextTaskId ? await ctx.db.get(task.nextTaskId) : null;
  if (completed && task.recurrence && task.dueAt !== undefined && !existingNext) {
    // Occurrence suivante, avec le même délai de rappel et une note aux cases décochées.
    const prefs = await getPrefs(ctx, task.userId);
    const dueAt = nextDue(task.dueAt, task.recurrence, prefs.timezone, now);
    const nextId = await ctx.db.insert("tasks", {
      userId: task.userId,
      title: task.title,
      completed: false,
      priority: task.priority,
      workstream: task.workstream,
      dueAt,
      remindAt: task.remindAt !== undefined ? dueAt - (task.dueAt - task.remindAt) : undefined,
      recurrence: task.recurrence,
      note: resetChecklist(task.note),
      noteText: task.noteText,
      checklistTotal: task.checklistTotal,
      checklistDone: task.checklistTotal ? 0 : undefined,
      spawnedAt: now,
      updatedAt: now,
    });
    await syncReminder(ctx, nextId);
    patch.nextTaskId = nextId;
  }

  if (!completed && task.nextTaskId) {
    // Tâche rouverte par erreur : on retire l'occurrence suivante si elle n'a pas été touchée.
    // Si elle a été modifiée, on la garde ET on garde le lien : la terminer à nouveau
    // ne créera pas de doublon.
    const next = existingNext;
    if (!next) patch.nextTaskId = undefined;
    else if (!next.completed && next.spawnedAt !== undefined && next.updatedAt === next.spawnedAt) {
      await cancelJob(ctx, next.reminderJobId);
      await cancelJob(ctx, next.followUpJobId);
      await ctx.db.delete(next._id);
      patch.nextTaskId = undefined;
    }
  }

  if (completed) await cancelJob(ctx, task.followUpJobId);

  await ctx.db.patch(task._id, completed ? { ...patch, followUpJobId: undefined } : patch);
  await syncReminder(ctx, task._id);
  // Rouverte alors qu'elle attendait quelqu'un : la relance reprend.
  if (!completed && task.waitingFor) {
    const prefs = await getPrefs(ctx, task.userId);
    await scheduleFollowUp(ctx, task._id, dayAt(now, task.waitingFor.everyDays, FOLLOW_UP_TIME, prefs.timezone));
  }
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
    await cancelJob(ctx, task.followUpJobId);
    await ctx.db.delete(id);
  },
});

async function snoozeTask(ctx: MutationCtx, task: Doc<"tasks">, minutes: number) {
  await ctx.db.patch(task._id, { remindAt: Date.now() + minutes * 60_000, updatedAt: Date.now() });
  await syncReminder(ctx, task._id);
}

/**
 * Reporter : la tâche passe au jour J+n (à partir d'aujourd'hui), à la même heure ;
 * le rappel garde le même écart. Renvoie l'état précédent pour pouvoir annuler.
 */
export const postpone = mutation({
  args: { id: v.id("tasks"), days: v.number() },
  handler: async (ctx, { id, days }) => {
    const userId = await requireUser(ctx);
    const task = await ownTask(ctx, userId, id);
    const n = Math.min(Math.max(Math.round(days), 1), 30);
    const prefs = await getPrefs(ctx, userId);
    const time = task.dueAt !== undefined ? localTime(task.dueAt, prefs.timezone) : "09:00";
    const dueAt = dayAt(Date.now(), n, time, prefs.timezone);
    // Même écart de rappel ; « Pas de rappel » reste « Pas de rappel ».
    // Seule une tâche qui n'avait pas d'échéance reçoit le rappel par défaut.
    const remindAt =
      task.dueAt === undefined
        ? dueAt - prefs.defaultReminderOffsetMinutes * 60_000
        : task.remindAt !== undefined
          ? dueAt - (task.dueAt - task.remindAt)
          : undefined;
    await ctx.db.patch(id, { dueAt, remindAt, updatedAt: Date.now() });
    await syncReminder(ctx, id);
    return { dueAt: task.dueAt ?? null, remindAt: task.remindAt ?? null };
  },
});

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

/** Les boutons d'une notification restent utilisables 12 h (durée de vie de la notification push). */
const ACTION_TOKEN_TTL = 12 * 3_600_000;
const ACTIONS_BY_KIND = { reminder: ["done", "snooze"], followup: ["received", "postpone", "nudge"] } as const;

function issueToken(actionToken: string, actionKind: "reminder" | "followup") {
  return { actionToken, actionKind, actionTokenExpiresAt: Date.now() + ACTION_TOKEN_TTL };
}

/** Invalide les boutons de toutes les notifications déjà envoyées (appareil retiré, déconnexion). */
export async function revokeActionTokens(ctx: MutationCtx, userId: Id<"users">) {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const t of tasks) {
    if (t.actionToken) await ctx.db.patch(t._id, { actionToken: undefined, actionTokenExpiresAt: undefined, actionKind: undefined });
  }
}

export const prepareReminder = internalMutation({
  args: { taskId: v.id("tasks"), actionToken: v.string() },
  handler: async (ctx, { taskId, actionToken }) => {
    if (await ctx.db.get(taskId)) await ctx.db.patch(taskId, issueToken(actionToken, "reminder"));
  },
});

const RETRY_MINUTES = [2, 10, 30];

/**
 * Résultat d'un rappel, enregistré APRÈS la tentative d'envoi :
 * réussi si au moins un canal l'a accepté ; sinon nouvel essai (erreur temporaire) ou échec affiché.
 */
export const reminderResult = internalMutation({
  args: { taskId: v.id("tasks"), delivered: v.boolean(), hasChannel: v.boolean(), transient: v.boolean(), attempt: v.number() },
  handler: async (ctx, { taskId, delivered, hasChannel, transient, attempt }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.completed) return;
    if (delivered) {
      await ctx.db.patch(taskId, { reminderSentAt: Date.now(), reminderError: undefined, reminderJobId: undefined });
    } else if (hasChannel && transient && attempt < RETRY_MINUTES.length) {
      const reminderJobId = await ctx.scheduler.runAfter(RETRY_MINUTES[attempt] * 60_000, internal.notify.fireReminder, {
        taskId,
        attempt: attempt + 1,
      });
      await ctx.db.patch(taskId, { reminderJobId, reminderError: "Envoi en échec, nouvel essai en cours" });
    } else {
      await ctx.db.patch(taskId, {
        reminderJobId: undefined,
        reminderError: hasChannel ? "Rappel non délivré" : "Rappel non délivré : aucun appareil ni Telegram activé",
      });
    }
  },
});

// ─── Historique complet (au-delà des 300 dernières tâches terminées) ───────

const strip = <T extends Doc<"tasks">>({
  reminderJobId: _j,
  actionToken: _t,
  actionTokenExpiresAt: _e,
  actionKind: _k,
  nextTaskId: _n,
  spawnedAt: _s,
  followUpJobId: _f,
  ...rest
}: T) => rest;

export const listDone = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await requireUser(ctx);
    const page = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed_at", (q) => q.eq("userId", userId).eq("completed", true))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: page.page.map(strip) };
  },
});

export const searchDone = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const userId = await requireUser(ctx);
    const term = q.trim().slice(0, 100);
    if (term.length < 2) return [];
    const [byTitle, byNote] = await Promise.all(
      (["search_title", "search_note"] as const).map((index) =>
        ctx.db
          .query("tasks")
          .withSearchIndex(index, (s) =>
            (index === "search_title" ? s.search("title", term) : s.search("noteText", term)).eq("userId", userId).eq("completed", true),
          )
          .take(50),
      ),
    );
    const seen = new Set<string>();
    return [...byTitle, ...byNote]
      .filter((t) => (seen.has(t._id) ? false : (seen.add(t._id), true)))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 60)
      .map(strip);
  },
});

export const vTaskAction = v.union(
  v.literal("done"),
  v.literal("snooze"),
  v.literal("nudge"),
  v.literal("received"),
  v.literal("postpone"),
);
type TaskAction = "done" | "snooze" | "nudge" | "received" | "postpone";

async function applyAction(ctx: MutationCtx, task: Doc<"tasks">, action: TaskAction) {
  if (action === "done") await setCompleted(ctx, task, true);
  else if (action === "snooze") await snoozeTask(ctx, task, 15);
  else if (action === "nudge") await recordNudge(ctx, task);
  else if (action === "received") await stopWaiting(ctx, task);
  else await postponeFollowUp(ctx, task, 2);
}

/** Action depuis un bouton de notification, autorisée par jeton. */
export const actByToken = internalMutation({
  args: { taskId: v.string(), token: v.string(), action: vTaskAction },
  handler: async (ctx, { taskId, token, action }) => {
    const id = ctx.db.normalizeId("tasks", taskId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task?.actionToken || !task.actionKind || task.actionToken !== token) return false;
    if ((task.actionTokenExpiresAt ?? 0) < Date.now()) return false;
    if (!(ACTIONS_BY_KIND[task.actionKind] as readonly string[]).includes(action)) return false;
    // Usage unique : le jeton est consommé avant d'agir.
    await ctx.db.patch(task._id, { actionToken: undefined, actionTokenExpiresAt: undefined, actionKind: undefined });
    await applyAction(ctx, { ...task, actionToken: undefined }, action);
    return true;
  },
});

/** Action depuis Telegram : la tâche doit appartenir à l'utilisateur lié à ce chat. */
export const actForUser = internalMutation({
  args: { userId: v.id("users"), taskId: v.string(), action: vTaskAction },
  handler: async (ctx, { userId, taskId, action }) => {
    const id = ctx.db.normalizeId("tasks", taskId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || task.userId !== userId) return null;
    await applyAction(ctx, task, action);
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
      recurrence: parsed.recurrence,
      waitingFor: parsed.waitingFor,
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
