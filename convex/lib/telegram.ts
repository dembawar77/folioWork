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
    { text: "✅ Terminé", callback_data: `done:${taskId}` },
    { text: "⏰ +15 min", callback_data: `snz:${taskId}` },
  ]];
}
