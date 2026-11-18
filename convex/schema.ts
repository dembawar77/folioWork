import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vPriority = v.union(v.literal("urgent"), v.literal("high"), v.literal("normal"), v.literal("low"));

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
