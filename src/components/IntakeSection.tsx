import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Check, Share2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/errors";

/** Réglages de la boîte de dépôt : adresse, message d'accueil, activation, partage. */
export function IntakeSection() {
  const data = useQuery(api.intake.mine);
  const save = useMutation(api.intake.save);
  const [slug, setSlug] = useState("");
  const [intro, setIntro] = useState("");
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSlug(data.intake?.slug ?? data.suggestedSlug);
    setIntro(data.intake?.intro ?? "");
  }, [data]);

  if (!data) return <section className="h-40 py-6" aria-busy />;
  const intake = data.intake;
  const link = `${window.location.origin}/demande/${intake?.slug ?? slug}`;
  const shareText = `Pour me faire une demande (visuel, contenu, campagne…), passez par ce lien : ${link}`;

  async function persist(enabled: boolean) {
    setError(null);
    try {
      await save({ slug, enabled, intro });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Enregistrement impossible"));
    }
  }

  return (
    <section className="py-6">
      <h2 className="text-lg">Boîte de dépôt</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        Un lien à donner aux autres services : leurs demandes arrivent directement dans vos tâches (catégorie « Demandes »), avec une
        notification. Aucun compte nécessaire de leur côté.
      </p>

      {intake && !editing ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className={`tabular min-w-0 flex-1 truncate border border-line px-3 py-2.5 text-sm ${intake.enabled ? "text-ink" : "text-ink-3 line-through"}`}>{link}</code>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {intake.enabled && (
              <>
                <button
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white"
                >
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? "Lien copié" : "Copier le lien"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium hover:border-ink"
                >
                  <Share2 className="size-4" aria-hidden /> Partager sur WhatsApp
                </a>
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
                  Voir la page
                </a>
              </>
            )}
            <button onClick={() => setEditing(true)} className="inline-flex h-10 items-center rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
              Modifier
            </button>
            <button
              onClick={() => void persist(!intake.enabled)}
              className="inline-flex h-10 items-center rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink"
            >
              {intake.enabled ? "Désactiver" : "Réactiver"}
            </button>
          </div>
          {!intake.enabled && <p className="mt-2 text-sm font-medium text-ink">Lien désactivé : la page affiche « Ce lien n'est pas actif ».</p>}
        </div>
      ) : (
        <div className="mt-4 grid max-w-xl gap-4">
          <label className="block">
            <span className="eyebrow mb-1.5 block text-ink-2">Adresse du lien</span>
            <div className="flex items-center border border-line focus-within:border-accent">
              <span className="tabular truncate pl-3 text-sm text-ink-2">{window.location.host}/demande/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={30}
                className="h-11 min-w-0 flex-1 bg-transparent pr-3 text-sm text-ink outline-none"
              />
            </div>
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block text-ink-2">Message d'accueil (facultatif)</span>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Merci de prévoir 48 h pour un visuel, une semaine pour une vidéo."
              className="w-full border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => void persist(intake?.enabled ?? true)} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white">
              {intake ? "Enregistrer" : "Activer ma boîte de dépôt"}
            </button>
            {intake && (
              <button onClick={() => setEditing(false)} className="h-10 rounded-full px-4 text-sm text-ink-2 hover:bg-hover hover:text-ink">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
