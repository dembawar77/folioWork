import * as chrono from "chrono-node";
import { tzOffsetMinutes } from "./time";
import { firstDue, type Recurrence } from "./recurrence";

export type Priority = "urgent" | "high" | "normal" | "low";

export type ParsedTask = {
  title: string;
  dueAt?: number;
  /** true si l'utilisateur a précisé une heure (sinon 09:00 par défaut). */
  hasTime: boolean;
  workstream?: string;
  priority: Priority;
  recurrence?: Recurrence;
};

// Bornes de mot compatibles avec les accents (\b ne connaît pas « é »).
const W = (body: string) => new RegExp(`(?<![\\p{L}\\d])(?:${body})(?![\\p{L}\\d])`, "iu");
const DAYS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";

/** Repère une règle de répétition en français et la retire du texte. */
function extractRecurrence(text: string): { text: string; recurrence?: Recurrence } {
  const rules: [RegExp, (m: RegExpMatchArray) => { rule: Recurrence; keep?: string }][] = [
    [W("du lundi au vendredi|en semaine|(?:les |tous les )?jours ouvrés"), () => ({ rule: { freq: "weekdays", interval: 1 } })],
    [W(`(?:tous les|chaque)\\s+(${DAYS})s?`), (m) => ({ rule: { freq: "weekly", interval: 1 }, keep: m[1].toLowerCase() })],
    [W(`(?:un|1)\\s+(${DAYS})\\s+sur\\s+(\\d+)`), (m) => ({ rule: { freq: "weekly", interval: Number(m[2]) }, keep: m[1].toLowerCase() })],
    [W("tous les (\\d+) jours"), (m) => ({ rule: { freq: "daily", interval: Number(m[1]) } })],
    [W("toutes les (\\d+) semaines"), (m) => ({ rule: { freq: "weekly", interval: Number(m[1]) } })],
    [W("tous les (\\d+) mois"), (m) => ({ rule: { freq: "monthly", interval: Number(m[1]) } })],
    [W("tous les jours|chaque jour"), () => ({ rule: { freq: "daily", interval: 1 } })],
    [W("toutes les semaines|chaque semaine"), () => ({ rule: { freq: "weekly", interval: 1 } })],
    [W("tous les mois|chaque mois"), () => ({ rule: { freq: "monthly", interval: 1 } })],
  ];
  for (const [re, make] of rules) {
    const m = text.match(re);
    if (!m) continue;
    const { rule, keep } = make(m);
    if (!(rule.interval >= 1 && rule.interval <= 52)) continue;
    return { text: text.replace(re, keep ?? " "), recurrence: rule };
  }
  return { text };
}

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: "urgent",
  urgente: "urgent",
  u: "urgent",
  "1": "urgent",
  haute: "high",
  haut: "high",
  important: "high",
  importante: "high",
  h: "high",
  "2": "high",
  normale: "normal",
  normal: "normal",
  "3": "normal",
  basse: "low",
  bas: "low",
  b: "low",
  "4": "low",
};

const DEFAULT_HOUR = 9;
const DANGLING = /\s+(le|la|à|a|pour|avant|d'ici|pour le|avant le)\s*$/i;

/**
 * Analyse une saisie rapide en français :
 * « Relancer imprimeur demain 10h #Créa !urgent »
 */
export function parseQuickTask(input: string, opts: { now: number; timeZone: string }): ParsedTask {
  let text = ` ${input.trim()} `;
  let priority: Priority = "normal";
  let workstream: string | undefined;

  text = text.replace(/\s!([\p{L}\d]+)(?=\s)/gu, (match, word: string) => {
    const p = PRIORITY_WORDS[word.toLowerCase()];
    if (!p) return match;
    priority = p;
    return " ";
  });

  text = text.replace(/\s#([\p{L}\d_-]{1,40})(?=\s)/gu, (_m, word: string) => {
    workstream = word.replace(/[_-]/g, " ");
    workstream = workstream.charAt(0).toUpperCase() + workstream.slice(1);
    return " ";
  });

  const rec = extractRecurrence(text);
  text = rec.text.replace(/\s+/g, " ").trim();

  let dueAt: number | undefined;
  let hasTime = false;
  const offset = tzOffsetMinutes(opts.timeZone, new Date(opts.now));
  const results = chrono.fr.parse(text, { instant: new Date(opts.now), timezone: offset }, { forwardDate: true });
  const hit = results[results.length - 1];
  if (hit) {
    const comp = hit.start;
    hasTime = comp.isCertain("hour");
    dueAt = comp.date().getTime();
    // Sans heure précise, chrono place la tâche à midi : on la ramène à 09:00.
    if (!hasTime && comp.get("hour") === 12 && !comp.get("minute")) {
      dueAt -= (12 - DEFAULT_HOUR) * 3_600_000;
    }
    const before = text.slice(0, hit.index);
    const after = text.slice(hit.index + hit.text.length);
    text = `${before.replace(DANGLING, "")} ${after}`.replace(/\s+/g, " ").trim();
  }

  if (rec.recurrence && dueAt === undefined) dueAt = firstDue(rec.recurrence, opts.timeZone, opts.now);

  return { title: text || input.trim(), dueAt, hasTime, workstream, priority, recurrence: rec.recurrence };
}
