import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Send, Smartphone, Trash2, CircleAlert } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/errors";
import { currentSubscription, isIos, pushSupport, subscribePush } from "../lib/push";
import { userTimeZone } from "../lib/dates";
import { InstallButton } from "./InstallButton";
import { IntakeSection } from "./IntakeSection";

const OFFSETS = [
  { value: 0, label: "À l'heure" },
  { value: 15, label: "15 min avant" },
  { value: 60, label: "1 h avant" },
  { value: 1440, label: "1 jour avant" },
];

export function AlertsPanel() {
  return (
    <div className="divide-y divide-line">
      <PushSection />
      <SummarySection />
      <TelegramSection />
      <IntakeSection />
      <section className="py-6">
        <h2 className="text-lg">Installer l'app</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          Installée, FolioWork s'ouvre comme une vraie application et reçoit les rappels plus fiablement.
          {isIos() && " Sur iPhone, l'installation est obligatoire pour recevoir les notifications."}
        </p>
        <div className="mt-3">
          <InstallButton variant="full" />
        </div>
      </section>
    </div>
  );
}

function PushSection() {
  const vapid = useQuery(api.push.vapidPublicKey);
  const devices = useQuery(api.push.listMine);
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const sendTest = useMutation(api.push.sendTest);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const support = pushSupport();

  useEffect(() => {
    void currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);

  const thisDeviceOn = !!endpoint && !!devices?.some((d) => d.endpoint === endpoint);

  async function enable() {
    if (!vapid) return;
    setBusy(true);
    setMsg(null);
    try {
      const sub = await subscribePush(vapid);
      await subscribe(sub);
      setEndpoint(sub.endpoint);
      setMsg({ kind: "ok", text: "Notifications activées sur cet appareil." });
    } catch (err) {
      setMsg({ kind: "err", text: errorMessage(err, "Activation impossible") });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setMsg(null);
    try {
      await sendTest();
      setMsg({ kind: "ok", text: "Notification de test envoyée. Elle arrive en quelques secondes." });
    } catch (err) {
      setMsg({ kind: "err", text: errorMessage(err, "Envoi du test impossible") });
    }
  }

  return (
    <section className="py-6">
      <h2 className="text-lg">Notifications sur cet appareil</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">Chaque appareil s'active séparément : ordinateur, téléphone, tablette.</p>

      {!support.ok ? (
        <p className="mt-3 flex max-w-prose gap-2 text-sm font-medium text-ink"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {support.reason === "ios-not-installed"
            ? "Sur iPhone/iPad, installez d'abord FolioWork sur l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez l'app depuis l'icône."
            : support.reason === "denied"
              ? "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis rechargez la page."
              : "Ce navigateur ne gère pas les notifications web. Utilisez Telegram ci-dessous."}
        </p>
      ) : vapid === null ? (
        <p className="mt-3 text-sm font-medium text-ink">Notifications web non configurées sur le serveur (clés VAPID manquantes).</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!thisDeviceOn ? (
            <button onClick={enable} disabled={busy || !vapid} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-60">
              {busy ? "Activation…" : "Activer les notifications"}
            </button>
          ) : (
            <span className="inline-flex h-10 items-center gap-2 text-sm font-medium text-ink"><Check className="size-4" aria-hidden /> Activées sur cet appareil</span>
          )}
          <button onClick={test} disabled={!devices?.length} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium hover:bg-hover disabled:opacity-50">
            <Send className="size-3.5" aria-hidden /> Envoyer un test
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 text-sm ${msg.kind === "ok" ? "text-ink-2" : "font-medium text-alert"}`}>
          {msg.text}
        </p>
      )}

      <DiscreetToggle />

      {devices && devices.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {devices.map((d) => (
            <li key={d._id} className="flex items-center gap-3 py-2.5">
              <Smartphone className="size-4 text-ink-3" aria-hidden />
              <span className="flex-1">
                {d.deviceLabel}
                {d.endpoint === endpoint && <span className="text-ink-2"> · cet appareil</span>}
              </span>
              <button
                onClick={() => unsubscribe({ endpoint: d.endpoint })}
                aria-label={`Retirer ${d.deviceLabel}`}
                className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SummarySection() {
  const prefs = useQuery(api.preferences.get);
  const save = useMutation(api.preferences.save);
  const tz = userTimeZone();

  // Aligne le fuseau du compte sur celui de l'appareil au premier passage.
  useEffect(() => {
    if (prefs && prefs.timezone !== tz) void save({ timezone: tz });
  }, [prefs, tz, save]);

  if (!prefs) return <section className="h-40 py-6" aria-busy />;

  return (
    <section className="py-6">
      <h2 className="text-lg">Résumé du matin et rappels</h2>
      <div className="mt-4 grid max-w-xl gap-4 text-sm">
        <label className="flex items-center justify-between gap-4">
          <span>
            Résumé quotidien
            <span className="block text-xs text-ink-2">Les tâches du jour et celles en retard, chaque matin.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs.dailySummaryEnabled}
            onChange={(e) => save({ dailySummaryEnabled: e.target.checked })}
            className="size-5 accent-ink"
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>Heure du résumé</span>
          <input
            type="time"
            value={prefs.dailySummaryTime}
            disabled={!prefs.dailySummaryEnabled}
            onChange={(e) => e.target.value && save({ dailySummaryTime: e.target.value })}
            className="tabular h-10 border border-line px-2 disabled:opacity-50"
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            Rappel par défaut
            <span className="block text-xs text-ink-2">Appliqué aux nouvelles tâches qui ont une échéance.</span>
          </span>
          <select
            value={prefs.defaultReminderOffsetMinutes}
            onChange={(e) => save({ defaultReminderOffsetMinutes: Number(e.target.value) })}
            className="h-10 border border-line px-2"
          >
            {OFFSETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="tabular text-xs text-ink-2">Fuseau horaire : {prefs.timezone}</p>
      </div>
    </section>
  );
}

function TelegramSection() {
  const status = useQuery(api.telegram.status);
  const createCode = useMutation(api.telegram.createLinkCode);
  const unlink = useMutation(api.telegram.unlink);
  const [code, setCode] = useState<string | null>(null);

  if (!status) return <section className="h-32 py-6" aria-busy />;
  const bot = status.botUsername;

  return (
    <section className="py-6">
      <h2 className="text-lg">Telegram</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        Écrivez une tâche au bot (« Relancer imprimeur jeudi 10h ») et recevez vos rappels et le résumé du matin sur Telegram.
      </p>
      {!bot ? (
        <p className="mt-3 text-sm font-medium text-ink">Bot non configuré sur le serveur (TELEGRAM_BOT_USERNAME manquant).</p>
      ) : status.linked ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-ink"><Check className="size-4" aria-hidden /> Relié{status.username ? ` à @${status.username}` : ""}</span>
          <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
            Ouvrir @{bot}
          </a>
          <button onClick={() => unlink()} className="text-ink-2 underline underline-offset-2 hover:text-ink">
            Délier
          </button>
        </div>
      ) : code ? (
        <div className="mt-3 text-sm">
          <a
            href={`https://t.me/${bot}?start=${code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full bg-accent px-5 font-medium text-white"
          >
            Ouvrir Telegram et relier
          </a>
          <p className="mt-2 text-xs text-ink-2">
            Puis appuyez sur <b>Démarrer</b>. Ou envoyez <code className="tabular">/start {code}</code> à @{bot}. Code valable 10 minutes.
          </p>
        </div>
      ) : (
        <button onClick={async () => setCode(await createCode())} className="mt-3 h-10 rounded-full border border-line px-5 text-sm font-medium hover:bg-hover">
          Relier Telegram
        </button>
      )}
    </section>
  );
}

function DiscreetToggle() {
  const prefs = useQuery(api.preferences.get);
  const save = useMutation(api.preferences.save);
  if (!prefs) return null;
  return (
    <label className="mt-5 flex max-w-xl items-start justify-between gap-4 text-sm">
      <span>
        Notifications discrètes
        <span className="block text-xs text-ink-2">
          L'écran affiche seulement « Vous avez un rappel », sans titre ni note. Conseillé sur un ordinateur partagé ou un écran visible en réunion. Telegram reste complet.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={prefs.discreetNotifications}
        onChange={(e) => save({ discreetNotifications: e.target.checked })}
        className="mt-0.5 size-5 shrink-0 accent-accent"
      />
    </label>
  );
}
