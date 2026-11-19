import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Hourglass, MessageCircle, Check, Pencil, CalendarClock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { followUpMessage, formatPhone, normalizePhone, whatsappLink } from "../../convex/lib/whatsapp";
import { formatDueLong, userTimeZone } from "../lib/dates";
import { errorMessage } from "../lib/errors";
import type { Task } from "../lib/tasks";

const DELAYS = [1, 2, 3, 5, 7];

/** « En attente de… » : qui doit vous répondre, et la relance WhatsApp en un geste. */
export function WaitingSection({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const w = task.waitingFor;

  if (task.completed && !w) return null;
  if (!w && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-line px-4 text-sm text-ink-2 hover:border-ink hover:text-ink"
      >
        <Hourglass className="size-4" aria-hidden /> Mettre en attente de…
      </button>
    );
  }
  if (editing || !w) return <WaitingForm task={task} onDone={() => setEditing(false)} />;
  return <WaitingStatus task={task} onEdit={() => setEditing(true)} />;
}

function WaitingStatus({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const w = task.waitingFor!;
  const id = task._id as Id<"tasks">;
  const nudged = useMutation(api.tasks.nudged);
  const received = useMutation(api.tasks.received);
  const delay = useMutation(api.tasks.delayFollowUp);
  const [confirming, setConfirming] = useState(false);
  const [delaying, setDelaying] = useState(false);
  const tz = userTimeZone();
  const days = Math.floor((Date.now() - w.since) / 86_400_000);
  const due = w.nextFollowUpAt <= Date.now();
  const link = whatsappLink(w.phone, followUpMessage(w.name, task.title, task.dueAt, tz));
  const first = w.name.split(/\s+/)[0];

  return (
    <div className={`mt-4 border bg-canvas p-3 ${due ? "border-soon" : "border-line"}`}>
      <p className="eyebrow mb-2 flex items-center gap-1.5 text-ink-2">
        <Hourglass className="size-3" aria-hidden /> En attente
      </p>
      <p className="text-[15px] text-ink">
        <span className="font-medium">{w.name}</span>
        <span className="text-ink-2">
          {" "}
          · depuis {days === 0 ? "aujourd'hui" : `${days} jour${days > 1 ? "s" : ""}`}
          {w.nudges > 0 && ` · ${w.nudges} relance${w.nudges > 1 ? "s" : ""}`}
        </span>
      </p>
      <p className={`mt-0.5 text-[13px] ${due ? "font-medium text-soon" : "text-ink-2"}`}>
        {due ? "À relancer : reste dans la liste tant que vous n'avez pas agi" : `Prochaine relance ${formatDueLong(w.nextFollowUpAt).toLowerCase()}`}
        {!due && ` · tous les ${w.everyDays} jour${w.everyDays > 1 ? "s" : ""}`}
      </p>
      <p className="mt-0.5 text-xs text-ink-2">{w.phone ? formatPhone(w.phone) : "Sans numéro : WhatsApp vous demandera le destinataire."}</p>

      {confirming ? (
        <div className="animate-reveal mt-3 border-t border-line pt-3">
          <p className="text-sm text-ink">Message envoyé à {first} ?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void nudged({ id });
                setConfirming(false);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white"
            >
              <Check className="size-4" aria-hidden /> Oui, j'ai relancé
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
              Pas encore
            </button>
          </div>
        </div>
      ) : delaying ? (
        <div className="animate-reveal mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-sm text-ink-2">Relancer</span>
          {[
            { d: 1, l: "demain" },
            { d: 2, l: "dans 2 jours" },
            { d: 7, l: "dans 1 semaine" },
          ].map((o) => (
            <button
              key={o.d}
              type="button"
              onClick={() => {
                void delay({ id, days: o.d });
                setDelaying(false);
              }}
              className="h-9 rounded-full border border-line px-4 text-sm hover:border-accent hover:text-accent"
            >
              {o.l}
            </button>
          ))}
          <button type="button" onClick={() => setDelaying(false)} className="h-9 rounded-full px-3 text-sm text-ink-2 hover:bg-hover">
            Annuler
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            onClick={() => setConfirming(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white transition-opacity duration-200 ease-brand hover:opacity-90"
          >
            <MessageCircle className="size-4" aria-hidden /> Relancer sur WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void nudged({ id })}
            title="Relancé par téléphone, e-mail ou de vive voix"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:border-ink"
          >
            J'ai relancé
          </button>
          <button
            type="button"
            onClick={() => void received({ id })}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:border-ink"
          >
            <Check className="size-4" aria-hidden /> Reçu
          </button>
          <button type="button" onClick={() => setDelaying(true)} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
            <CalendarClock className="size-3.5" aria-hidden /> Reporter
          </button>
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
            <Pencil className="size-3.5" aria-hidden /> Modifier
          </button>
        </div>
      )}
    </div>
  );
}

function WaitingForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const contacts = useQuery(api.tasks.contacts) ?? [];
  const setWaiting = useMutation(api.tasks.setWaiting);
  const [name, setName] = useState(task.waitingFor?.name ?? "");
  const [phone, setPhone] = useState(task.waitingFor?.phone ? formatPhone(task.waitingFor.phone) : "");
  const [everyDays, setEveryDays] = useState(task.waitingFor?.everyDays ?? 2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const known = useMemo(() => contacts.find((c) => c.name.toLowerCase() === name.trim().toLowerCase()), [contacts, name]);
  const phoneOk = !phone.trim() || !!normalizePhone(phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setWaiting({ id: task._id as Id<"tasks">, name, phone: phone.trim() || undefined, everyDays });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Enregistrement impossible"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border border-line bg-canvas p-3">
      <p className="eyebrow mb-3 flex items-center gap-1.5 text-ink-2">
        <Hourglass className="size-3" aria-hidden /> En attente de
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="eyebrow mb-1 block text-ink-2">Personne</span>
          <input
            autoFocus
            required
            list="contacts"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              const c = contacts.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
              if (c?.phone && !phone) setPhone(formatPhone(c.phone));
            }}
            placeholder="Moussa (imprimeur)"
            maxLength={60}
            className="h-10 w-full border border-line px-3 outline-none focus:border-ink"
          />
          <datalist id="contacts">
            {contacts.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block text-ink-2">WhatsApp (facultatif)</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={known?.phone ? formatPhone(known.phone) : "77 123 45 67"}
            aria-invalid={!phoneOk}
            className={`h-10 w-full border px-3 outline-none focus:border-ink ${phoneOk ? "border-line" : "border-alert"}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block text-ink-2">Relancer</span>
          <select value={everyDays} onChange={(e) => setEveryDays(Number(e.target.value))} className="h-10 w-full border border-line bg-canvas px-2">
            {DELAYS.map((d) => (
              <option key={d} value={d}>
                tous les {d} j
              </option>
            ))}
          </select>
        </label>
      </div>
      {!phoneOk && <p className="mt-2 text-xs font-medium text-alert">Numéro non reconnu. Exemple : 77 123 45 67 ou +33 6 12 34 56 78.</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy || !name.trim() || !phoneOk} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-50">
          {task.waitingFor ? "Enregistrer" : "Mettre en attente"}
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
          Annuler
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-2">Relance à 9h, avec un message WhatsApp déjà rédigé. Le numéro est mémorisé pour la prochaine fois.</p>
    </form>
  );
}
