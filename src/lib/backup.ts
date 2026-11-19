import type { ConvexReactClient } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { recurrenceLabel } from "../../convex/lib/recurrence";
import { PRIORITY_LABEL } from "./tasks";

type ExportedTask = FunctionReturnType<typeof api.backup.tasksPage>["page"][number];
type Meta = FunctionReturnType<typeof api.backup.meta>;
export type Backup = Meta & { format: "foliowork-export"; version: 1; exportedAt: string; timeZone: string; tasks: ExportedTask[] };

/** Rassemble toutes les données du compte (les tâches par pages de 200). */
export async function collectBackup(convex: ConvexReactClient, onProgress?: (n: number) => void): Promise<Backup> {
  const meta = await convex.query(api.backup.meta, {});
  const tasks: ExportedTask[] = [];
  let cursor: string | null = null;
  for (;;) {
    const res: FunctionReturnType<typeof api.backup.tasksPage> = await convex.query(api.backup.tasksPage, {
      paginationOpts: { numItems: 200, cursor },
    });
    tasks.push(...res.page);
    onProgress?.(tasks.length);
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  tasks.sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt);
  return {
    format: "foliowork-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    timeZone: meta.preferences.timezone,
    ...meta,
    tasks,
  };
}

/** Sauvegarde complète, relisible par une machine (notes au format de l'éditeur incluses). */
export function toJson(b: Backup): Blob {
  const tasks = b.tasks.map((t) => {
    let note: unknown = t.note;
    try {
      if (t.note) note = JSON.parse(t.note);
    } catch {
      /* note en texte brut */
    }
    return { ...t, note };
  });
  return new Blob([JSON.stringify({ ...b, tasks }, null, 2)], { type: "application/json" });
}

/** Tableau pour Excel / Google Sheets (séparateur « ; », accents conservés). */
export function toCsv(b: Backup): Blob {
  const tz = b.timeZone;
  const date = (ms: number | undefined) => {
    if (ms === undefined) return "";
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("fr-FR", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(ms)
        .map((x) => [x.type, x.value]),
    );
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  };
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Titre", "Statut", "Échéance", "Priorité", "Catégorie", "Répétition", "En attente de", "Demande de", "Cases cochées", "Note", "Créée le", "Terminée le"];
  const rows = b.tasks.map((t) => [
    t.title,
    t.completed ? "Terminée" : "Ouverte",
    date(t.dueAt),
    PRIORITY_LABEL[t.priority],
    t.workstream,
    t.recurrence ? recurrenceLabel(t.recurrence, t.dueAt, tz) : "",
    t.waitingFor ? `${t.waitingFor.name}${t.waitingFor.phone ? ` (${t.waitingFor.phone})` : ""}` : "",
    t.request ? `${t.request.from}${t.request.service ? ` · ${t.request.service}` : ""}` : "",
    t.checklistTotal ? `${t.checklistDone ?? 0}/${t.checklistTotal}` : "",
    t.noteText?.trim(),
    date(t.createdAt),
    date(t.completedAt),
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  // BOM : Excel reconnaît ainsi l'UTF-8 (accents).
  return new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
}

/** Enregistre le fichier : partage (iPhone, Android installée) ou téléchargement classique. */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      /* partage indisponible : téléchargement */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const backupName = (ext: "json" | "csv") => `foliowork-${new Date().toISOString().slice(0, 10)}.${ext}`;
