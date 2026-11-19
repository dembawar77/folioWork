"use node";

import { randomBytes } from "node:crypto";
import * as webpush from "web-push";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sendMessage, reminderButtons } from "./lib/telegram";
import { escapeHtml, formatDue, formatTime, PRIORITY_LABEL } from "./lib/format";
import { followUpMessage, whatsappLink } from "./lib/whatsapp";

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url: string;
  /** « reminder » : Terminé / +15 min ; « followup » : Relancer sur WhatsApp / Reçu. */
  kind?: "reminder" | "followup";
  taskId?: string;
  actionToken?: string;
  actionUrl?: string;
  whatsappUrl?: string;
};

type Targets = {
  subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[];
  telegramChatId: string | null;
};
type DeliveryResult = { pushed: number; devices: number; telegramSent: boolean };

function configureVapid(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn("Clés VAPID absentes : notifications web désactivées");
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return true;
}

/** Envoie un message à tous les appareils de l'utilisateur, puis sur Telegram s'il est lié. */
async function deliver(
  ctx: ActionCtx,
  userId: Id<"users">,
  push: PushPayload,
  telegram?: { html: string; buttons?: Parameters<typeof sendMessage>[2] },
): Promise<DeliveryResult> {
  const targets: Targets = await ctx.runQuery(internal.push.targetsForUser, { userId });
  let pushed = 0;
  if (targets.subscriptions.length && configureVapid()) {
    await Promise.all(
      targets.subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, JSON.stringify(push), { TTL: 60 * 60 * 12, urgency: "high" });
          pushed++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await ctx.runMutation(internal.push.removeDeadSubscription, { endpoint: sub.endpoint });
          } else {
            console.error("Échec de l'envoi push", err?.statusCode, err?.body ?? err?.message);
          }
        }
      }),
    );
  }
  let telegramSent = false;
  if (telegram && targets.telegramChatId) {
    telegramSent = !!(await sendMessage(targets.telegramChatId, telegram.html, telegram.buttons));
  }
  return { pushed, devices: targets.subscriptions.length, telegramSent };
}

export const fireReminder = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.runQuery(internal.tasks.getInternal, { taskId });
    if (!task || task.completed) return;
    const prefs = await ctx.runQuery(internal.preferences.internalGet, { userId: task.userId });
    const actionToken = randomBytes(18).toString("base64url");
    await ctx.runMutation(internal.tasks.markReminderSent, { taskId, actionToken });

    const when = task.dueAt ? formatDue(task.dueAt, prefs.timezone) : "maintenant";
    const preview = task.noteText?.trim().slice(0, 120);
    const meta = [task.workstream, task.priority !== "normal" ? PRIORITY_LABEL[task.priority] : null].filter(Boolean).join(" · ");

    await deliver(
      ctx,
      task.userId,
      {
        title: task.title,
        body: [`Échéance ${when}`, meta, preview].filter(Boolean).join("\n"),
        tag: `task-${taskId}`,
        url: `/?task=${taskId}`,
        kind: "reminder",
        taskId,
        actionToken,
        actionUrl: `${process.env.CONVEX_SITE_URL}/push/action`,
      },
      {
        html: `<b>${escapeHtml(task.title)}</b>\nÉchéance ${escapeHtml(when)}${meta ? `\n${escapeHtml(meta)}` : ""}${
          preview ? `\n\n<i>${escapeHtml(preview)}</i>` : ""
        }`,
        buttons: reminderButtons(taskId),
      },
    );
  },
});

export const fireFollowUp = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.runQuery(internal.tasks.getInternal, { taskId });
    if (!task || task.completed || !task.waitingFor) return;
    const prefs = await ctx.runQuery(internal.preferences.internalGet, { userId: task.userId });
    const actionToken = randomBytes(18).toString("base64url");
    await ctx.runMutation(internal.tasks.followUpSent, { taskId, actionToken });

    const w = task.waitingFor;
    const days = Math.max(1, Math.round((Date.now() - w.since) / 86_400_000));
    const since = `En attente depuis ${days} jour${days > 1 ? "s" : ""}${w.nudges ? ` · ${w.nudges} relance${w.nudges > 1 ? "s" : ""}` : ""}`;
    const wa = whatsappLink(w.phone, followUpMessage(w.name, task.title, task.dueAt, prefs.timezone));

    await deliver(
      ctx,
      task.userId,
      {
        title: `Relancer ${w.name}`,
        body: `${task.title}\n${since}`,
        tag: `followup-${taskId}`,
        url: `/?task=${taskId}`,
        kind: "followup",
        taskId,
        actionToken,
        actionUrl: `${process.env.CONVEX_SITE_URL}/push/action`,
        whatsappUrl: wa,
      },
      {
        html: `<b>Relancer ${escapeHtml(w.name)}</b>\n${escapeHtml(task.title)}\n<i>${escapeHtml(since)}</i>`,
        buttons: [
          [{ text: "Relancer sur WhatsApp", url: wa }],
          [
            { text: "Reçu", callback_data: `rcv:${taskId}` },
            { text: "Dans 2 jours", callback_data: `pp2:${taskId}` },
          ],
        ],
      },
    );
  },
});

export const fireRequest = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.runQuery(internal.tasks.getInternal, { taskId });
    if (!task?.request) return;
    const prefs = await ctx.runQuery(internal.preferences.internalGet, { userId: task.userId });
    const r = task.request;
    const who = `${r.from}${r.service ? ` (${r.service})` : ""}`;
    const when = task.dueAt ? `Pour ${formatDue(task.dueAt, prefs.timezone)}` : "Sans date";
    const reply = r.phone
      ? whatsappLink(r.phone, `Bonjour ${r.from.split(/\s+/)[0]}, bien reçu votre demande « ${task.title} ». Je reviens vers vous rapidement.`)
      : null;
    await deliver(
      ctx,
      task.userId,
      { title: `Nouvelle demande · ${who}`, body: `${task.title}\n${when}`, tag: `request-${taskId}`, url: `/?task=${taskId}` },
      {
        html: `<b>Nouvelle demande</b> de ${escapeHtml(who)}\n${escapeHtml(task.title)}\n<i>${escapeHtml(when)}</i>${
          task.priority === "high" ? "\nMarquée urgente" : ""
        }`,
        buttons: reply ? [[{ text: "Répondre sur WhatsApp", url: reply }]] : undefined,
      },
    );
  },
});

export const fireDailySummary = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Programme d'abord le prochain résumé : un échec d'envoi ne casse pas la chaîne.
    await ctx.runMutation(internal.preferences.scheduleNextSummary, { userId });
    const digest = await ctx.runQuery(internal.tasks.todayDigest, { userId });
    const overdue = digest.tasks.filter((t) => t.overdue && t.dueAt < Date.now() - 3_600_000).length;
    const count = digest.tasks.length;
    const title = count === 0 ? "Journée dégagée" : `${count} tâche${count > 1 ? "s" : ""} aujourd'hui`;
    const top = digest.tasks.slice(0, 3).map((t) => `• ${t.title}`);
    const body =
      count === 0
        ? `Rien de prévu aujourd'hui. ${digest.openCount} tâche(s) ouverte(s) sans échéance proche.`
        : [overdue ? `${overdue} en retard` : null, ...top].filter(Boolean).join("\n");

    const lines = digest.tasks.slice(0, 10).map((t) => {
      const flag = t.priority === "urgent" ? "URGENT · " : t.priority === "high" ? "HAUTE · " : "";
      const late = t.overdue ? " <i>(en retard)</i>" : "";
      return `${flag}${formatTime(t.dueAt, digest.timezone)} · ${escapeHtml(t.title)}${late}`;
    });
    await deliver(
      ctx,
      userId,
      { title: `Bonjour. ${title}`, body, tag: "daily-summary", url: "/" },
      { html: `<b>${title}</b>\n\n${lines.join("\n") || "Rien de prévu aujourd'hui."}` },
    );
  },
});

export const sendTest = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<DeliveryResult> => {
    return await deliver(
      ctx,
      userId,
      { title: "FolioWork fonctionne", body: "Les rappels arriveront sur cet appareil.", tag: "test", url: "/?view=alerts" },
      { html: "<b>Test FolioWork</b>\nLes rappels arriveront aussi ici." },
    );
  },
});

/**
 * Génère les clés à copier dans les variables d'environnement Convex.
 * À lancer une fois depuis le tableau de bord Convex (Functions → notify:generateSecrets → Run).
 * Rien n'est enregistré : les valeurs ne sont affichées qu'à vous.
 */
export const generateSecrets = internalAction({
  args: {},
  handler: async () => {
    const vapid = webpush.generateVAPIDKeys();
    return {
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      TELEGRAM_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
    };
  },
});
