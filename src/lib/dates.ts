import { format, isToday, isTomorrow, isYesterday, isSameYear } from "date-fns";
import { fr } from "date-fns/locale";

export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Dakar";

export function formatDueShort(ms: number): string {
  const d = new Date(ms);
  const time = format(d, "HH:mm");
  if (isToday(d)) return time;
  if (isTomorrow(d)) return `Demain ${time}`;
  if (isYesterday(d)) return `Hier ${time}`;
  return format(d, isSameYear(d, new Date()) ? "EEE d MMM HH:mm" : "d MMM yyyy HH:mm", { locale: fr });
}

export function formatDueLong(ms: number): string {
  const d = new Date(ms);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `Aujourd'hui à ${time}`;
  if (isTomorrow(d)) return `Demain à ${time}`;
  return format(d, "EEEE d MMMM 'à' HH:mm", { locale: fr });
}

/** Valeur pour <input type="datetime-local">. */
export function toLocalInput(ms: number | undefined): string {
  return ms === undefined ? "" : format(new Date(ms), "yyyy-MM-dd'T'HH:mm");
}

export function fromLocalInput(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export function endOfToday(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
