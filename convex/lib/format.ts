export const PRIORITY_LABEL = { urgent: "Urgent", high: "Haute", normal: "Normale", low: "Basse" } as const;

export function formatDue(ms: number, timeZone: string, now = Date.now()): string {
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(ms);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(ms);
  const key = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(t);
  const label =
    key(ms) === key(now) ? "aujourd'hui" : key(ms) === key(now + 86_400_000) ? "demain" : key(ms) === key(now - 86_400_000) ? "hier" : day;
  return `${label} à ${time}`;
}

export function formatTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(ms);
}

/** Échappe le texte pour le mode HTML de Telegram. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
