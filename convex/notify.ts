"use node";

import { randomBytes } from "node:crypto";
import * as webpush from "web-push";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sendMessage, reminderButtons } from "./lib/telegram";
import { escapeHtml, formatDue, formatTime, PRIORITY_LABEL } from "./lib/format";

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url: string;
  taskId?: string;
  actionToken?: string;
  actionUrl?: string;
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
        taskId,
        actionToken,
        actionUrl: `${process.env.CONVEX_SITE_URL}/push/action`,
      },
      {
        html: `⏰ <b>${escapeHtml(task.title)}</b>\nÉchéance ${escapeHtml(when)}${meta ? `\n${escapeHtml(meta)}` : ""}${
          preview ? `\n\n<i>${escapeHtml(preview)}</i>` : ""
        }`,
        buttons: reminderButtons(taskId),
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
      const flag = t.priority === "urgent" ? "🔴 " : t.priority === "high" ? "🟠 " : "";
      const late = t.overdue ? " <i>(en retard)</i>" : "";
      return `${flag}${formatTime(t.dueAt, digest.timezone)} · ${escapeHtml(t.title)}${late}`;
    });
    await deliver(
      ctx,
      userId,
      { title: `Bonjour ! ${title}`, body, tag: "daily-summary", url: "/" },
      { html: `☀️ <b>${title}</b>\n\n${lines.join("\n") || "Rien de prévu aujourd'hui."}` },
    );
  },
});

export const sendTest = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<DeliveryResult> => {
    return await deliver(
      ctx,
      userId,
      { title: "FolioWork fonctionne ✅", body: "Les rappels arriveront sur cet appareil.", tag: "test", url: "/?view=alerts" },
      { html: "✅ <b>Test FolioWork</b>\nLes rappels arriveront aussi ici." },
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
