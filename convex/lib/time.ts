/** Utilitaires de fuseau horaire, sans dépendance (Intl uniquement). */

/** Décalage en minutes du fuseau `timeZone` par rapport à UTC, à l'instant `at`. */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Date locale (YYYY-MM-DD) dans le fuseau donné. */
export function localDateKey(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * Prochaine occurrence (timestamp ms) de l'heure locale "HH:mm" dans `timeZone`,
 * strictement après `now`.
 */
export function nextOccurrence(hhmm: string, timeZone: string, now: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const probe = new Date(now + dayOffset * 86_400_000);
    const [y, mo, d] = localDateKey(timeZone, probe).split("-").map(Number);
    // Heure locale voulue interprétée en UTC, puis corrigée du décalage du fuseau.
    const naive = Date.UTC(y, mo - 1, d, h, m);
    let candidate = naive - tzOffsetMinutes(timeZone, new Date(naive)) * 60_000;
    // Second passage pour les changements d'heure.
    candidate = naive - tzOffsetMinutes(timeZone, new Date(candidate)) * 60_000;
    if (candidate > now) return candidate;
  }
  throw new Error("nextOccurrence: aucune occurrence trouvée");
}

/** Début et fin (ms) de la journée locale contenant `at`. */
export function localDayBounds(timeZone: string, at: number): { start: number; end: number } {
  const start = nextOccurrence("00:00", timeZone, at - 86_400_000);
  const startOfToday = start <= at ? start : start - 86_400_000;
  const end = nextOccurrence("00:00", timeZone, startOfToday + 1);
  return { start: startOfToday, end };
}
