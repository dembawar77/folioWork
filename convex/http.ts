import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendMessage, tg } from "./lib/telegram";
import { escapeHtml, formatDue, formatTime, PRIORITY_LABEL } from "./lib/format";
import { recurrenceLabel } from "./lib/recurrence";

const http = httpRouter();

// ─── Boutons des notifications web (« Terminé », « +15 min ») ───────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

http.route({
  path: "/push/action",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/push/action",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json().catch(() => null);
    const { taskId, token, action } = body ?? {};
    if (typeof taskId !== "string" || typeof token !== "string" || !["done", "snooze", "nudge", "received", "postpone"].includes(action)) {
      return new Response("Requête invalide", { status: 400, headers: CORS });
    }
    const ok = await ctx.runMutation(internal.tasks.actByToken, { taskId, token, action });
    return new Response(ok ? "ok" : "refusé", { status: ok ? 200 : 403, headers: CORS });
  }),
});

// ─── Bot Telegram ───────────────────────────────────────────────────────────

const HELP = [
  "<b>Écrivez simplement votre tâche :</b>",
  "<code>Relancer imprimeur demain 10h #Créa !urgent</code>",
  "",
  "• Date et heure en français : <i>demain 10h, vendredi, le 25 novembre à 14h30, dans 2 heures</i>",
  "• <code>#Catégorie</code> pour classer",
  "• <code>!urgent</code>, <code>!haute</code> ou <code>!basse</code> pour la priorité",
  "• Répétition : <i>tous les jours, en semaine, chaque lundi, toutes les 2 semaines, tous les mois</i>",
  "• <code>@Nom</code> : en attente de cette personne, relance automatique tous les 2 jours",
  "",
  "/aujourdhui : vos tâches du jour",
].join("\n");

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
      return new Response("forbidden", { status: 403 });
    }
    const update = await req.json().catch(() => null);
    if (!update) return new Response("ok");

    try {
      // Appui sur un bouton sous un rappel.
      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = String(cq.message?.chat?.id ?? cq.from?.id);
        const [kind, taskId] = String(cq.data ?? "").split(":");
        const userId = await ctx.runQuery(internal.telegram.userForChat, { chatId });
        const ACTIONS = {
          done: { action: "done", reply: "Terminée" },
          snz: { action: "snooze", reply: "Rappel dans 15 min" },
          rcv: { action: "received", reply: "Retour reçu" },
          rel: { action: "nudge", reply: "Relance enregistrée" },
          pp2: { action: "postpone", reply: "Relance dans 2 jours" },
        } as const;
        const def = ACTIONS[kind as keyof typeof ACTIONS];
        let answer = "Action impossible";
        if (userId && taskId && def) {
          const title = await ctx.runMutation(internal.tasks.actForUser, { userId, taskId, action: def.action });
          if (title) {
            answer = def.reply;
            if (cq.message) {
              await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
              await sendMessage(chatId, `${def.reply} — ${escapeHtml(title)}`);
            }
          } else answer = "Tâche introuvable";
        }
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: answer });
        return new Response("ok");
      }

      const msg = update.message;
      const text: string | undefined = msg?.text?.trim();
      if (!msg || !text || msg.chat?.type !== "private") return new Response("ok");
      const chatId = String(msg.chat.id);

      if (text.startsWith("/start")) {
        const code = text.split(/\s+/)[1];
        if (!code) {
          await sendMessage(chatId, "Bienvenue sur FolioWork.\n\nPour relier ce chat à votre compte, ouvrez l'app → <b>Alertes</b> → <b>Relier Telegram</b>.");
          return new Response("ok");
        }
        const result = await ctx.runMutation(internal.telegram.linkChat, { code, chatId, username: msg.from?.username });
        const reply =
          result === "linked"
            ? `Compte relié. Vos rappels arriveront aussi ici.\n\n${HELP}`
            : result === "expired"
              ? "Ce code a expiré. Générez-en un nouveau dans l'app (Alertes → Relier Telegram)."
              : "Code invalide. Générez-en un nouveau dans l'app (Alertes → Relier Telegram).";
        await sendMessage(chatId, reply);
        return new Response("ok");
      }

      const userId = await ctx.runQuery(internal.telegram.userForChat, { chatId });
      if (!userId) {
        await sendMessage(chatId, "Ce chat n'est pas encore relié. Ouvrez FolioWork → <b>Alertes</b> → <b>Relier Telegram</b>.");
        return new Response("ok");
      }

      if (text === "/aide" || text === "/help") {
        await sendMessage(chatId, HELP);
        return new Response("ok");
      }

      if (text === "/aujourdhui" || text === "/today") {
        const digest = await ctx.runQuery(internal.tasks.todayDigest, { userId });
        const lines = digest.tasks.map((t) => {
          const flag = t.priority === "urgent" ? "URGENT · " : t.priority === "high" ? "HAUTE · " : "";
          return `${flag}${formatTime(t.dueAt, digest.timezone)} · ${escapeHtml(t.title)}${t.overdue ? " <i>(en retard)</i>" : ""}`;
        });
        await sendMessage(chatId, lines.length ? `<b>Aujourd'hui</b>\n\n${lines.join("\n")}` : "Rien de prévu aujourd'hui.");
        return new Response("ok");
      }

      if (text.startsWith("/")) {
        await sendMessage(chatId, HELP);
        return new Response("ok");
      }

      const created = await ctx.runMutation(internal.tasks.createFromText, { userId, text });
      const parts = [
        created.dueAt ? `Échéance : ${escapeHtml(formatDue(created.dueAt, created.timezone))}` : "Sans échéance",
        created.recurrence ? `Répétition : ${recurrenceLabel(created.recurrence, created.dueAt, created.timezone)}` : null,
        created.workstream ? `Catégorie : ${escapeHtml(created.workstream)}` : null,
        created.waitingFor ? `En attente de ${escapeHtml(created.waitingFor)} · relance dans 2 jours` : null,
        created.priority !== "normal" ? `Priorité : ${PRIORITY_LABEL[created.priority]}` : null,
      ].filter(Boolean);
      await sendMessage(chatId, `Ajoutée — <b>${escapeHtml(created.title)}</b>\n${parts.join("\n")}`, [
        [{ text: "Terminé", callback_data: `done:${created.id}` }],
      ]);
    } catch (err) {
      console.error("Erreur webhook Telegram", err);
    }
    // Toujours 200 : sinon Telegram renvoie le même message en boucle.
    return new Response("ok");
  }),
});


export default http;
