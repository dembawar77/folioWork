import * as chrono from "chrono-node";
import { tzOffsetMinutes } from "./time";

export type Priority = "urgent" | "high" | "normal" | "low";

export type ParsedTask = {
  title: string;
  dueAt?: number;
  /** true si l'utilisateur a précisé une heure (sinon 09:00 par défaut). */
  hasTime: boolean;
  workstream?: string;
  priority: Priority;
};

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

  text = text.replace(/\s+/g, " ").trim();

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

  return { title: text || input.trim(), dueAt, hasTime, workstream, priority };
}
