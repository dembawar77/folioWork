import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vPriority = v.union(v.literal("urgent"), v.literal("high"), v.literal("normal"), v.literal("low"));

export const vRecurrence = v.object({
  freq: v.union(v.literal("daily"), v.literal("weekdays"), v.literal("weekly"), v.literal("monthly")),
  interval: v.number(),
  /** Jour du mois d'origine (règle mensuelle) : 31 → 28 février → 31 mars. */
  monthDay: v.optional(v.number()),
});

export const vWaitingFor = v.object({
  name: v.string(),
  /** Numéro WhatsApp normalisé (chiffres avec indicatif), facultatif. */
  phone: v.optional(v.string()),
  since: v.number(),
  /** Relancer tous les N jours, à 9h heure locale. */
  everyDays: v.number(),
  nextFollowUpAt: v.number(),
  /** Relances envoyées depuis l'app ou une notification. */
  nudges: v.number(),
  lastNudgeAt: v.optional(v.number()),
});

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
  }).index("by_email", ["email"]),

  tasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
    priority: vPriority,
    workstream: v.optional(v.string()),
    /** Échéance (ms). */
    dueAt: v.optional(v.number()),
    /** Heure du rappel (ms). */
    remindAt: v.optional(v.number()),
    /** Fonction programmée qui enverra le rappel. */
    reminderJobId: v.optional(v.id("_scheduled_functions")),
    reminderSentAt: v.optional(v.number()),
    /** Jeton aléatoire qui autorise les boutons d'action des notifications. */
    actionToken: v.optional(v.string()),
    /** Note riche (JSON Tiptap sérialisé). */
    note: v.optional(v.string()),
    /** Texte brut de la note, pour la recherche et les aperçus. */
    noteText: v.optional(v.string()),
    checklistTotal: v.optional(v.number()),
    checklistDone: v.optional(v.number()),
    /** Répétition : à la fin d'une occurrence, la suivante est créée automatiquement. */
    recurrence: v.optional(vRecurrence),
    /** Occurrence suivante créée quand celle-ci a été terminée. */
    nextTaskId: v.optional(v.id("tasks")),
    /** Horodatage de création automatique (pour savoir si l'occurrence a été modifiée depuis). */
    spawnedAt: v.optional(v.number()),
    /** En attente d'un retour de quelqu'un. */
    waitingFor: v.optional(vWaitingFor),
    /** Arrivée par la boîte de dépôt. */
    request: v.optional(
      v.object({
        from: v.string(),
        service: v.optional(v.string()),
        phone: v.optional(v.string()),
        receivedAt: v.number(),
        seen: v.boolean(),
      }),
    ),
    followUpJobId: v.optional(v.id("_scheduled_functions")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_completed", ["userId", "completed"]),

  preferences: defineTable({
    userId: v.id("users"),
    timezone: v.string(),
    dailySummaryEnabled: v.boolean(),
    dailySummaryTime: v.string(),
    defaultReminderOffsetMinutes: v.number(),
    summaryJobId: v.optional(v.id("_scheduled_functions")),
  }).index("by_user", ["userId"]),

  /** Carnet de contacts pour les relances (nom → numéro WhatsApp). */
  contacts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    nameKey: v.string(),
    phone: v.optional(v.string()),
  }).index("by_user_name", ["userId", "nameKey"]),

  /** Boîte de dépôt : lien public pour recevoir des demandes. */
  intakes: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    enabled: v.boolean(),
    intro: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),

  /** Journal minimal des envois, pour limiter les abus. */
  intakeHits: defineTable({ slug: v.string(), at: v.number() }).index("by_slug_at", ["slug", "at"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    deviceLabel: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  telegramLinks: defineTable({
    userId: v.id("users"),
    chatId: v.string(),
    username: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"]),

  telegramLinkCodes: defineTable({
    userId: v.id("users"),
    code: v.string(),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),
});
