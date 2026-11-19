import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { ops } from "../lib/offline";
import { errorMessage } from "../lib/errors";
import { parseQuickTask } from "../../convex/lib/parse";
import { formatDueLong, userTimeZone } from "../lib/dates";
import { PRIORITY_LABEL } from "../lib/tasks";
import { recurrenceLabel } from "../../convex/lib/recurrence";

export type QuickCaptureHandle = { focus: () => void; prefill: (text: string) => void };

export const QuickCapture = forwardRef<QuickCaptureHandle, { defaultWorkstream?: string | null; onCreated?: (id: string) => void }>(
  function QuickCapture({ defaultWorkstream, onCreated }, ref) {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      prefill: (text: string) => {
        setValue(text);
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    }));

    // Rafraîchit l'aperçu « demain », « dans 2 heures »… chaque minute.
    const [tick, setTick] = useState(0);
    useEffect(() => {
      const id = setInterval(() => setTick((n) => n + 1), 60_000);
      return () => clearInterval(id);
    }, []);

    const parsed = useMemo(
      () => (value.trim() ? parseQuickTask(value, { now: Date.now(), timeZone: userTimeZone() }) : null),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [value, tick],
    );

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      if (!parsed || busy) return;
      setBusy(true);
      setError(null);
      try {
        const id = ops.create({
          title: parsed.title,
          dueAt: parsed.dueAt,
          priority: parsed.priority,
          workstream: parsed.workstream ?? defaultWorkstream ?? undefined,
          recurrence: parsed.recurrence,
        });
        setValue("");
        onCreated?.(id);
      } catch (err) {
        setError(errorMessage(err, "Impossible d'ajouter la tâche"));
      } finally {
        setBusy(false);
      }
    }

    const meta = parsed
      ? [
          parsed.dueAt ? formatDueLong(parsed.dueAt) : null,
          parsed.recurrence ? recurrenceLabel(parsed.recurrence, parsed.dueAt, userTimeZone()) : null,
          parsed.workstream ?? defaultWorkstream ?? null,
          parsed.priority !== "normal" ? PRIORITY_LABEL[parsed.priority] : null,
        ].filter(Boolean)
      : [];

    return (
      <form onSubmit={submit} className="border-b border-line">
        <label className="flex items-center gap-3 py-3">
          <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-ink-3 text-ink-3">
            +
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Nouvelle tâche… ex. Brief campagne vendredi 9h #Créa !urgent"
            aria-label="Nouvelle tâche"
            maxLength={400}
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-3"
          />
          {value && (
            <button type="submit" disabled={busy} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-60">
              Ajouter <CornerDownLeft className="size-3.5" aria-hidden />
            </button>
          )}
        </label>
        {parsed && (meta.length > 0 || parsed.title !== value.trim()) && (
          <p className="-mt-1 pb-3 pl-8 text-xs text-ink-2">
            <span className="font-medium text-ink">{parsed.title}</span>
            {meta.length > 0 && <span className="text-ink-2"> · {meta.join(" · ")}</span>}
          </p>
        )}
        {error && (
          <p role="alert" className="-mt-1 pb-3 pl-8 text-xs font-medium text-alert">
            {error}
          </p>
        )}
      </form>
    );
  },
);
