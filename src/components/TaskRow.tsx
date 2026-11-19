import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Trash2, BellOff, Bell, Repeat, Hourglass, CalendarClock, Inbox, MessageCircle } from "lucide-react";
import { formatPhone, whatsappLink } from "../../convex/lib/whatsapp";
import { WaitingSection } from "./WaitingSection";
import { SwipeRow } from "./SwipeRow";
import { recurrenceLabel } from "../../convex/lib/recurrence";
import { isLocalId, keyOf, ops } from "../lib/offline";
import { formatDueShort, formatIn, fromLocalInput, toLocalInput, userTimeZone } from "../lib/dates";
import { PRIORITIES, PRIORITY_LABEL, RECURRENCE_OPTIONS, recurrenceValue, type Priority, type Task } from "../lib/tasks";

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
  onToggled,
  onPostponed,
}: {
  onToggled?: (task: Task, completed: boolean) => void;
  onPostponed?: (task: Task, prev: { dueAt: number | null; remindAt: number | null }) => void;
  task: Task;
  expanded: boolean;
  onToggleExpand: () => void;
  workstreams: string[];
  defaultOffset: number;
}) {
  // Une nouvelle demande est marquée « vue » quand on la referme (pas à l'ouverture,
  // sinon elle quitterait la liste pendant qu'on la lit).
  const unseenRef = useRef(false);
  unseenRef.current = !!task.request && !task.request.seen;
  useEffect(() => {
    if (!expanded) return;
    return () => {
      if (unseenRef.current) ops.markSeen(task._id);
    };
  }, [expanded, task._id]);
  const complete = () => {
    ops.setDone(task._id, !task.completed);
    onToggled?.(task, !task.completed);
  };
  const postponeTomorrow = async () => {
    const prev = ops.postpone(task, 1);
    onPostponed?.(task, prev);
  };
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
      <span key="p" className={`eyebrow ${task.priority === "urgent" ? "text-ink" : "text-ink-2"}`}>
        {PRIORITY_LABEL[task.priority]}
      </span>,
    );
  }
  if (task.dueAt !== undefined) {
    meta.push(
      <span key="d" className={`tabular ${overdue ? "font-medium text-alert" : soon ? "font-medium text-soon" : ""}`}>
        {overdue ? `En retard · ${formatDueShort(task.dueAt)}` : soon ? formatIn(task.dueAt, now) : formatDueShort(task.dueAt)}
      </span>,
    );
  }
  if (task.recurrence && !task.completed) {
    meta.push(
      <span key="r" className="inline-flex items-center gap-1">
        <Repeat className="size-3" aria-hidden />
        {recurrenceLabel(task.recurrence, task.dueAt, userTimeZone())}
      </span>,
    );
  }
  if (task.request && !task.completed) {
    meta.push(
      <span key="rq" className={`inline-flex items-center gap-1 ${task.request.seen ? "" : "font-medium text-accent"}`}>
        <Inbox className="size-3" aria-hidden />
        {task.request.seen ? `Demande de ${task.request.from}` : `Nouvelle demande · ${task.request.from}`}
      </span>,
    );
  }
  if (task.waitingFor && !task.completed) {
    const toNudge = task.waitingFor.nextFollowUpAt <= now;
    const days = Math.floor((now - task.waitingFor.since) / 86_400_000);
    meta.push(
      <span key="wf" className={`inline-flex items-center gap-1 ${toNudge ? "font-medium text-soon" : ""}`}>
        <Hourglass className="size-3" aria-hidden />
        {toNudge ? `À relancer · ${task.waitingFor.name}` : `Attend ${task.waitingFor.name}${days > 0 ? ` · ${days} j` : ""}`}
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
      <SwipeRow disabled={expanded || task.completed} onRight={complete} onLeft={() => void postponeTomorrow()} surface={expanded ? "bg-alabaster" : "bg-canvas"}>
      <div className="flex min-h-14 items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? `Rouvrir « ${task.title} »` : `Terminer « ${task.title} »`}
          onClick={complete}
          className="-ml-2.5 grid size-11 shrink-0 place-items-center"
        >
          <span
            className={`grid size-5 place-items-center rounded-full border transition-colors duration-150 ${
              task.completed ? "border-accent bg-accent text-white" : task.priority === "urgent" ? "border-[1.5px] border-ink" : "border-ink-3 hover:border-accent"
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
              <ChevronDown className="size-4 rotate-180 text-ink-3 transition-transform duration-200 ease-brand" aria-hidden />
            </button>
          </>
        ) : (
          <button type="button" onClick={onToggleExpand} aria-expanded={false} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${task.completed ? "text-ink-3 line-through" : ""}`}>{task.title}</span>
              {meta.length > 0 && <Meta items={meta} />}
            </span>
            <span className="grid size-11 shrink-0 place-items-center">
              <ChevronDown className="size-4 text-ink-3 transition-transform duration-200 ease-brand" aria-hidden />
            </span>
          </button>
        )}
      </div>
      </SwipeRow>
      {expanded && <TaskDetail task={task} workstreams={workstreams} defaultOffset={defaultOffset} onPostpone={postponeTomorrow} />}
    </div>
  );
}

function TaskDetail({
  task,
  workstreams,
  defaultOffset,
  onPostpone,
}: {
  task: Task;
  workstreams: string[];
  defaultOffset: number;
  onPostpone: () => Promise<void>;
}) {
  // Les modifications s'affichent tout de suite et partent au serveur dès que possible
  // (même hors ligne) ; un refus du serveur s'affiche dans le bandeau du bas.
  const update = (args: Parameters<typeof ops.update>[1]) => ops.update(task._id, args);
  const reminder = reminderValue(task);

  function setDue(value: string) {
    const dueAt = fromLocalInput(value);
    if (dueAt === undefined) return update({ dueAt: null, remindAt: null });
    const offset = reminder === "none" ? (task.dueAt === undefined ? defaultOffset : null) : reminder === "custom" ? defaultOffset : Number(reminder);
    return update({ dueAt, remindAt: offset === null ? null : dueAt - offset * 60_000 });
  }

  function setReminder(value: string) {
    if (value === "none") return update({ remindAt: null });
    if (task.dueAt === undefined) return;
    return update({ remindAt: task.dueAt - Number(value) * 60_000 });
  }

  return (
    <div className="animate-reveal pb-5 pl-8 sm:pl-9">
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
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
          <select value={task.priority} onChange={(e) => update({ priority: e.target.value as Priority })} className="w-full bg-transparent outline-none">
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Répéter" icon={Repeat}>
          <select
            value={recurrenceValue(task.recurrence)}
            onChange={(e) => {
              const opt = RECURRENCE_OPTIONS.find((o) => o.value === e.target.value);
              if (opt) void update({ recurrence: opt.rule });
            }}
            disabled={task.dueAt === undefined}
            title={task.dueAt === undefined ? "Ajoutez d'abord une échéance" : undefined}
            className="w-full bg-transparent outline-none disabled:text-ink-3"
          >
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            onBlur={(e) => e.target.value !== (task.workstream ?? "") && update({ workstream: e.target.value || null })}
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

      {task.request && <RequestSection task={task} />}
      {/* Relances : disponibles une fois la tâche arrivée au serveur. */}
      {!isLocalId(task._id) && <WaitingSection task={task} />}

      <div className="mt-4 border border-line bg-canvas p-3">
        <Suspense fallback={<div className="h-24" aria-busy />}>
          <NoteEditor key={keyOf(task._id)} initial={task.note} onChange={async (c) => ops.saveNote(task._id, c)} />
        </Suspense>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-2">
        <span className="tabular">
          Créée le {new Date(task._creationTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          {task.reminderSentAt ? " · rappel envoyé" : ""}
          {task.reminderError && <span className="font-medium text-alert"> · {task.reminderError}</span>}
        </span>
        <span className="flex items-center gap-1">
        {!task.completed && (
          <button
            type="button"
            onClick={() => void onPostpone()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-ink-2 hover:bg-hover hover:text-ink"
          >
            <CalendarClock className="size-3.5" aria-hidden /> Reporter à demain
          </button>
        )}
        <button
          type="button"
          onClick={() => window.confirm(`Supprimer « ${task.title} » ?`) && ops.remove(task._id)}
          className="inline-flex h-9 items-center gap-1.5 px-2 text-ink-2 hover:bg-hover hover:text-ink"
        >
          <Trash2 className="size-3.5" aria-hidden /> Supprimer
        </button>
        </span>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: typeof Bell; children: React.ReactNode }) {
  return (
    <label className="block border-b border-line pb-1.5">
      <span className="eyebrow mb-1.5 flex items-center gap-1 text-ink-2">
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
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);
  const commit = () => {
    const t = title.trim();
    if (!t) setTitle(task.title);
    else if (t !== task.title) ops.update(task._id, { title: t });
  };
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Titre de la tâche"
      maxLength={300}
      className={`block w-full bg-transparent font-medium outline-none focus:bg-canvas ${task.completed ? "text-ink-3 line-through" : ""}`}
    />
  );
}

function RequestSection({ task }: { task: Task }) {
  const r = task.request!;
  const reply = r.phone
    ? whatsappLink(r.phone, `Bonjour ${r.from.split(/\s+/)[0]}, bien reçu votre demande « ${task.title} ». Je reviens vers vous rapidement.`)
    : null;
  return (
    <div className="mt-4 border border-line bg-canvas p-3">
      <p className="eyebrow mb-2 flex items-center gap-1.5 text-ink-2">
        <Inbox className="size-3" aria-hidden /> Demande reçue
      </p>
      <p className="text-[15px] text-ink">
        <span className="font-medium">{r.from}</span>
        {r.service && <span className="text-ink-2"> · {r.service}</span>}
      </p>
      <p className="mt-0.5 text-xs text-ink-2">
        Reçue {new Date(r.receivedAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
        {r.phone ? ` · ${formatPhone(r.phone)}` : ""}
      </p>
      {reply && (
        <a
          href={reply}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white transition-opacity duration-200 ease-brand hover:opacity-90"
        >
          <MessageCircle className="size-4" aria-hidden /> Répondre sur WhatsApp
        </a>
      )}
    </div>
  );
}
