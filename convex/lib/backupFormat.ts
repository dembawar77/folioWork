import type { Doc } from "../_generated/dataModel";

/** Ce qu'une tâche exporte : son contenu, sans les rouages internes (programmations, jetons). */
export function exportTask(t: Doc<"tasks">) {
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

export type ExportedTask = ReturnType<typeof exportTask>;

/** Ouvertes d'abord (par échéance), puis terminées. */
export function sortExport<T extends Pick<ExportedTask, "completed" | "dueAt" | "createdAt">>(tasks: T[]): T[] {
  return [...tasks].sort(
    (a, b) => Number(a.completed) - Number(b.completed) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt,
  );
}

/** Fichier de sauvegarde complet (même format depuis l'app et depuis le serveur). */
export function backupJson<B extends { tasks: ExportedTask[] }>(b: B): string {
  const tasks = b.tasks.map((t) => {
    let note: unknown = t.note;
    try {
      if (t.note) note = JSON.parse(t.note);
    } catch {
      /* note en texte brut */
    }
    return { ...t, note };
  });
  return JSON.stringify({ ...b, tasks }, null, 2);
}
