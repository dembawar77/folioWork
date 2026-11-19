/**
 * Hors connexion.
 *
 * - Lecture : les dernières données reçues (tâches et notes, profil, préférences, contacts)
 *   sont gardées sur l'appareil (IndexedDB) et affichées dès l'ouverture, même sans réseau.
 * - Écriture : chaque modification de tâche passe par une file d'attente enregistrée sur
 *   l'appareil (localStorage, écrit immédiatement). Elle est appliquée tout de suite à
 *   l'écran, puis envoyée au serveur dans l'ordre dès que la connexion le permet.
 *   Fermer l'app avant l'envoi ne perd rien : la file repart à la prochaine ouverture.
 * - Toutes les opérations sont rejouables sans effet de bord (création avec identifiant
 *   choisi par l'appareil, « terminer » avec un état explicite, suppression tolérante).
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dayAt, firstDue, localTime, withAnchor } from "../../convex/lib/recurrence";
import { errorMessage } from "./errors";
import { userTimeZone } from "./dates";
import type { Priority, Recurrence, Task } from "./tasks";

// ─── Types ──────────────────────────────────────────────────────────────────

type CreateArgs = {
  title: string;
  priority?: Priority;
  workstream?: string;
  dueAt?: number;
  remindAt?: number | null;
  recurrence?: { freq: Recurrence["freq"]; interval: number };
  waitingFor?: string;
};
type UpdateArgs = {
  title?: string;
  priority?: Priority;
  workstream?: string | null;
  dueAt?: number | null;
  remindAt?: number | null;
  recurrence?: { freq: Recurrence["freq"]; interval: number } | null;
};
type NoteArgs = { note: string; noteText: string; checklistTotal: number; checklistDone: number };

type Op =
  | { opId: string; owner?: string; at: number; kind: "create"; id: string; args: CreateArgs }
  | { opId: string; owner?: string; at: number; kind: "setDone"; id: string; completed: boolean }
  | { opId: string; owner?: string; at: number; kind: "update"; id: string; args: UpdateArgs }
  | { opId: string; owner?: string; at: number; kind: "saveNote"; id: string; args: NoteArgs }
  | { opId: string; owner?: string; at: number; kind: "postpone"; id: string; days: number; dueAt: number; remindAt: number | undefined }
  | { opId: string; owner?: string; at: number; kind: "remove"; id: string }
  | { opId: string; owner?: string; at: number; kind: "markSeen"; id: string };

type CacheKey = "tasks" | "me" | "prefs" | "contacts";

// ─── État ───────────────────────────────────────────────────────────────────

const OUTBOX_KEY = "fw-outbox:v1";
const DB_NAME = "foliowork";
const CACHE_ID = "cache:v1";

let cache: Partial<Record<CacheKey, unknown>> = {};
let outbox: Op[] = loadOutbox();
let version = 0;
const listeners = new Set<() => void>();
/** Identifiant provisoire (créé sur l'appareil) → identifiant du serveur, une fois envoyé. */
const idMap = new Map<string, string>();
const aliasOf = new Map<string, string>();

let client: ConvexReactClient | null = null;
let liveUser: string | null = null;
let connected = false;
let flushing = false;
let inFlight: string | null = null;
const errorListeners = new Set<(message: string) => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function loadOutbox(): Op[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}
function saveOutbox() {
  try {
    if (outbox.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* stockage plein ou bloqué : la file reste en mémoire */
  }
}

// ─── IndexedDB (cache des lectures) ─────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("kv").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("kv", "readwrite");
    if (value === undefined) tx.objectStore("kv").delete(key);
    else tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Charge le cache avant le premier affichage (abandonne au bout de 1,5 s : on démarre sans). */
export async function loadOffline(): Promise<void> {
  try {
    const stored = await Promise.race([
      idbGet<typeof cache>(CACHE_ID),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500)),
    ]);
    if (stored && typeof stored === "object") cache = stored;
  } catch {
    /* navigation privée, IndexedDB indisponible : pas de cache */
  }
}

let saveTimer: number | undefined;
function saveCacheSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void idbSet(CACHE_ID, cache).catch(() => undefined), 400);
}

function setCache(key: CacheKey, value: unknown) {
  if (cache[key] === value) return;
  cache = { ...cache, [key]: value };
  saveCacheSoon();
  emit();
}

/** Des données de ce compte sont-elles déjà sur l'appareil ? */
export const hasCachedData = () => cache.tasks !== undefined && cache.me != null;

/** Déconnexion : rien ne doit rester sur l'appareil. */
export async function clearOffline() {
  cache = {};
  outbox = [];
  idMap.clear();
  aliasOf.clear();
  saveOutbox();
  window.clearTimeout(saveTimer);
  emit();
  await idbSet(CACHE_ID, undefined).catch(() => undefined);
}

export const pendingCount = () => outbox.length;

// ─── Lecture : requête en direct, sinon dernière valeur connue ───────────────

const QUERIES = {
  tasks: api.tasks.list,
  me: api.users.me,
  prefs: api.preferences.get,
  contacts: api.tasks.contacts,
} as const;
type Q = typeof QUERIES;

/** Valeur en direct du serveur ; à défaut (hors ligne, au démarrage), la dernière connue. */
export function useCachedQuery<K extends Exclude<CacheKey, "tasks">>(key: K): FunctionReturnType<Q[K]> | undefined {
  const live = useQuery(QUERIES[key] as FunctionReference<"query">, {}) as FunctionReturnType<Q[K]> | undefined;
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (live === undefined) return;
    if (key === "me") onLiveUser(live as FunctionReturnType<Q["me"]>);
    setCache(key, live);
  }, [key, live]);
  return live ?? (cache[key] as FunctionReturnType<Q[K]> | undefined);
}

/** Tâches affichées : données du serveur (ou du cache) + modifications pas encore envoyées. */
export function useTasks(): Task[] | undefined {
  const live = useQuery(api.tasks.list);
  const v = useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (live !== undefined) setCache("tasks", live);
  }, [live]);
  return useMemo(() => {
    const base = live ?? (cache.tasks as Task[] | undefined);
    if (base === undefined) return outbox.length ? applyOps([], outbox) : undefined;
    return outbox.length ? applyOps(base, outbox) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v]);
}

/** Nombre de modifications en attente d'envoi (se met à jour). */
export function usePending(): number {
  useSyncExternalStore(subscribe, () => version);
  return outbox.length;
}

/** Clé d'affichage stable : une tâche créée sur l'appareil garde la même clé une fois envoyée. */
export const keyOf = (id: string) => aliasOf.get(id) ?? id;
/** Identifiant du serveur si la tâche provisoire a été envoyée entre-temps. */
export const resolveId = (id: string) => idMap.get(id) ?? id;
export const isLocalId = (id: string) => id.startsWith("local-") && !idMap.has(id);

function onLiveUser(me: FunctionReturnType<Q["me"]>) {
  const id = me?._id ?? null;
  const cachedOwner = (cache.me as { _id?: string } | null | undefined)?._id;
  // Autre compte sur cet appareil : on oublie les données et la file de l'ancien.
  if (id && cachedOwner && cachedOwner !== id) {
    cache = {};
    outbox = outbox.filter((o) => !o.owner || o.owner === id);
    saveOutbox();
    emit();
  }
  liveUser = id;
  void flush();
}

// ─── Application locale des modifications en attente ────────────────────────

function applyOps(server: Task[], ops: Op[]): Task[] {
  const byClient = new Map<string, string>();
  for (const t of server) if (t.clientId) byClient.set(t.clientId, t._id);
  const idOf = (id: string) => idMap.get(id) ?? byClient.get(id) ?? id;

  let list = server.slice();
  const patch = (id: string, f: (t: Task) => Task) => {
    const target = idOf(id);
    list = list.map((t) => (t._id === target ? f(t) : t));
  };
  for (const op of ops) {
    switch (op.kind) {
      case "create": {
        if (idOf(op.id) !== op.id) break; // déjà arrivée au serveur
        list.push(localTask(op.id, op.args, op.at));
        break;
      }
      case "setDone":
        patch(op.id, (t) => ({ ...t, completed: op.completed, completedAt: op.completed ? (t.completedAt ?? op.at) : undefined }));
        break;
      case "update":
        patch(op.id, (t) => {
          const a = op.args;
          const n = { ...t };
          if (a.title !== undefined) n.title = a.title.trim() || t.title;
          if (a.priority !== undefined) n.priority = a.priority;
          if (a.workstream !== undefined) n.workstream = a.workstream?.trim() || undefined;
          if (a.dueAt !== undefined) n.dueAt = a.dueAt ?? undefined;
          if (a.remindAt !== undefined) n.remindAt = a.remindAt ?? undefined;
          if (a.recurrence !== undefined) n.recurrence = (a.recurrence ?? undefined) as Task["recurrence"];
          else if (a.dueAt === null) n.recurrence = undefined;
          return n;
        });
        break;
      case "saveNote":
        patch(op.id, (t) => ({ ...t, ...op.args }));
        break;
      case "postpone":
        patch(op.id, (t) => ({ ...t, dueAt: op.dueAt, remindAt: op.remindAt }));
        break;
      case "remove": {
        const target = idOf(op.id);
        list = list.filter((t) => t._id !== target);
        break;
      }
      case "markSeen":
        patch(op.id, (t) => (t.request ? { ...t, request: { ...t.request, seen: true } } : t));
        break;
    }
  }
  return list;
}

function prefs() {
  const p = cache.prefs as { timezone?: string; defaultReminderOffsetMinutes?: number } | undefined;
  return { tz: p?.timezone ?? userTimeZone(), offset: p?.defaultReminderOffsetMinutes ?? 0 };
}

function localTask(id: string, a: CreateArgs, at: number): Task {
  const { tz, offset } = prefs();
  let dueAt = a.dueAt;
  let recurrence: Task["recurrence"];
  if (a.recurrence) {
    dueAt ??= firstDue(a.recurrence as Recurrence, tz, at);
    recurrence = withAnchor(a.recurrence as Recurrence, dueAt, tz) as Task["recurrence"];
  }
  const remindAt = a.remindAt === undefined ? (dueAt !== undefined ? dueAt - offset * 60_000 : undefined) : (a.remindAt ?? undefined);
  const owner = (cache.me as { _id?: string } | null | undefined)?._id ?? "";
  return {
    _id: id as Id<"tasks">,
    _creationTime: at,
    userId: owner as Id<"users">,
    title: a.title.trim(),
    completed: false,
    priority: a.priority ?? "normal",
    workstream: a.workstream?.trim() || undefined,
    dueAt,
    remindAt,
    recurrence,
    clientId: id,
    updatedAt: at,
    waitingFor: a.waitingFor
      ? { name: a.waitingFor.trim(), since: at, everyDays: 2, nextFollowUpAt: dayAt(at, 2, "09:00", tz), nudges: 0 }
      : undefined,
  } as Task;
}

// ─── Opérations ─────────────────────────────────────────────────────────────

const newId = () => `local-${crypto.randomUUID()}`;

function enqueue(op: Op) {
  op.owner ??= liveUser ?? (cache.me as { _id?: string } | null | undefined)?._id;
  outbox = [...outbox, op];
  saveOutbox();
  emit();
  void flush();
}

const base = () => ({ opId: crypto.randomUUID(), at: Date.now() });

export const ops = {
  /** Crée la tâche (identifiant provisoire tant qu'elle n'est pas arrivée au serveur). */
  create(args: CreateArgs): string {
    const id = newId();
    enqueue({ ...base(), kind: "create", id, args });
    return id;
  },
  setDone(id: string, completed: boolean) {
    enqueue({ ...base(), kind: "setDone", id, completed });
  },
  update(id: string, args: UpdateArgs) {
    enqueue({ ...base(), kind: "update", id, args });
  },
  saveNote(id: string, args: NoteArgs) {
    // Seule la dernière version d'une note compte : les précédentes non envoyées sont retirées.
    outbox = outbox.filter((o) => !(o.kind === "saveNote" && o.id === id && o.opId !== inFlight));
    enqueue({ ...base(), kind: "saveNote", id, args });
  },
  /** Reporte de `days` jours à la même heure. Renvoie l'état précédent pour « Annuler ». */
  postpone(task: Task, days: number): { dueAt: number | null; remindAt: number | null } {
    const { tz, offset } = prefs();
    const time = task.dueAt !== undefined ? localTime(task.dueAt, tz) : "09:00";
    const dueAt = dayAt(Date.now(), days, time, tz);
    const remindAt =
      task.dueAt === undefined ? dueAt - offset * 60_000 : task.remindAt !== undefined ? dueAt - (task.dueAt - task.remindAt) : undefined;
    enqueue({ ...base(), kind: "postpone", id: task._id, days, dueAt, remindAt });
    return { dueAt: task.dueAt ?? null, remindAt: task.remindAt ?? null };
  },
  remove(id: string) {
    enqueue({ ...base(), kind: "remove", id });
  },
  markSeen(id: string) {
    enqueue({ ...base(), kind: "markSeen", id });
  },
};

/** Erreurs du serveur sur une modification déjà affichée (ex. tâche supprimée ailleurs). */
export function onSyncError(l: (message: string) => void) {
  errorListeners.add(l);
  return () => {
    errorListeners.delete(l);
  };
}

// ─── Envoi ──────────────────────────────────────────────────────────────────

export function startSync(convex: ConvexReactClient) {
  client = convex;
  const update = () => {
    const s = convex.connectionState();
    const was = connected;
    connected = s.isWebSocketConnected;
    if (connected !== was) emit();
    if (connected) void flush();
  };
  convex.subscribeToConnectionState(update);
  update();
  window.addEventListener("online", () => void flush());
}

/** Connexion au serveur établie (sert au bandeau « hors ligne »). */
export function useConnected(): boolean {
  return useSyncExternalStore(subscribe, () => connected);
}

const real = (id: string) => idMap.get(id) ?? id;

async function send(op: Op): Promise<unknown> {
  const c = client!;
  const id = real(op.id) as Id<"tasks">;
  switch (op.kind) {
    case "create":
      return c.mutation(api.tasks.create, { ...op.args, clientId: op.id });
    case "setDone":
      return c.mutation(api.tasks.setDone, { id, completed: op.completed });
    case "update":
      return c.mutation(api.tasks.update, { id, ...op.args });
    case "saveNote":
      return c.mutation(api.tasks.saveNote, { id, ...op.args });
    case "postpone":
      return c.mutation(api.tasks.postpone, { id, days: op.days });
    case "remove":
      return c.mutation(api.tasks.remove, { id });
    case "markSeen":
      return c.mutation(api.tasks.markSeen, { id });
  }
}

/** Le serveur n'a pas encore reconnu la session : on réessaiera, rien n'est perdu. */
const isAuthError = (e: unknown) => /Non connecté|Unauthenticated|not authenticated/i.test(errorMessage(e, ""));

async function flush() {
  if (flushing || !client || !connected || !liveUser) return;
  flushing = true;
  try {
    while (outbox.length && connected && liveUser) {
      const op = outbox[0];
      if (op.owner && op.owner !== liveUser) {
        outbox = outbox.slice(1);
        saveOutbox();
        continue;
      }
      // Une modification d'une tâche provisoire dont la création a échoué n'a plus d'objet.
      if (op.kind !== "create" && op.id.startsWith("local-") && !idMap.has(op.id)) {
        outbox = outbox.filter((o) => o !== op);
        saveOutbox();
        emit();
        continue;
      }
      inFlight = op.opId;
      try {
        const result = await send(op);
        if (op.kind === "create" && typeof result === "string") {
          idMap.set(op.id, result);
          aliasOf.set(result, op.id);
          // Les modifications suivantes visent désormais l'identifiant du serveur.
          outbox = outbox.map((o) => (o.id === op.id && o !== op ? { ...o, id: result } : o));
        }
      } catch (e) {
        if (isAuthError(e)) break;
        const what = op.kind === "create" ? `« ${op.args.title} » n'a pas pu être ajoutée` : "Une modification n'a pas pu être enregistrée";
        errorListeners.forEach((l) => l(`${what} : ${errorMessage(e, "erreur du serveur")}`));
        console.warn("[FolioWork] modification refusée", op.kind, e);
      } finally {
        inFlight = null;
      }
      outbox = outbox.filter((o) => o.opId !== op.opId);
      saveOutbox();
      emit();
    }
  } finally {
    flushing = false;
  }
}
