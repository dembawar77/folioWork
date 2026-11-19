import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { format, isTomorrow } from "date-fns";
import { fr } from "date-fns/locale";
import { endOfToday } from "./dates";

export type Task = FunctionReturnType<typeof api.tasks.list>[number];
export type Priority = Task["priority"];
export type View = "today" | "upcoming" | "all" | "waiting" | "done" | "alerts";

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "Haute" },
  { value: "normal", label: "Normale" },
  { value: "low", label: "Basse" },
];

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "Haute", normal: "Normale", low: "Basse" };

export type Recurrence = NonNullable<Task["recurrence"]>;

export const RECURRENCE_OPTIONS: { value: string; label: string; rule: Omit<Recurrence, "monthDay"> | null }[] = [
  { value: "none", label: "Jamais", rule: null },
  { value: "daily:1", label: "Tous les jours", rule: { freq: "daily", interval: 1 } },
  { value: "weekdays:1", label: "En semaine (lun–ven)", rule: { freq: "weekdays", interval: 1 } },
  { value: "weekly:1", label: "Toutes les semaines", rule: { freq: "weekly", interval: 1 } },
  { value: "weekly:2", label: "Toutes les 2 semaines", rule: { freq: "weekly", interval: 2 } },
  { value: "monthly:1", label: "Tous les mois", rule: { freq: "monthly", interval: 1 } },
];

export const recurrenceValue = (r: Recurrence | undefined) => (r ? `${r.freq}:${r.interval}` : "none");

export const DEFAULT_WORKSTREAMS = ["Campagnes", "Créa", "Digital", "Réunions", "Admin"];

export const VIEW_LABEL: Record<View, string> = {
  today: "Aujourd'hui",
  upcoming: "À venir",
  all: "Toutes",
  waiting: "En attente",
  done: "Terminées",
  alerts: "Alertes",
};

const RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function filterTasks(tasks: Task[], view: View, opts: { workstream: string | null; search: string }): Task[] {
  const end = endOfToday();
  const q = opts.search.trim().toLowerCase();
  let list = tasks.filter((t) => {
    if (opts.workstream && t.workstream !== opts.workstream) return false;
    if (q && !`${t.title} ${t.noteText ?? ""} ${t.workstream ?? ""}`.toLowerCase().includes(q)) return false;
    switch (view) {
      case "today":
        return !t.completed && ((t.dueAt !== undefined && t.dueAt < end) || isNewRequest(t));
      case "upcoming":
        return !t.completed && t.dueAt !== undefined && t.dueAt >= end;
      case "all":
        return !t.completed;
      case "waiting":
        return !t.completed && !!t.waitingFor;
      case "done":
        return t.completed;
      default:
        return false;
    }
  });
  if (view === "waiting") {
    list = list.sort(
      (a, b) =>
        a.waitingFor!.name.localeCompare(b.waitingFor!.name, "fr") || a.waitingFor!.nextFollowUpAt - b.waitingFor!.nextFollowUpAt,
    );
  } else if (view === "done") {
    list = list.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  } else if (view === "all") {
    list = list.sort(
      (a, b) =>
        RANK[a.priority] - RANK[b.priority] ||
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
        b._creationTime - a._creationTime,
    );
  } else {
    list = list.sort(
      (a, b) =>
        Number(isNewRequest(b)) - Number(isNewRequest(a)) ||
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
        RANK[a.priority] - RANK[b.priority],
    );
  }
  return list;
}

/** Demande reçue par la boîte de dépôt et pas encore ouverte. */
export const isNewRequest = (t: Task) => !t.completed && !!t.request && !t.request.seen;

export function counts(tasks: Task[]) {
  const end = endOfToday();
  let today = 0,
    upcoming = 0,
    all = 0,
    done = 0,
    overdue = 0,
    waiting = 0,
    toNudge = 0,
    doneToday = 0,
    newRequests = 0;
  const startOfToday = end - 86_400_000;
  const now = Date.now();
  for (const t of tasks) {
    if (t.completed) {
      done++;
      if ((t.completedAt ?? 0) >= startOfToday) doneToday++;
      continue;
    }
    all++;
    if (isNewRequest(t)) newRequests++;
    if (t.waitingFor) {
      waiting++;
      if (t.waitingFor.nextFollowUpAt <= now) toNudge++;
    }
    if (t.dueAt !== undefined) {
      if (t.dueAt < end) today++;
      else upcoming++;
      if (t.dueAt < now) overdue++;
    }
  }
  return { today, upcoming, all, done, overdue, waiting, toNudge, doneToday, newRequests };
}

export function workstreamsOf(tasks: Task[]): string[] {
  const set = new Set(DEFAULT_WORKSTREAMS);
  for (const t of tasks) if (t.workstream) set.add(t.workstream);
  return [...set];
}

export type Group = { key: string; label: string; tone?: "alert" | "accent" };

/** Section d'une tâche dans la liste : retard / aujourd'hui, jour à venir, personne attendue. */
export function groupOf(t: Task, view: View, now: number): Group | null {
  if (view === "today" && isNewRequest(t)) return { key: "new", label: "Nouvelles demandes", tone: "accent" };
  if (view === "today" && t.dueAt !== undefined) {
    return t.dueAt < now ? { key: "late", label: "En retard", tone: "alert" } : { key: "today", label: "Aujourd'hui" };
  }
  if (view === "upcoming" && t.dueAt !== undefined) {
    const d = new Date(t.dueAt);
    const label = isTomorrow(d) ? "Demain" : format(d, "EEEE d MMMM", { locale: fr });
    return { key: format(d, "yyyy-MM-dd"), label };
  }
  if (view === "waiting" && t.waitingFor) return { key: t.waitingFor.name, label: t.waitingFor.name };
  return null;
}
