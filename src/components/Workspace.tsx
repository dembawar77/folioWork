import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Bell, CalendarDays, CheckCheck, Inbox, LogOut, Plus, Search, Sun, WifiOff, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { counts, filterTasks, VIEW_LABEL, workstreamsOf, type View } from "../lib/tasks";
import { QuickCapture, type QuickCaptureHandle } from "./QuickCapture";
import { TaskRow } from "./TaskRow";
import { AlertsPanel } from "./AlertsPanel";
import { InstallButton } from "./InstallButton";
import { Wordmark } from "./Wordmark";

const VIEWS: View[] = ["today", "upcoming", "all", "waiting", "done", "alerts"];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const view = p.get("view") as View | null;
  return { view: view && VIEWS.includes(view) ? view : null, task: p.get("task") };
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function Workspace() {
  const tasks = useQuery(api.tasks.list);
  const me = useQuery(api.users.me);
  const prefs = useQuery(api.preferences.get);
  const { signOut } = useAuthActions();
  const online = useOnline();
  // Rafraîchit chaque minute les états qui dépendent de l'heure (en retard, « Dans 45 min »).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const initial = useMemo(readUrl, []);
  const [view, setView] = useState<View>(initial.view ?? (initial.task ? "all" : "today"));
  const [expanded, setExpanded] = useState<string | null>(initial.task);
  const [workstream, setWorkstream] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const capture = useRef<QuickCaptureHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Garde l'URL synchronisée (liens profonds depuis les notifications).
  useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "today") p.set("view", view);
    if (expanded) p.set("task", expanded);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [view, expanded]);

  // Contenu partagé depuis une autre app (WhatsApp, Gmail…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const shared = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).join(" ").trim();
    if (shared) {
      setView("today");
      setTimeout(() => capture.current?.prefill(shared.slice(0, 380)), 50);
    }
  }, []);

  // Clic sur une notification alors que l'app est déjà ouverte.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "open-task" && typeof e.data.taskId === "string") {
        setView("all");
        setWorkstream(null);
        setExpanded(e.data.taskId);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // Raccourcis clavier : N = nouvelle tâche, / = recherche, Échap = fermer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "Escape") {
        if (typing) (target as HTMLInputElement).blur?.();
        else setExpanded(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") {
        e.preventDefault();
        goCapture();
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const goCapture = useCallback(() => {
    setView((v) => (v === "alerts" || v === "done" ? "today" : v));
    setTimeout(() => capture.current?.focus(), 0);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useMemo(() => counts(tasks ?? []), [tasks, tick]);
  const streams = useMemo(() => workstreamsOf(tasks ?? []), [tasks]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => (tasks ? filterTasks(tasks, view, { workstream, search }) : []), [tasks, view, workstream, search, tick]);
  const streamCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) if (!t.completed && t.workstream) m.set(t.workstream, (m.get(t.workstream) ?? 0) + 1);
    return m;
  }, [tasks]);

  const navCount: Partial<Record<View, number>> = { today: c.today, upcoming: c.upcoming, all: c.all, waiting: c.waiting, done: c.done };

  return (
    <div className="min-h-dvh bg-canvas">
      {/* ── Barre du haut (ordinateur) ───────────────────────── */}
      <header className="sticky top-0 z-20 hidden h-14 items-center border-b border-line bg-canvas px-6 md:flex">
        <div className="w-[216px]">
          <Wordmark />
        </div>
        <nav className="flex flex-1 items-center gap-1" aria-label="Vues">
          {(["today", "upcoming", "all", "waiting", "alerts"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-current={view === v ? "page" : undefined}
              className={`relative h-14 px-3 text-sm font-medium transition-colors duration-150 ${view === v ? "text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {VIEW_LABEL[v]}
              {view === v && <span className="absolute inset-x-3 bottom-0 h-[1.5px] bg-ink" />}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher  /"
              aria-label="Rechercher dans les tâches et les notes"
              className="h-9 w-56 border border-line bg-alabaster pr-2 pl-8 text-sm outline-none focus:border-ink focus:bg-canvas"
            />
          </label>
          <button onClick={goCapture} className="inline-flex h-9 items-center gap-1.5 bg-ink px-3 text-sm font-medium text-white hover:opacity-90">
            <Plus className="size-4" aria-hidden /> Nouvelle tâche
          </button>
        </div>
      </header>

      {/* ── En-tête (mobile) ────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex h-[52px] items-center gap-2 border-b border-line bg-canvas px-4 md:hidden">
        {searchOpen ? (
          <>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher"
              className="h-9 min-w-0 flex-1 border border-line bg-alabaster px-3 text-sm outline-none"
            />
            <button
              onClick={() => {
                setSearch("");
                setSearchOpen(false);
              }}
              aria-label="Fermer la recherche"
              className="grid size-11 place-items-center"
            >
              <X className="size-5" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1">
              <Wordmark />
            </span>
            <button onClick={() => setSearchOpen(true)} aria-label="Rechercher" className="grid size-11 place-items-center text-ink-2">
              <Search className="size-5" />
            </button>
            <Avatar image={me?.image} name={me?.name} onSignOut={signOut} />
          </>
        )}
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        {/* ── Rail gauche (ordinateur) ─────────────────────── */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-r border-line px-4 py-5 md:flex">
          <RailGroup title="Statut">
            {(["today", "upcoming", "all", "waiting", "done"] as View[]).map((v) => (
              <RailItem key={v} active={view === v} onClick={() => setView(v)} label={VIEW_LABEL[v]} count={navCount[v]} />
            ))}
          </RailGroup>
          <RailGroup title="Catégories">
            <RailItem active={workstream === null} onClick={() => setWorkstream(null)} label="Toutes" />
            {streams.map((w) => (
              <RailItem key={w} active={workstream === w} onClick={() => setWorkstream(workstream === w ? null : w)} label={w} count={streamCounts.get(w)} />
            ))}
          </RailGroup>
          <div className="mt-auto space-y-3 border-t border-line pt-4">
            <InstallButton />
            <div className="flex items-center gap-2">
              {me?.image ? <img src={me.image} alt="" className="size-7" referrerPolicy="no-referrer" /> : <span className="size-7 bg-hover" />}
              <span className="min-w-0 flex-1 truncate text-sm">{me?.name ?? ""}</span>
              <button onClick={() => void signOut()} title="Se déconnecter" aria-label="Se déconnecter" className="grid size-8 place-items-center text-ink-3 hover:bg-hover hover:text-ink">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Contenu ──────────────────────────────────────── */}
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 md:px-10 md:pt-8 md:pb-16">
          <div className="mx-auto max-w-3xl">
            <ViewHeader view={view} counts={c} workstream={workstream} />

            {/* Filtres (mobile) */}
            {view !== "alerts" && (
              <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-2 md:hidden" role="group" aria-label="Filtres">
                {(["waiting", "all", "done"] as View[]).map((v) => (
                  <Chip key={v} active={view === v} onClick={() => setView(view === v ? "today" : v)}>
                    {VIEW_LABEL[v]}
                  </Chip>
                ))}
                <span className="mx-1 w-px shrink-0 bg-line" aria-hidden />
                {streams.map((w) => (
                  <Chip key={w} active={workstream === w} onClick={() => setWorkstream(workstream === w ? null : w)}>
                    {w}
                  </Chip>
                ))}
              </div>
            )}

            {view === "alerts" ? (
              <AlertsPanel />
            ) : (
              <>
                {view !== "done" && <QuickCapture ref={capture} defaultWorkstream={workstream} onCreated={(id) => view === "upcoming" && setExpanded(id)} />}
                {tasks === undefined ? (
                  <Skeleton />
                ) : visible.length === 0 ? (
                  <Empty view={view} searching={!!search} onCreate={goCapture} />
                ) : (
                  <div>
                    {visible.map((t, i) => (
                      <div key={t._id}>
                        {view === "waiting" && t.waitingFor && t.waitingFor.name !== visible[i - 1]?.waitingFor?.name && (
                          <p className={`eyebrow mb-1 flex gap-2 text-ink ${i === 0 ? "mt-2" : "mt-8"}`}>
                            {t.waitingFor.name}
                            <span className="text-ink-2">{visible.filter((x) => x.waitingFor?.name === t.waitingFor!.name).length}</span>
                          </p>
                        )}
                        <TaskRow
                          task={t}
                          expanded={expanded === t._id}
                          onToggleExpand={() => setExpanded(expanded === t._id ? null : t._id)}
                          workstreams={streams}
                          defaultOffset={prefs?.defaultReminderOffsetMinutes ?? 0}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Navigation basse (mobile) ───────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navigation"
      >
        <TabButton active={view === "today"} onClick={() => setView("today")} icon={Sun} label="Aujourd'hui" badge={c.overdue || undefined} />
        <TabButton active={view === "upcoming"} onClick={() => setView("upcoming")} icon={CalendarDays} label="À venir" />
        <TabButton active={view === "alerts"} onClick={() => setView("alerts")} icon={Bell} label="Alertes" />
        <TabButton active={false} onClick={goCapture} icon={Plus} label="Ajouter" accent />
      </nav>

      {!online && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-fit items-center gap-2 bg-ink px-3 py-2 text-xs text-white md:bottom-6">
          <WifiOff className="size-3.5" aria-hidden /> Hors ligne : les modifications seront envoyées à la reconnexion.
        </div>
      )}
    </div>
  );
}

function ViewHeader({ view, counts: c, workstream }: { view: View; counts: ReturnType<typeof counts>; workstream: string | null }) {
  const today = format(new Date(), "EEEE d MMMM", { locale: fr });
  const sub =
    view === "today"
      ? `${c.today} tâche${c.today > 1 ? "s" : ""}`
      : view === "upcoming"
        ? `${c.upcoming} planifiée${c.upcoming > 1 ? "s" : ""}`
        : view === "all"
          ? `${c.all} ouverte${c.all > 1 ? "s" : ""}`
          : view === "waiting"
            ? `${c.waiting} en attente`
          : view === "done"
            ? `${c.done} terminée${c.done > 1 ? "s" : ""}`
            : "Rappels, résumé du matin, Telegram";
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b-[1.5px] border-ink pb-3">
      <div>
        <p className="eyebrow mb-2 text-ink-2">{view === "today" ? today : workstream ?? "FolioWork"}</p>
        <h1 className="text-2xl md:text-[34px] md:leading-[1.12]">{VIEW_LABEL[view]}</h1>
      </div>
      <p className="tabular pb-1 text-[13px] text-ink-2">
        {sub}
        {view === "today" && c.overdue > 0 && <span className="font-medium text-alert"> · {c.overdue} en retard</span>}
        {view === "waiting" && c.toNudge > 0 && <span className="font-medium text-soon"> · {c.toNudge} à relancer</span>}
      </p>
    </div>
  );
}

function Empty({ view, searching, onCreate }: { view: View; searching: boolean; onCreate: () => void }) {
  const Icon = view === "done" ? CheckCheck : view === "upcoming" ? CalendarDays : Inbox;
  const text = searching
    ? "Aucun résultat dans les titres ni dans les notes."
    : view === "today"
      ? "Rien de prévu aujourd'hui."
      : view === "upcoming"
        ? "Aucune tâche planifiée pour les prochains jours."
        : view === "waiting"
          ? "Personne ne vous doit de retour. Ajoutez @Nom à une tâche pour suivre une relance."
        : view === "done"
          ? "Les tâches terminées apparaîtront ici."
          : "Aucune tâche ouverte.";
  return (
    <div className="py-16 text-center">
      <Icon className="mx-auto size-6 text-ink-3" aria-hidden />
      <p className="mt-3 text-sm text-ink-2">{text}</p>
      {!searching && view !== "done" && (
        <button onClick={onCreate} className="mt-4 text-sm font-medium text-accent underline underline-offset-4">
          Ajouter une tâche
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy aria-label="Chargement">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 border-b border-line">
          <span className="size-5 bg-hover" />
          <span className="h-3 bg-hover" style={{ width: `${40 + ((i * 17) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

function RailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="eyebrow mb-3 px-2 text-ink-2">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

function RailItem({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex h-8 w-full items-center px-2 text-left text-sm transition-colors duration-150 ${active ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"}`}
      >
        <span className="flex-1 truncate">{label}</span>
        {count ? <span className="tabular text-xs text-ink-2">{count}</span> : null}
      </button>
    </li>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 shrink-0 border px-3 text-[13px] whitespace-nowrap ${active ? "border-ink bg-ink text-white" : "border-line text-ink-2"}`}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sun;
  label: string;
  badge?: number;
  accent?: boolean;
}) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${accent || active ? "text-ink" : "text-ink-2"}`}>
      {accent ? (
        <span className="grid size-7 place-items-center bg-ink text-white">
          <Icon className="size-4" aria-hidden />
        </span>
      ) : (
        <Icon className="size-5" aria-hidden />
      )}
      {label}
      {badge ? (
        <span className="tabular absolute top-2 left-1/2 ml-3 text-[11px] font-medium text-alert" aria-label={`${badge} en retard`}>{badge}</span>
      ) : null}
    </button>
  );
}

function Avatar({ image, name, onSignOut }: { image?: string; name?: string; onSignOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Compte" aria-expanded={open} className="grid size-11 place-items-center">
        {image ? <img src={image} alt="" className="size-7" referrerPolicy="no-referrer" /> : <span className="size-7 bg-hover" />}
      </button>
      {open && (
        <div className="absolute top-12 right-0 w-52 border border-line bg-canvas p-1">
          <p className="truncate px-3 py-2 text-sm text-ink-2">{name}</p>
          <button onClick={() => void onSignOut()} className="flex h-10 w-full items-center gap-2 px-3 text-sm hover:bg-hover">
            <LogOut className="size-4" aria-hidden /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
