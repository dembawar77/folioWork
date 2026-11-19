import { describe, expect, it } from "vitest";
import { nextBackupAt } from "./time";

describe("nextBackupAt", () => {
  it("donne le dimanche 20h suivant (Dakar = UTC)", () => {
    // Mercredi 19 novembre 2026, 10h
    expect(new Date(nextBackupAt("Africa/Dakar", Date.UTC(2026, 10, 19, 10))).toISOString()).toBe("2026-11-22T20:00:00.000Z");
  });
  it("le dimanche avant 20h : le soir même ; après : la semaine suivante", () => {
    expect(new Date(nextBackupAt("Africa/Dakar", Date.UTC(2026, 10, 22, 19, 59))).toISOString()).toBe("2026-11-22T20:00:00.000Z");
    expect(new Date(nextBackupAt("Africa/Dakar", Date.UTC(2026, 10, 22, 20, 0))).toISOString()).toBe("2026-11-29T20:00:00.000Z");
  });
  it("suit l'heure locale du compte (Paris, UTC+1 en hiver)", () => {
    expect(new Date(nextBackupAt("Europe/Paris", Date.UTC(2026, 10, 19, 10))).toISOString()).toBe("2026-11-22T19:00:00.000Z");
  });
});
