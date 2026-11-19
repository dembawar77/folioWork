import { describe, expect, it } from "vitest";
import { normalizePhone, followUpMessage, whatsappLink, formatPhone } from "./whatsapp";
import { parseQuickTask } from "./parse";
import { dayAt } from "./recurrence";

describe("numéros", () => {
  it.each([
    ["77 123 45 67", "221771234567"],
    ["+221 78 123 45 67", "221781234567"],
    ["00221771234567", "221771234567"],
    ["33 820 00 00", "221338200000"],
    ["+33 6 12 34 56 78", "33612345678"],
    ["123", undefined],
    ["", undefined],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it("affichage", () => expect(formatPhone("221771234567")).toBe("+221 77 123 45 67"));
});

describe("message", () => {
  const now = Date.now();
  it("prénom seul, titre et échéance", () => {
    const m = followUpMessage("Moussa Diop", "BAT affiche Kirène", Date.parse("2026-11-26T10:00:00Z"), "Africa/Dakar");
    expect(m).toMatch(/^Bonjour Moussa, je reviens vers vous au sujet de « BAT affiche Kirène » \(prévu .* à 10:00\)\. Où en sommes-nous \? Merci\.$/);
    void now;
  });
  it("lien wa.me encodé", () => {
    expect(whatsappLink("221771234567", "Bonjour & merci")).toBe("https://wa.me/221771234567?text=Bonjour%20%26%20merci");
    expect(whatsappLink(undefined, "x")).toBe("https://wa.me/?text=x");
  });
});

describe("saisie @Nom", () => {
  const now = Date.parse("2026-11-18T21:00:00Z");
  it("extrait la personne attendue", () => {
    const r = parseQuickTask("BAT affiche Kirène jeudi @Moussa #Créa", { now, timeZone: "Africa/Dakar" });
    expect(r).toMatchObject({ title: "BAT affiche Kirène", waitingFor: "Moussa", workstream: "Créa" });
  });
  it("nom composé", () => {
    expect(parseQuickTask("Devis stand @agence_vision", { now, timeZone: "Africa/Dakar" }).waitingFor).toBe("Agence Vision");
  });
  it("ignore une adresse e-mail", () => {
    expect(parseQuickTask("Écrire à contact@ibs.sn", { now, timeZone: "Africa/Dakar" }).waitingFor).toBeUndefined();
  });
});

describe("dayAt", () => {
  it("dans 2 jours à 9h, heure de Dakar", () => {
    expect(new Date(dayAt(Date.parse("2026-11-18T21:00:00Z"), 2, "09:00", "Africa/Dakar")).toISOString()).toBe("2026-11-20T09:00:00.000Z");
  });
});
