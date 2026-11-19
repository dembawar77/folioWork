import { useEffect, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Check, Send, Smartphone, Trash2, CircleAlert, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/errors";
import { currentSubscription, isIos, pushSupport, subscribePush } from "../lib/push";
import { userTimeZone } from "../lib/dates";
import { InstallButton } from "./InstallButton";
import { IntakeSection } from "./IntakeSection";
import { backupName, collectBackup, saveFile, toCsv, toJson, type Backup } from "../lib/backup";
import { useConnected } from "../lib/offline";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";

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
      <AppearanceSection />
      <BackupSection />
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
            <button onClick={enable} disabled={busy || !vapid} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-60">
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
            className="inline-flex h-10 items-center rounded-full bg-accent px-5 font-medium text-on-accent"
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

const LAST_EXPORT = "fw-last-export";

function BackupSection() {
  const convex = useConvex();
  const connected = useConnected();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy"; n: number } | { kind: "ready"; data: Backup } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const [last, setLast] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_EXPORT);
    } catch {
      return null;
    }
  });

  async function prepare() {
    setState({ kind: "busy", n: 0 });
    try {
      const data = await collectBackup(convex, (n) => setState({ kind: "busy", n }));
      setState({ kind: "ready", data });
    } catch (err) {
      setState({ kind: "error", message: errorMessage(err, "Export impossible, réessayez") });
    }
  }

  async function save(kind: "json" | "csv", data: Backup) {
    await saveFile(kind === "json" ? toJson(data) : toCsv(data), backupName(kind));
    const when = new Date().toISOString();
    setLast(when);
    try {
      localStorage.setItem(LAST_EXPORT, when);
    } catch {
      /* rien */
    }
  }

  const lastLabel = last ? new Date(last).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <section className="py-6">
      <h2 className="text-lg">Mes données</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        Une copie de tout votre compte sur votre appareil : tâches ouvertes et terminées, notes, contacts, réglages.
        À faire de temps en temps et à garder dans Drive ou par e-mail.
      </p>
      {lastLabel && <p className="mt-1 text-xs text-ink-3">Dernier export sur cet appareil : {lastLabel}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state.kind !== "ready" ? (
          <button
            onClick={() => void prepare()}
            disabled={state.kind === "busy" || !connected}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-on-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
          >
            <Download className="size-4" aria-hidden />
            {state.kind === "busy" ? `Préparation… ${state.n || ""}` : "Exporter mes données"}
          </button>
        ) : (
          <>
            <p className="w-full text-sm" aria-live="polite">
              <Check className="mr-1 inline size-4 text-accent" aria-hidden />
              Prêt : {state.data.tasks.length} tâche{state.data.tasks.length > 1 ? "s" : ""}, {state.data.contacts.length} contact
              {state.data.contacts.length > 1 ? "s" : ""}.
            </p>
            <button
              onClick={() => void save("json", state.data)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-opacity duration-200 hover:opacity-90"
            >
              <FileJson className="size-4" aria-hidden /> Sauvegarde complète
            </button>
            <button
              onClick={() => void save("csv", state.data)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium hover:border-ink"
            >
              <FileSpreadsheet className="size-4" aria-hidden /> Tableau Excel
            </button>
          </>
        )}
      </div>
      {state.kind === "ready" && (
        <p className="mt-2 max-w-prose text-xs text-ink-3">
          La sauvegarde complète (.json) contient tout, notes mises en forme comprises. Le tableau (.csv) s'ouvre dans Excel ou Google Sheets.
        </p>
      )}
      {!connected && state.kind !== "ready" && <p className="mt-2 text-xs text-ink-2">Disponible avec le réseau.</p>}
      {state.kind === "error" && (
        <p role="alert" className="mt-2 text-sm font-medium text-alert">
          {state.message}
        </p>
      )}
      <AutoBackup connected={connected} />
    </section>
  );
}

const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function AutoBackup({ connected }: { connected: boolean }) {
  const status = useQuery(api.backup.autoStatus);
  const setWeekly = useMutation(api.backup.setWeekly);
  const sendNow = useMutation(api.backup.sendNow);
  const [error, setError] = useState<string | null>(null);

  if (!status) return <div className="mt-6 h-24" aria-busy />;
  const { enabled, telegramLinked, pending, lastAt, lastError, nextAt } = status;

  async function run<T>(fn: () => Promise<T>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, "Action impossible, réessayez"));
    }
  }

  return (
    <div className="mt-6 max-w-xl border-t border-line-soft pt-5 text-sm">
      <label className="flex items-start justify-between gap-4">
        <span>
          Sauvegarde automatique sur Telegram
          <span className="block text-xs text-ink-2">
            Chaque dimanche à 20h, le bot vous envoie la sauvegarde complète. Les fichiers restent dans votre conversation : une copie par semaine, hors de FolioWork.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={!connected || (!telegramLinked && !enabled)}
          onChange={(e) => void run(() => setWeekly({ enabled: e.target.checked }))}
          className="mt-0.5 size-5 shrink-0 accent-accent disabled:opacity-40"
        />
      </label>

      <div className="mt-3 space-y-1 text-xs" aria-live="polite">
        {!telegramLinked ? (
          <p className="text-ink-2">Reliez d'abord Telegram (section Telegram plus haut).</p>
        ) : pending ? (
          <p className="text-ink">Envoi en cours…</p>
        ) : (
          <>
            {lastError && <p className="font-medium text-alert">Dernier envoi échoué : {lastError}</p>}
            {lastAt && (
              <p className="text-ink-2">
                <Check className="mr-1 inline size-3.5 text-accent" aria-hidden />
                Dernière sauvegarde : {fmtWhen(lastAt)}
              </p>
            )}
            {enabled && nextAt && <p className="text-ink-3">Prochaine : {fmtWhen(nextAt)}</p>}
          </>
        )}
      </div>

      {telegramLinked && (
        <button
          onClick={() => void run(() => sendNow())}
          disabled={pending || !connected}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-line px-5 font-medium hover:border-ink disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden /> Envoyer maintenant sur Telegram
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 font-medium text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

function AppearanceSection() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const options: { value: ThemePref; label: string }[] = [
    { value: "system", label: "Automatique" },
    { value: "light", label: "Clair" },
    { value: "dark", label: "Sombre" },
  ];
  return (
    <section className="py-6">
      <h2 className="text-lg">Apparence</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        Automatique suit le réglage de votre téléphone ou de votre ordinateur (sombre le soir s'il est programmé). Réglage propre à cet appareil.
      </p>
      <div className="mt-3 inline-flex rounded-full border border-line p-1" role="radiogroup" aria-label="Apparence">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={pref === o.value}
            onClick={() => {
              setPref(o.value);
              setThemePref(o.value);
            }}
            className={`h-8 rounded-full px-4 text-sm transition-colors duration-150 ${pref === o.value ? "bg-accent font-medium text-on-accent" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
