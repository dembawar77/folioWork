import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./users";
import { getPrefs } from "./preferences";
import { insertTask } from "./tasks";
import { dayAt } from "./lib/recurrence";
import { localDateKey } from "./lib/time";
import { normalizePhone } from "./lib/whatsapp";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const RESERVED = new Set(["admin", "api", "app", "demande", "demandes", "foliowork", "aide", "help", "login", "test"]);
const PER_10_MIN = 8;
const PER_DAY = 60;

const firstName = (name: string | undefined) => (name ?? "").trim().split(/\s+/)[0] || "le destinataire";

// ─── Réglages (propriétaire) ────────────────────────────────────────────────

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const intake = await ctx.db
      .query("intakes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const user = await ctx.db.get(userId);
    return { intake: intake ? { slug: intake.slug, enabled: intake.enabled, intro: intake.intro ?? "" } : null, suggestedSlug: suggest(user?.name) };
  },
});

function suggest(name: string | undefined): string {
  const base = firstName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base.length >= 3 ? base : "mes-demandes";
}

export const save = mutation({
  args: { slug: v.string(), enabled: v.boolean(), intro: v.optional(v.string()) },
  handler: async (ctx, { slug, enabled, intro }) => {
    const userId = await requireUser(ctx);
    const clean = slug.trim().toLowerCase();
    if (!SLUG.test(clean)) throw new ConvexError("Adresse invalide : 3 à 30 caractères, lettres sans accent, chiffres et tirets");
    if (RESERVED.has(clean)) throw new ConvexError("Cette adresse est réservée, choisissez-en une autre");
    const owner = await slugOwner(ctx, clean);
    if (owner && owner !== userId) throw new ConvexError("Cette adresse est déjà prise");
    const existing = await ctx.db
      .query("intakes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    // L'ancienne adresse reste réservée à son propriétaire, pour toujours : un lien déjà
    // envoyé ne pourra jamais mener chez quelqu'un d'autre.
    if (existing && existing.slug !== clean) {
      await ctx.db.insert("intakeAliases", { slug: existing.slug, userId, retiredAt: Date.now() });
    }
    // Reprendre une de ses anciennes adresses : elle redevient active.
    const alias = await ctx.db
      .query("intakeAliases")
      .withIndex("by_slug", (q) => q.eq("slug", clean))
      .first();
    if (alias?.userId === userId) await ctx.db.delete(alias._id);
    const doc = { slug: clean, enabled, intro: intro?.trim().slice(0, 300) || undefined };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("intakes", { userId, ...doc });
  },
});

// ─── Page publique ─────────────────────────────────────────────────────────

/** Propriétaire d'une adresse, active ou ancienne. */
async function slugOwner(ctx: QueryCtx, slug: string): Promise<Id<"users"> | null> {
  const active = await ctx.db
    .query("intakes")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (active) return active.userId;
  const alias = await ctx.db
    .query("intakeAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  return alias?.userId ?? null;
}

export const publicInfo = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = slug.toLowerCase();
    const intake = await ctx.db
      .query("intakes")
      .withIndex("by_slug", (q) => q.eq("slug", s))
      .unique();
    if (intake) {
      if (!intake.enabled) return { status: "inactive" as const };
      const owner = await ctx.db.get(intake.userId);
      return { status: "active" as const, firstName: firstName(owner?.name), intro: intake.intro ?? null };
    }
    const alias = await ctx.db
      .query("intakeAliases")
      .withIndex("by_slug", (q) => q.eq("slug", s))
      .first();
    if (alias) {
      // Ancienne adresse : on indique la nouvelle, sans rien révéler d'autre.
      const current = await ctx.db
        .query("intakes")
        .withIndex("by_user", (q) => q.eq("userId", alias.userId))
        .unique();
      return { status: "moved" as const, newSlug: current?.enabled ? current.slug : null };
    }
    return { status: "inactive" as const };
  },
});

export const submit = mutation({
  args: {
    slug: v.string(),
    from: v.string(),
    service: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.string(),
    details: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    urgent: v.boolean(),
    /** Champ piège invisible : rempli uniquement par les robots. */
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intake = await ctx.db
      .query("intakes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.toLowerCase()))
      .unique();
    if (!intake?.enabled) throw new ConvexError("Ce lien n'est plus actif");
    if (args.website?.trim()) return { ok: true }; // robot : on fait comme si de rien n'était

    const from = args.from.trim().slice(0, 60);
    const title = args.title.trim().slice(0, 200);
    if (!from) throw new ConvexError("Indiquez votre nom");
    if (!title) throw new ConvexError("Décrivez votre demande en une ligne");
    const phone = args.phone?.trim() ? normalizePhone(args.phone) : undefined;
    if (args.phone?.trim() && !phone) throw new ConvexError("Numéro WhatsApp non reconnu");

    const now = Date.now();
    const recent = await ctx.db
      .query("intakeHits")
      .withIndex("by_slug_at", (q) => q.eq("slug", intake.slug).gt("at", now - 86_400_000))
      .collect();
    if (recent.length >= PER_DAY || recent.filter((h) => h.at > now - 600_000).length >= PER_10_MIN) {
      throw new ConvexError("Trop de demandes en peu de temps. Réessayez un peu plus tard.");
    }
    await ctx.db.insert("intakeHits", { slug: intake.slug, at: now });

    const prefs = await getPrefs(ctx, intake.userId);
    let dueAt: number | undefined;
    if (args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) {
      const today = localDateKey(prefs.timezone, new Date(now));
      const days = Math.round((Date.parse(args.dueDate) - Date.parse(today)) / 86_400_000);
      if (days >= 0 && days <= 366) dueAt = dayAt(now, days, "09:00", prefs.timezone);
    }

    const id = await insertTask(ctx, intake.userId, {
      title,
      priority: args.urgent ? "high" : "normal",
      workstream: "Demandes",
      dueAt,
    });
    const details = args.details?.trim().slice(0, 4000);
    const service = args.service?.trim().slice(0, 60) || undefined;
    const signature = `Demandé par ${from}${service ? ` (${service})` : ""}`;
    const paragraphs = [...(details ? details.split(/\n+/) : []), signature].filter(Boolean);
    await ctx.db.patch(id, {
      request: { from, service, phone, receivedAt: now, seen: false },
      note: JSON.stringify({ type: "doc", content: paragraphs.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) }),
      noteText: paragraphs.join("\n"),
    });
    await ctx.scheduler.runAfter(0, internal.notify.fireRequest, { taskId: id });
    return { ok: true };
  },
});
