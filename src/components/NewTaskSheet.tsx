import { useEffect, useMemo, useRef, useState } from "react";
import { X, CalendarClock, Flag, Tag, Repeat, Hourglass, ArrowUp } from "lucide-react";
import { ops, useCachedQuery } from "../lib/offline";
import { parseQuickTask } from "../../convex/lib/parse";
import { dayAt, recurrenceLabel } from "../../convex/lib/recurrence";
import { formatDueLong, fromLocalInput, toLocalInput, userTimeZone } from "../lib/dates";
import { errorMessage } from "../lib/errors";
import { PRIORITIES, PRIORITY_LABEL, RECURRENCE_OPTIONS, type Priority } from "../lib/tasks";

type When = "auto" | "tonight" | "tomorrow" | "monday" | "custom" | "none";

function whenAt(when: When, custom: string): number | undefined {
  const tz = userTimeZone();
  const now = Date.now();
  if (when === "tonight") {
    const t = dayAt(now, 0, "18:00", tz);
    return t > now ? t : dayAt(now, 1, "18:00", tz);
  }
  if (when === "tomorrow") return dayAt(now, 1, "09:00", tz);
  if (when === "monday") {
    const day = new Date().getDay(); // 0 = dimanche
    return dayAt(now, (8 - day) % 7 || 7, "09:00", tz);
  }
  if (when === "custom") return fromLocalInput(custom);
  return undefined;
}

/** Écran « Nouvelle tâche » : une phrase, puis des raccourcis à toucher si besoin. */
export function NewTaskSheet({
  open,
  onClose,
  onCreated,
  workstreams,
  defaultWorkstream,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, title: string) => void;
  workstreams: string[];
  defaultWorkstream: string | null;
  prefill: string;
}) {
  const contacts = useCachedQuery("contacts") ?? [];
  const [text, setText] = useState("");
  const [when, setWhen] = useState<When>("auto");
  const [custom, setCustom] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [stream, setStream] = useState<string | null | undefined>(undefined);
  const [repeat, setRepeat] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Remise à zéro à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setText(prefill);
    setWhen("auto");
    setCustom("");
    setPriority(null);
    setStream(undefined);
    setRepeat(null);
    setWaiting(null);
    setError(null);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tz = userTimeZone();
  const parsed = useMemo(() => (text.trim() ? parseQuickTask(text, { now: Date.now(), timeZone: tz }) : null), [text, tz]);

  // Ce que la phrase indique, sauf si un raccourci a été touché.
  const dueAt = when === "auto" ? parsed?.dueAt : when === "none" ? undefined : whenAt(when, custom);
  const prio: Priority = priority ?? parsed?.priority ?? "normal";
  const ws = stream === undefined ? (parsed?.workstream ?? defaultWorkstream ?? null) : stream;
  const recOption = RECURRENCE_OPTIONS.find((o) => o.value === repeat);
  const rec = repeat === null ? parsed?.recurrence : (recOption?.rule ?? undefined);
  const waitName = waiting === null ? parsed?.waitingFor : waiting.trim() || undefined;
  const title = parsed?.title ?? "";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = ops.create({
        title,
        dueAt,
        priority: prio,
        workstream: ws ?? undefined,
        recurrence: rec ? { freq: rec.freq, interval: rec.interval } : undefined,
        waitingFor: waitName,
      });
      onCreated(id, title);
    } catch (err) {
      setError(errorMessage(err, "Impossible d'ajouter la tâche"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const summary = [
    dueAt !== undefined ? formatDueLong(dueAt) : "Sans échéance",
    rec ? recurrenceLabel(rec, dueAt, tz) : null,
    ws,
    prio !== "normal" ? PRIORITY_LABEL[prio] : null,
    waitName ? `En attente de ${waitName}` : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-start md:pt-[12vh]" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
      <button type="button" aria-label="Fermer" onClick={onClose} className="animate-fade absolute inset-0 bg-scrim" />
      <form
        onSubmit={submit}
        className="animate-sheet relative flex max-h-[92dvh] w-full flex-col bg-canvas md:max-h-[76vh] md:max-w-xl md:border md:border-line"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3 md:px-6">
          <h2 id="new-task-title" className="eyebrow text-accent">
            Nouvelle tâche
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 md:px-6">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={400}
            placeholder="Brief campagne vendredi 9h #Créa !urgent"
            aria-label="Titre de la tâche"
            className="w-full resize-none bg-transparent font-display text-2xl leading-snug text-ink outline-none placeholder:text-ink-3"
          />
          <p className="mt-1 min-h-5 text-[13px] text-ink-2" aria-live="polite">
            {title ? summary.join(" · ") : "Écrivez la tâche ; la date, #catégorie, !priorité et @personne sont compris."}
          </p>

          <Row icon={CalendarClock} label="Quand">
            <Chip on={when === "auto" && parsed?.dueAt !== undefined} onClick={() => setWhen("auto")} hidden={parsed?.dueAt === undefined}>
              {parsed?.dueAt !== undefined ? formatDueLong(parsed.dueAt) : ""}
            </Chip>
            <Chip on={when === "tonight"} onClick={() => setWhen("tonight")}>Ce soir 18h</Chip>
            <Chip on={when === "tomorrow"} onClick={() => setWhen("tomorrow")}>Demain 9h</Chip>
            <Chip on={when === "monday"} onClick={() => setWhen("monday")}>Lundi 9h</Chip>
            <Chip on={when === "none" || (when === "auto" && parsed?.dueAt === undefined)} onClick={() => setWhen("none")}>Sans date</Chip>
            <label className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] ${when === "custom" ? "border-accent text-accent" : "border-line text-ink-2"}`}>
              <span className="sr-only">Date et heure</span>
              <input
                type="datetime-local"
                value={custom || toLocalInput(dueAt)}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setWhen("custom");
                }}
                className="tabular bg-transparent outline-none"
              />
            </label>
          </Row>

          <Row icon={Flag} label="Priorité">
            {PRIORITIES.map((p) => (
              <Chip key={p.value} on={prio === p.value} onClick={() => setPriority(p.value)}>
                {p.label}
              </Chip>
            ))}
          </Row>

          <Row icon={Tag} label="Catégorie">
            {workstreams.map((w) => (
              <Chip key={w} on={ws === w} onClick={() => setStream(ws === w ? null : w)}>
                {w}
              </Chip>
            ))}
          </Row>

          <Row icon={Repeat} label="Répéter">
            {RECURRENCE_OPTIONS.map((o) => {
              const current = rec ? `${rec.freq}:${rec.interval}` : "none";
              return (
                <Chip key={o.value} on={current === o.value} onClick={() => setRepeat(o.value)}>
                  {o.label}
                </Chip>
              );
            })}
          </Row>

          <Row icon={Hourglass} label="En attente de">
            <input
              list="sheet-contacts"
              value={waiting ?? parsed?.waitingFor ?? ""}
              onChange={(e) => setWaiting(e.target.value)}
              placeholder="Personne (facultatif)"
              maxLength={60}
              className="h-9 w-full max-w-xs rounded-full border border-line px-4 text-[13px] outline-none focus:border-accent"
            />
            <datalist id="sheet-contacts">
              {contacts.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </Row>

          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-alert">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
          <button
            type="submit"
            disabled={!title || busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-on-accent transition-opacity duration-200 ease-brand hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
            {busy ? "Ajout…" : "Ajouter la tâche"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Flag; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="eyebrow mb-2 flex items-center gap-1.5 text-ink-2">
        <Icon className="size-3" aria-hidden />
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, hidden, children }: { on: boolean; onClick: () => void; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-9 rounded-full border px-4 text-[13px] whitespace-nowrap transition-colors duration-150 ease-brand ${
        on ? "border-accent bg-accent text-on-accent" : "border-line text-ink-2 hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
