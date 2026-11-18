import { describe, expect, it } from "vitest";
import { parseQuickTask } from "./parse";
import { nextOccurrence, localDayBounds, tzOffsetMinutes } from "./time";

const now = Date.parse("2026-11-18T21:00:00Z"); // mercredi soir à Dakar (UTC+0)
const tz = "Africa/Dakar";

describe("parseQuickTask", () => {
  it("extrait date, heure, catégorie et priorité", () => {
    const r = parseQuickTask("Relancer imprimeur demain 10h #Créa !urgent", { now, timeZone: tz });
    expect(r.title).toBe("Relancer imprimeur");
    expect(new Date(r.dueAt!).toISOString()).toBe("2026-11-19T10:00:00.000Z");
    expect(r.workstream).toBe("Créa");
    expect(r.priority).toBe("urgent");
    expect(r.hasTime).toBe(true);
  });

  it("met 09:00 par défaut sans heure précise", () => {
    const r = parseQuickTask("Point équipe lundi", { now, timeZone: tz });
    expect(r.title).toBe("Point équipe");
    expect(new Date(r.dueAt!).toISOString()).toBe("2026-11-23T09:00:00.000Z");
    expect(r.hasTime).toBe(false);
  });

  it("retire les prépositions orphelines", () => {
    const r = parseQuickTask("Réunion agence le 25 novembre à 14h30", { now, timeZone: tz });
    expect(r.title).toBe("Réunion agence");
  });

  it("respecte le fuseau horaire (Paris, UTC+1)", () => {
    const r = parseQuickTask("Appel demain 10h", { now, timeZone: "Europe/Paris" });
    expect(new Date(r.dueAt!).toISOString()).toBe("2026-11-19T09:00:00.000Z");
  });

  it("laisse une tâche sans date intacte", () => {
    const r = parseQuickTask("Préparer moodboard #campagne_ramadan !haute", { now, timeZone: tz });
    expect(r).toMatchObject({ title: "Préparer moodboard", workstream: "Campagne ramadan", priority: "high", dueAt: undefined });
  });

  it("ignore un ! qui n'est pas une priorité", () => {
    expect(parseQuickTask("Dire bravo !merci", { now, timeZone: tz }).title).toBe("Dire bravo !merci");
  });
});

describe("time", () => {
  it("décalage horaire", () => {
    expect(tzOffsetMinutes("Africa/Dakar", new Date(now))).toBe(0);
    expect(tzOffsetMinutes("Europe/Paris", new Date(now))).toBe(60);
  });

  it("prochaine occurrence de 08:30", () => {
    expect(new Date(nextOccurrence("08:30", tz, now)).toISOString()).toBe("2026-11-19T08:30:00.000Z");
    expect(new Date(nextOccurrence("22:00", tz, now)).toISOString()).toBe("2026-11-18T22:00:00.000Z");
    expect(new Date(nextOccurrence("08:30", "Europe/Paris", now)).toISOString()).toBe("2026-11-19T07:30:00.000Z");
  });

  it("bornes de la journée", () => {
    const b = localDayBounds(tz, now);
    expect(new Date(b.start).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(new Date(b.end).toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });
});
