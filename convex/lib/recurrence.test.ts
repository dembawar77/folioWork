import { describe, expect, it } from "vitest";
import { nextDue, firstDue, step, recurrenceLabel, withAnchor } from "./recurrence";
import { parseQuickTask } from "./parse";

const tz = "Africa/Dakar";
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.parse("2026-11-18T21:00:00Z"); // mercredi soir

describe("step / nextDue", () => {
  it("quotidien", () => {
    expect(iso(step(Date.parse("2026-11-18T09:00:00Z"), { freq: "daily", interval: 1 }, tz))).toBe("2026-11-19T09:00:00.000Z");
  });
  it("jours ouvrés : vendredi → lundi", () => {
    expect(iso(step(Date.parse("2026-11-20T09:00:00Z"), { freq: "weekdays", interval: 1 }, tz))).toBe("2026-11-23T09:00:00.000Z");
  });
  it("toutes les 2 semaines", () => {
    expect(iso(step(Date.parse("2026-11-16T10:00:00Z"), { freq: "weekly", interval: 2 }, tz))).toBe("2026-11-30T10:00:00.000Z");
  });
  it("mensuel, 31 → fin février → 31 mars (ancre conservée)", () => {
    const rule = withAnchor({ freq: "monthly", interval: 1 }, Date.parse("2027-01-31T09:00:00Z"), tz);
    const feb = step(Date.parse("2027-01-31T09:00:00Z"), rule, tz);
    expect(iso(feb)).toBe("2027-02-28T09:00:00.000Z");
    expect(iso(step(feb, rule, tz))).toBe("2027-03-31T09:00:00.000Z");
  });
  it("une occurrence terminée en retard repart dans le futur", () => {
    const due = Date.parse("2026-11-10T09:00:00Z");
    expect(iso(nextDue(due, { freq: "daily", interval: 1 }, tz, now))).toBe("2026-11-19T09:00:00.000Z");
  });
  it("terminée en avance : une seule étape", () => {
    const due = Date.parse("2026-11-19T09:00:00Z");
    expect(iso(nextDue(due, { freq: "weekly", interval: 1 }, tz, now))).toBe("2026-11-26T09:00:00.000Z");
  });
  it("garde l'heure locale à travers le changement d'heure (Paris)", () => {
    const due = Date.parse("2027-03-27T08:00:00Z"); // samedi 9h à Paris (UTC+1)
    expect(iso(step(due, { freq: "daily", interval: 1 }, "Europe/Paris"))).toBe("2027-03-28T07:00:00.000Z"); // 9h UTC+2
  });
  it("première échéance sans date : demain 9h", () => {
    expect(iso(firstDue({ freq: "daily", interval: 1 }, tz, now))).toBe("2026-11-19T09:00:00.000Z");
  });
  it("libellés", () => {
    expect(recurrenceLabel({ freq: "weekly", interval: 1 }, Date.parse("2026-11-23T09:00:00Z"), tz)).toBe("Chaque lundi");
    expect(recurrenceLabel({ freq: "weekdays", interval: 1 }, undefined, tz)).toBe("Lun–ven");
  });
});

describe("saisie rapide avec répétition", () => {
  const p = (t: string) => parseQuickTask(t, { now, timeZone: tz });
  it("chaque lundi 9h", () => {
    const r = p("Rapport hebdo chaque lundi 9h #Admin");
    expect(r).toMatchObject({ title: "Rapport hebdo", workstream: "Admin", recurrence: { freq: "weekly", interval: 1 } });
    expect(iso(r.dueAt!)).toBe("2026-11-23T09:00:00.000Z");
  });
  it("tous les jours 10h", () => {
    const r = p("Point équipe tous les jours 10h");
    expect(r.title).toBe("Point équipe");
    expect(r.recurrence).toEqual({ freq: "daily", interval: 1 });
    expect(iso(r.dueAt!)).toBe("2026-11-19T10:00:00.000Z");
  });
  it("en semaine, sans heure → 9h le prochain jour ouvré", () => {
    const r = p("Vérifier les DM Instagram en semaine");
    expect(r.title).toBe("Vérifier les DM Instagram");
    expect(r.recurrence?.freq).toBe("weekdays");
    expect(iso(r.dueAt!)).toBe("2026-11-19T09:00:00.000Z");
  });
  it("tous les mois le 5", () => {
    const r = p("Reporting Meta Ads tous les mois le 5 décembre");
    expect(r.recurrence?.freq).toBe("monthly");
    expect(r.title).toBe("Reporting Meta Ads");
  });
  it("toutes les 2 semaines", () => {
    expect(p("Shooting produit toutes les 2 semaines jeudi 14h").recurrence).toEqual({ freq: "weekly", interval: 2 });
  });
  it("pas de faux positif", () => {
    expect(p("Préparer la semaine du client").recurrence).toBeUndefined();
  });
});
