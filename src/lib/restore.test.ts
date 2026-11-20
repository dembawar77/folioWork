import { describe, expect, it } from "vitest";
import { readBackup } from "./restore";

const file = (data: unknown) => new File([typeof data === "string" ? data : JSON.stringify(data)], "b.json", { type: "application/json" });
const base = { format: "foliowork-export", version: 1, exportedAt: "2026-11-19T18:00:00.000Z", account: { email: "a@b.c" }, contacts: [], tasks: [] as unknown[] };

describe("readBackup", () => {
  it("refuse un fichier qui n'est pas une sauvegarde", async () => {
    await expect(readBackup(file("pas du json"))).rejects.toThrow("illisible");
    await expect(readBackup(file({ hello: 1 }))).rejects.toThrow("n'est pas une sauvegarde");
    await expect(readBackup(file({ ...base, version: 2 }))).rejects.toThrow("version plus récente");
  });

  it("garde les champs connus, remet la note en texte, écarte le reste", async () => {
    const note = { type: "doc", content: [] };
    const b = await readBackup(
      file({
        ...base,
        contacts: [{ name: "Awa", phone: "221770000000" }, { name: "" }],
        tasks: [
          {
            id: "abc123def456ghi",
            title: "Visuel",
            completed: false,
            priority: "bizarre",
            dueAt: 5,
            note,
            noteText: "x",
            updatedAt: 1,
            reminderJobId: "x",
            recurrence: { freq: "never", interval: 1 },
            waitingFor: { name: "Awa" },
          },
          { id: "abc123def456ghj", title: "   ", completed: true },
          "n'importe quoi",
        ],
      }),
    );
    expect(b.invalid).toBe(2);
    expect(b.email).toBe("a@b.c");
    expect(b.contacts).toEqual([{ name: "Awa", phone: "221770000000" }]);
    expect(b.tasks).toEqual([{ id: "abc123def456ghi", title: "Visuel", completed: false, priority: "normal", dueAt: 5, note: JSON.stringify(note), noteText: "x" }]);
  });
});
