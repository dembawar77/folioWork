import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
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
        return !t.completed && t.dueAt !== undefined && t.dueAt < end;
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
    list = list.sort((a, b) => a.dueAt! - b.dueAt! || RANK[a.priority] - RANK[b.priority]);
  }
  return list;
}

export function counts(tasks: Task[]) {
  const end = endOfToday();
  let today = 0,
    upcoming = 0,
    all = 0,
    done = 0,
    overdue = 0,
    waiting = 0,
    toNudge = 0;
  const now = Date.now();
  for (const t of tasks) {
    if (t.completed) {
      done++;
      continue;
    }
    all++;
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
  return { today, upcoming, all, done, overdue, waiting, toNudge };
}

export function workstreamsOf(tasks: Task[]): string[] {
  const set = new Set(DEFAULT_WORKSTREAMS);
  for (const t of tasks) if (t.workstream) set.add(t.workstream);
  return [...set];
}
