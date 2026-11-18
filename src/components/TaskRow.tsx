import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ChevronDown, FileText, Trash2, BellOff, Bell } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/errors";
import type { Id } from "../../convex/_generated/dataModel";
import { formatDueShort, fromLocalInput, toLocalInput } from "../lib/dates";
import { PRIORITIES, PRIORITY_LABEL, type Priority, type Task } from "../lib/tasks";

// Tiptap est lourd : chargé seulement à l'ouverture d'une note.
const NoteEditor = lazy(() => import("./NoteEditor").then((m) => ({ default: m.NoteEditor })));

const REMINDER_OPTIONS = [
  { value: "none", label: "Pas de rappel" },
  { value: "0", label: "À l'heure" },
  { value: "15", label: "15 min avant" },
  { value: "60", label: "1 h avant" },
  { value: "1440", label: "1 jour avant" },
];

function reminderValue(t: Task): string {
  if (t.remindAt === undefined) return "none";
  if (t.dueAt === undefined) return "custom";
  const diff = Math.round((t.dueAt - t.remindAt) / 60_000);
  return REMINDER_OPTIONS.some((o) => o.value === String(diff)) ? String(diff) : "custom";
}

export function TaskRow({
  task,
  expanded,
  onToggleExpand,
  workstreams,
  defaultOffset,
}: {
  task: Task;
  expanded: boolean;
  onToggleExpand: () => void;
  workstreams: string[];
  defaultOffset: number;
}) {
  const toggle = useMutation(api.tasks.toggle).withOptimisticUpdate((store, { id }) => {
    const list = store.getQuery(api.tasks.list, {});
    if (list) store.setQuery(api.tasks.list, {}, list.map((t) => (t._id === id ? { ...t, completed: !t.completed, completedAt: Date.now() } : t)));
  });
  const now = Date.now();
  const overdue = !task.completed && task.dueAt !== undefined && task.dueAt < now;
  const soon = !task.completed && !overdue && task.dueAt !== undefined && task.dueAt - now < 2 * 3_600_000;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  const meta: React.ReactNode[] = [];
  if (task.priority === "urgent" || task.priority === "high") {
    meta.push(
      <span key="p" className={task.priority === "urgent" ? "font-medium text-danger" : "font-medium text-warn"}>
        {PRIORITY_LABEL[task.priority]}
      </span>,
    );
  }
  if (task.dueAt !== undefined) {
    meta.push(
      <span key="d" className={`tabular ${overdue ? "text-danger" : soon ? "text-warn" : ""}`}>
        {overdue ? "En retard · " : ""}
        {formatDueShort(task.dueAt)}
      </span>,
    );
  }
  if (task.workstream) meta.push(<span key="w">{task.workstream}</span>);
  if (task.checklistTotal) {
    meta.push(
      <span key="c" className="tabular">
        {task.checklistDone ?? 0}/{task.checklistTotal}
      </span>,
    );
  }
  if (task.noteText?.trim() && !task.checklistTotal) meta.push(<FileText key="n" className="inline size-3.5" aria-label="Contient une note" />);

  return (
    <div ref={rowRef} id={`task-${task._id}`} className={`border-b border-line ${expanded ? "bg-alabaster" : ""}`}>
      <div className="flex min-h-14 items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? `Rouvrir « ${task.title} »` : `Terminer « ${task.title} »`}
          onClick={() => toggle({ id: task._id })}
          className="-ml-2.5 grid size-11 shrink-0 place-items-center"
        >
          <span
            className={`grid size-5 place-items-center rounded-full border transition-colors duration-150 ${
              task.completed ? "border-ok bg-ok text-white" : task.priority === "urgent" ? "border-danger" : "border-ink-3 hover:border-ink"
            }`}
          >
            {task.completed && (
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>
        {expanded ? (
          <>
            <div className="min-w-0 flex-1 py-2">
              <TitleInput task={task} />
              {meta.length > 0 && <Meta items={meta} />}
            </div>
            <button type="button" onClick={onToggleExpand} aria-expanded aria-label="Refermer" className="grid size-11 shrink-0 place-items-center">
              <ChevronDown className="size-4 rotate-180 text-ink-3 transition-transform duration-200 ease-out-expo" aria-hidden />
            </button>
          </>
        ) : (
          <button type="button" onClick={onToggleExpand} aria-expanded={false} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${task.completed ? "text-ink-3 line-through" : ""}`}>{task.title}</span>
              {meta.length > 0 && <Meta items={meta} />}
            </span>
            <span className="grid size-11 shrink-0 place-items-center">
              <ChevronDown className="size-4 text-ink-3 transition-transform duration-200 ease-out-expo" aria-hidden />
            </span>
          </button>
        )}
      </div>
      {expanded && <TaskDetail task={task} workstreams={workstreams} defaultOffset={defaultOffset} />}
    </div>
  );
}

function TaskDetail({ task, workstreams, defaultOffset }: { task: Task; workstreams: string[]; defaultOffset: number }) {
  const update = useMutation(api.tasks.update);
  const saveNote = useMutation(api.tasks.saveNote);
  const remove = useMutation(api.tasks.remove);
  const [error, setError] = useState<string | null>(null);

  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
    } catch (err) {
      setError(errorMessage(err, "Modification impossible"));
    }
  };

  const id = task._id as Id<"tasks">;
  const reminder = reminderValue(task);

  function setDue(value: string) {
    const dueAt = fromLocalInput(value);
    if (dueAt === undefined) return run(update({ id, dueAt: null, remindAt: null }));
    const offset = reminder === "none" ? (task.dueAt === undefined ? defaultOffset : null) : reminder === "custom" ? defaultOffset : Number(reminder);
    return run(update({ id, dueAt, remindAt: offset === null ? null : dueAt - offset * 60_000 }));
  }

  function setReminder(value: string) {
    if (value === "none") return run(update({ id, remindAt: null }));
    if (task.dueAt === undefined) return;
    return run(update({ id, remindAt: task.dueAt - Number(value) * 60_000 }));
  }

  return (
    <div className="animate-reveal pb-5 pl-8 sm:pl-9">
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Field label="Échéance">
          <input
            type="datetime-local"
            value={toLocalInput(task.dueAt)}
            onChange={(e) => setDue(e.target.value)}
            className="tabular w-full bg-transparent text-[13px] outline-none"
          />
        </Field>
        <Field label="Rappel" icon={reminder === "none" ? BellOff : Bell}>
          <select
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            disabled={task.dueAt === undefined && reminder === "none"}
            className="w-full bg-transparent outline-none disabled:text-ink-3"
          >
            {reminder === "custom" && task.remindAt !== undefined && <option value="custom">{formatDueShort(task.remindAt)}</option>}
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorité">
          <select value={task.priority} onChange={(e) => run(update({ id, priority: e.target.value as Priority }))} className="w-full bg-transparent outline-none">
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Catégorie">
          <input
            list="workstreams"
            defaultValue={task.workstream ?? ""}
            placeholder="Aucune"
            maxLength={40}
            onBlur={(e) => e.target.value !== (task.workstream ?? "") && run(update({ id, workstream: e.target.value || null }))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent outline-none placeholder:text-ink-3"
          />
          <datalist id="workstreams">
            {workstreams.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="mt-4 rounded-md border border-line bg-canvas p-3">
        <Suspense fallback={<div className="h-24" aria-busy />}>
          <NoteEditor key={task._id} initial={task.note} onChange={(c) => saveNote({ id, ...c })} />
        </Suspense>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
        <span className="tabular">
          Créée le {new Date(task._creationTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          {task.reminderSentAt ? " · rappel envoyé" : ""}
        </span>
        <button
          type="button"
          onClick={() => window.confirm(`Supprimer « ${task.title} » ?`) && run(remove({ id }))}
          className="inline-flex h-9 items-center gap-1.5 rounded px-2 text-ink-2 hover:bg-hover hover:text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden /> Supprimer
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: typeof Bell; children: React.ReactNode }) {
  return (
    <label className="block border-b border-line pb-1.5">
      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
        {Icon && <Icon className="size-3" aria-hidden />}
        {label}
      </span>
      {children}
    </label>
  );
}

function Meta({ items }: { items: React.ReactNode[] }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
      {items.map((m, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-ink-3">·</span>}
          {m}
        </span>
      ))}
    </span>
  );
}

function TitleInput({ task }: { task: Task }) {
  const update = useMutation(api.tasks.update);
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);
  const commit = () => {
    const t = title.trim();
    if (!t) setTitle(task.title);
    else if (t !== task.title) void update({ id: task._id as Id<"tasks">, title: t }).catch(() => setTitle(task.title));
  };
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Titre de la tâche"
      maxLength={300}
      className={`block w-full rounded-sm bg-transparent font-medium outline-none focus:bg-canvas focus:ring-1 focus:ring-line ${task.completed ? "text-ink-3 line-through" : ""}`}
    />
  );
}
