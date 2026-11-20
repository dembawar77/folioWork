import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";

type ImportTask = FunctionArgs<typeof api.restore.importTasks>["tasks"][number];
type ImportContact = { name: string; phone?: string };

export type ParsedBackup = { exportedAt: string | null; email: string | null; tasks: ImportTask[]; contacts: ImportContact[]; invalid: number };
export type RestorePlan = ParsedBackup & { missingTasks: ImportTask[]; missingContacts: ImportContact[] };

const MAX_FILE = 50 * 1024 * 1024;
const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const FREQS = ["daily", "weekdays", "weekly", "monthly"] as const;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const str = (x: unknown) => (typeof x === "string" ? x : undefined);

function recurrence(x: unknown): ImportTask["recurrence"] {
  if (!isObj(x) || !FREQS.includes(x.freq as never) || num(x.interval) === undefined) return undefined;
  return { freq: x.freq as (typeof FREQS)[number], interval: num(x.interval)!, ...(num(x.monthDay) !== undefined ? { monthDay: num(x.monthDay) } : {}) };
}

function waitingFor(x: unknown): ImportTask["waitingFor"] {
  if (!isObj(x) || !str(x.name)) return undefined;
  const need = ["since", "everyDays", "nextFollowUpAt", "nudges"].map((k) => num(x[k]));
  if (need.some((n) => n === undefined)) return undefined;
  const [since, everyDays, nextFollowUpAt, nudges] = need as number[];
  return {
    name: str(x.name)!,
    since,
    everyDays,
    nextFollowUpAt,
    nudges,
    ...(str(x.phone) ? { phone: str(x.phone) } : {}),
    ...(num(x.lastNudgeAt) !== undefined ? { lastNudgeAt: num(x.lastNudgeAt) } : {}),
  };
}

function request(x: unknown): ImportTask["request"] {
  if (!isObj(x) || !str(x.from) || num(x.receivedAt) === undefined) return undefined;
  return {
    from: str(x.from)!,
    receivedAt: num(x.receivedAt)!,
    seen: true,
    ...(str(x.service) ? { service: str(x.service) } : {}),
    ...(str(x.phone) ? { phone: str(x.phone) } : {}),
  };
}

/** Ne garde que les champs connus et bien typés (le fichier a pu être modifié à la main). */
function toImportTask(x: unknown): ImportTask | null {
  if (!isObj(x) || !str(x.id) || !str(x.title)?.trim() || typeof x.completed !== "boolean") return null;
  const note = typeof x.note === "string" ? x.note : isObj(x.note) ? JSON.stringify(x.note) : undefined;
  const t: ImportTask = {
    id: str(x.id)!,
    title: str(x.title)!,
    completed: x.completed,
    priority: PRIORITIES.includes(x.priority as never) ? (x.priority as ImportTask["priority"]) : "normal",
  };
  const opt = {
    completedAt: num(x.completedAt),
    workstream: str(x.workstream),
    dueAt: num(x.dueAt),
    remindAt: num(x.remindAt),
    recurrence: recurrence(x.recurrence),
    note,
    noteText: note ? str(x.noteText) : undefined,
    checklistTotal: note ? num(x.checklistTotal) : undefined,
    checklistDone: note ? num(x.checklistDone) : undefined,
    waitingFor: waitingFor(x.waitingFor),
    request: request(x.request),
  };
  for (const [k, val] of Object.entries(opt)) if (val !== undefined) (t as Obj)[k] = val;
  return t;
}

/** Lit et vérifie un fichier de sauvegarde FolioWork. Les messages d'erreur s'affichent tels quels. */
export async function readBackup(file: File): Promise<ParsedBackup> {
  if (file.size > MAX_FILE) throw new Error("Fichier trop volumineux (50 Mo max)");
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde FolioWork (.json illisible)");
  }
  if (!isObj(data) || data.format !== "foliowork-export" || !Array.isArray(data.tasks)) {
    throw new Error("Ce fichier n'est pas une sauvegarde FolioWork");
  }
  if (data.version !== 1) throw new Error("Sauvegarde d'une version plus récente de FolioWork : mettez l'app à jour");
  const tasks: ImportTask[] = [];
  let invalid = 0;
  for (const raw of data.tasks) {
    const t = toImportTask(raw);
    if (t) tasks.push(t);
    else invalid++;
  }
  const contacts: ImportContact[] = Array.isArray(data.contacts)
    ? data.contacts.filter((c): c is Obj => isObj(c) && !!str(c.name)?.trim()).map((c) => ({ name: str(c.name)!, ...(str(c.phone) ? { phone: str(c.phone) } : {}) }))
    : [];
  const account = isObj(data.account) ? data.account : {};
  return { exportedAt: str(data.exportedAt) ?? null, email: str(account.email) ?? null, tasks, contacts, invalid };
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Compare la sauvegarde au compte : ce qui manque sera ajouté. */
export async function planRestore(convex: ConvexReactClient, b: ParsedBackup): Promise<RestorePlan> {
  const missingIds = new Set<string>();
  const missingNames = new Set<string>();
  const taskChunks = chunks(b.tasks.map((t) => t.id), 500);
  const contactChunks = chunks(b.contacts.map((c) => c.name), 500);
  for (let i = 0; i < Math.max(taskChunks.length, contactChunks.length, 1); i++) {
    const res = await convex.query(api.restore.preview, { taskIds: taskChunks[i] ?? [], contactNames: contactChunks[i] ?? [] });
    res.missingTasks.forEach((id) => missingIds.add(id));
    res.missingContacts.forEach((n) => missingNames.add(n));
  }
  return { ...b, missingTasks: b.tasks.filter((t) => missingIds.has(t.id)), missingContacts: b.contacts.filter((c) => missingNames.has(c.name)) };
}

/** Ajoute les éléments manquants, par paquets de 25 tâches. */
export async function runRestore(convex: ConvexReactClient, plan: RestorePlan, onProgress?: (done: number) => void) {
  let tasks = 0;
  let contacts = 0;
  if (plan.missingContacts.length) contacts = (await convex.mutation(api.restore.importContacts, { contacts: plan.missingContacts })).added;
  let done = 0;
  for (const batch of chunks(plan.missingTasks, 25)) {
    tasks += (await convex.mutation(api.restore.importTasks, { tasks: batch })).added;
    done += batch.length;
    onProgress?.(done);
  }
  return { tasks, contacts };
}
