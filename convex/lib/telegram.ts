/** Client minimal de l'API Bot Telegram (fetch uniquement, fonctionne dans tous les runtimes Convex). */

export type InlineButton = { text: string; callback_data?: string; url?: string };

export async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN absent : message Telegram ignoré");
    return null;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) console.error(`Telegram ${method} a échoué`, res.status, json?.description);
  return json?.result ?? null;
}

export function sendMessage(chatId: string, html: string, buttons?: InlineButton[][]) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function reminderButtons(taskId: string): InlineButton[][] {
  return [[
    { text: "Terminé", callback_data: `done:${taskId}` },
    { text: "+15 min", callback_data: `snz:${taskId}` },
  ]];
}

/**
 * Envoie un fichier (50 Mo max côté Telegram).
 * `retry` : l'échec peut passer en réessayant (réseau, 5xx, 429), contrairement à un bot bloqué ou un chat supprimé.
 */
export async function sendDocument(
  chatId: string,
  file: Blob,
  filename: string,
  captionHtml: string,
): Promise<{ ok: true } | { ok: false; error: string; retry: boolean }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Bot Telegram non configuré sur le serveur", retry: false };
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", file, filename);
  form.append("caption", captionHtml);
  form.append("parse_mode", "HTML");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
    const json = await res.json().catch(() => null);
    if (json?.ok) return { ok: true };
    const desc: string = json?.description ?? `Erreur Telegram ${res.status}`;
    console.error("Telegram sendDocument a échoué", res.status, desc);
    if (res.status === 401 || res.status === 404) return { ok: false, error: "Bot Telegram mal configuré sur le serveur (jeton refusé)", retry: false };
    if (/blocked/i.test(desc)) return { ok: false, error: "Le bot a été bloqué dans Telegram", retry: false };
    if (/chat not found|deactivated/i.test(desc)) return { ok: false, error: "Conversation Telegram introuvable : reliez Telegram à nouveau", retry: false };
    return { ok: false, error: desc, retry: res.status >= 500 || res.status === 429 };
  } catch (err) {
    console.error("Telegram sendDocument injoignable", err);
    return { ok: false, error: "Telegram injoignable", retry: true };
  }
}
