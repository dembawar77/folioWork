import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowUp, Check } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { normalizePhone } from "../../convex/lib/whatsapp";
import { errorMessage } from "../lib/errors";
import { Wordmark } from "./Wordmark";

/** Page publique : un collègue dépose une demande, sans compte. */
export function IntakePage({ slug }: { slug: string }) {
  const info = useQuery(api.intake.publicInfo, { slug });
  const submit = useMutation(api.intake.submit);
  const [form, setForm] = useState({ from: "", service: "", phone: "", title: "", details: "", dueDate: "", urgent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const phoneOk = !form.phone.trim() || !!normalizePhone(form.phone);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit({
        slug,
        from: form.from,
        service: form.service || undefined,
        phone: form.phone || undefined,
        title: form.title,
        details: form.details || undefined,
        dueDate: form.dueDate || undefined,
        urgent: form.urgent,
        website: form.website || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Envoi impossible. Réessayez."));
    } finally {
      setBusy(false);
    }
  }

  const input = "h-12 w-full border border-line bg-canvas px-4 text-[15px] text-ink outline-none focus:border-accent";

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <Wordmark />
        <span className="eyebrow text-ink-2">Boîte de dépôt</span>
      </header>

      {info === undefined ? (
        <div className="py-24" aria-busy />
      ) : info.status === "moved" ? (
        <section className="py-16">
          <h1 className="text-3xl">Ce formulaire a changé d'adresse.</h1>
          {info.newSlug ? (
            <>
              <p className="mt-3 text-ink-2">Pour faire votre demande, utilisez désormais la nouvelle adresse.</p>
              <a
                href={`/demande/${info.newSlug}`}
                className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-medium text-on-accent"
              >
                Aller au formulaire
              </a>
            </>
          ) : (
            <p className="mt-3 text-ink-2">Il n'est plus actif. Demandez la bonne adresse à la personne qui vous l'a envoyé.</p>
          )}
        </section>
      ) : info.status === "inactive" ? (
        <section className="py-16">
          <h1 className="text-3xl">Ce lien n'est pas actif.</h1>
          <p className="mt-3 text-ink-2">Demandez la bonne adresse à la personne qui vous l'a envoyé.</p>
        </section>
      ) : sent ? (
        <section className="animate-reveal py-16">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-on-accent">
            <Check className="size-6" aria-hidden />
          </span>
          <h1 className="mt-6 text-3xl">Demande envoyée.</h1>
          <p className="mt-3 text-ink-2">{info.firstName} l'a reçue et vient d'être prévenu(e).</p>
          <button
            onClick={() => {
              setForm((f) => ({ ...f, title: "", details: "", dueDate: "", urgent: false }));
              setSent(false);
            }}
            className="mt-8 h-11 rounded-full border border-line px-5 text-sm font-medium hover:border-ink"
          >
            Faire une autre demande
          </button>
        </section>
      ) : (
        <form onSubmit={onSubmit} className="pt-8">
          <h1 className="text-3xl leading-tight sm:text-4xl">Une demande pour {info.firstName}</h1>
          <p className="mt-3 text-ink-2">{info.intro || "Décrivez votre besoin : il arrive directement dans sa liste de tâches."}</p>

          <div className="mt-8 grid gap-5">
            <Field label="Votre demande, en une ligne" required>
              <input required value={form.title} onChange={set("title")} maxLength={200} placeholder="Visuel pour la promo de décembre" className={input} />
            </Field>
            <Field label="Détails (facultatif)">
              <textarea
                value={form.details}
                onChange={set("details")}
                rows={4}
                maxLength={4000}
                placeholder="Format, textes, liens, contraintes…"
                className="w-full border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none focus:border-accent"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Pour quand (facultatif)">
                <input type="date" value={form.dueDate} onChange={set("dueDate")} className={input} />
              </Field>
              <label className="flex items-center gap-3 self-end pb-3 text-[15px] text-ink">
                <input type="checkbox" checked={form.urgent} onChange={set("urgent")} className="size-5 accent-accent" />
                C'est urgent
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Votre nom" required>
                <input required value={form.from} onChange={set("from")} maxLength={60} autoComplete="name" className={input} />
              </Field>
              <Field label="Service (facultatif)">
                <input value={form.service} onChange={set("service")} maxLength={60} placeholder="Commercial, RH…" className={input} />
              </Field>
            </div>
            <Field label="Votre WhatsApp (facultatif)" hint={phoneOk ? "Pour qu'on puisse vous répondre directement." : "Numéro non reconnu. Exemple : 77 123 45 67."}>
              <input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="77 123 45 67" className={`${input} ${phoneOk ? "" : "border-alert"}`} />
            </Field>
            {/* Champ piège, invisible pour les humains. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} className="hidden" aria-hidden />
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm font-medium text-alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !phoneOk}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-on-accent transition-opacity duration-200 ease-brand hover:opacity-90 disabled:opacity-50"
          >
            <ArrowUp className="size-4" aria-hidden /> {busy ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      )}
    </main>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block text-ink-2">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}
