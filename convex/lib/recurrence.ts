/** Tâches récurrentes : règles et calcul de la prochaine échéance, dans le fuseau de l'utilisateur. */
import { tzOffsetMinutes } from "./time";

export type Freq = "daily" | "weekdays" | "weekly" | "monthly";
export type Recurrence = { freq: Freq; interval: number; monthDay?: number };

type Local = { y: number; m: number; d: number; h: number; min: number };

function toLocal(ms: number, timeZone: string): Local {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** Heure locale → instant UTC (gère les changements d'heure par un second passage). */
function fromLocal(l: Local, timeZone: string): number {
  const naive = Date.UTC(l.y, l.m - 1, l.d, l.h, l.min);
  let ms = naive - tzOffsetMinutes(timeZone, new Date(naive)) * 60_000;
  ms = naive - tzOffsetMinutes(timeZone, new Date(ms)) * 60_000;
  return ms;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 0 = dimanche … 6 = samedi, pour une date civile. */
const weekday = (l: Local) => new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay();

function addDays(l: Local, n: number): Local {
  const t = new Date(Date.UTC(l.y, l.m - 1, l.d + n));
  return { ...l, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Occurrence suivante d'une échéance, une seule étape. */
export function step(dueAt: number, rule: Recurrence, timeZone: string): number {
  const l = toLocal(dueAt, timeZone);
  const n = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case "daily":
      return fromLocal(addDays(l, n), timeZone);
    case "weekly":
      return fromLocal(addDays(l, 7 * n), timeZone);
    case "weekdays": {
      let next = addDays(l, 1);
      while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
      return fromLocal(next, timeZone);
    }
    case "monthly": {
      const anchor = rule.monthDay ?? l.d;
      const total = l.y * 12 + (l.m - 1) + n;
      const y = Math.floor(total / 12);
      const m = (total % 12) + 1;
      return fromLocal({ ...l, y, m, d: Math.min(anchor, daysInMonth(y, m)) }, timeZone);
    }
  }
}

/**
 * Prochaine échéance après avoir terminé une occurrence : au moins une étape après
 * l'échéance courante, et dans le futur (une tâche terminée en retard ne crée pas une
 * nouvelle occurrence déjà en retard).
 */
export function nextDue(dueAt: number, rule: Recurrence, timeZone: string, now: number): number {
  let next = step(dueAt, rule, timeZone);
  for (let i = 0; next <= now && i < 1000; i++) next = step(next, rule, timeZone);
  return next;
}

/** Première échéance quand on crée une tâche récurrente sans date : aujourd'hui 09:00 ou la suivante. */
export function firstDue(rule: Recurrence, timeZone: string, now: number): number {
  const today = toLocal(now, timeZone);
  let due = fromLocal({ ...today, h: 9, min: 0 }, timeZone);
  if (rule.freq === "weekdays") {
    let l = toLocal(due, timeZone);
    while (weekday(l) === 0 || weekday(l) === 6) l = addDays(l, 1);
    due = fromLocal(l, timeZone);
  }
  return due > now ? due : nextDue(due, rule, timeZone, now);
}

export function withAnchor(rule: Recurrence, dueAt: number, timeZone: string): Recurrence {
  return rule.freq === "monthly" ? { ...rule, monthDay: toLocal(dueAt, timeZone).d } : { freq: rule.freq, interval: rule.interval };
}

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Libellé court pour la liste : « Chaque jour », « Lun–ven », « Chaque lundi », « Chaque mois »… */
export function recurrenceLabel(rule: Recurrence, dueAt: number | undefined, timeZone: string): string {
  const n = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case "daily":
      return n === 1 ? "Chaque jour" : `Tous les ${n} jours`;
    case "weekdays":
      return "Lun–ven";
    case "weekly": {
      const day = dueAt !== undefined ? DAY_NAMES[weekday(toLocal(dueAt, timeZone))] : null;
      if (n === 1) return day ? `Chaque ${day}` : "Chaque semaine";
      return day ? `Un ${day} sur ${n}` : `Toutes les ${n} semaines`;
    }
    case "monthly":
      return n === 1 ? "Chaque mois" : `Tous les ${n} mois`;
  }
}

/** Instant à `hh:mm` heure locale, `days` jours civils après `now` (0 = aujourd'hui). */
export function dayAt(now: number, days: number, hhmm: string, timeZone: string): number {
  const [h, min] = hhmm.split(":").map(Number);
  return fromLocal({ ...addDays(toLocal(now, timeZone), days), h, min }, timeZone);
}
