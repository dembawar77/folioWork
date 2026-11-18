# FolioWork

Tâches de travail et notes riches, synchronisées en temps réel entre ordinateur et mobile, avec rappels à l'heure exacte
(notifications web + bot Telegram) et résumé du matin.

**Mise en ligne : voir [SETUP.md](SETUP.md). Utilisation : voir [MODE-EMPLOI.md](MODE-EMPLOI.md).**

## Stack

| Rôle | Choix |
|---|---|
| Interface | React 19, Vite, TypeScript, Tailwind CSS v4 — charte Studio Eloïse (Satoshi + General Sans, Noir/Blanc, signal Bleu Eloïse #1D23E8, angles francs) |
| Notes | Tiptap (texte riche, cases à cocher) |
| App installable | vite-plugin-pwa (service worker sur mesure : `src/sw.ts`) |
| Backend | Convex : base de données temps réel, auth Google, fonctions programmées |
| Rappels | `ctx.scheduler.runAt` : une fonction programmée par rappel, à l'heure exacte, annulée si la tâche change |
| Notifications | Web Push (VAPID) envoyé depuis Convex (`convex/notify.ts`) |
| Bot | API Bot Telegram, webhook sur `convex/http.ts` |
| Hébergement | Cloudflare Pages |

## Fonctionnalités (v0.1)

- Saisie rapide en français : `Brief campagne vendredi 9h #Créa !urgent` remplit la date, la catégorie et la priorité.
- Vues Aujourd'hui (avec les retards), À venir, Toutes, Terminées ; filtres par catégorie ; recherche dans les titres et les notes.
- Note riche dépliable sous chaque tâche, enregistrée automatiquement, avec compteur de cases cochées.
- Rappels sur chaque appareil abonné, avec boutons **Terminé** / **+15 min** directement dans la notification.
- Résumé du matin à l'heure choisie, dans le fuseau horaire de l'utilisateur.
- Bot Telegram : créer une tâche en écrivant au bot, recevoir les rappels, `/aujourdhui`.
- Partage vers l'app depuis WhatsApp, Gmail… (Android, app installée).
- Raccourcis clavier : `N` nouvelle tâche, `/` recherche, `Échap` fermer.

## Développement local

```bash
npm install
```

```bash
npx convex dev
```

```bash
npm run dev
```

```bash
npm test
```

`npx convex dev` crée un déploiement de développement et écrit `VITE_CONVEX_URL` dans `.env.local`.

## Structure

```
convex/
  schema.ts        tables : users, tasks, preferences, pushSubscriptions, telegramLinks
  tasks.ts         CRUD + programmation des rappels
  preferences.ts   résumé du matin (se reprogramme chaque jour)
  notify.ts        envoi Web Push + Telegram (runtime Node)
  http.ts          webhook Telegram, boutons des notifications
  lib/parse.ts     analyse de la saisie en français (partagée client/serveur)
src/
  components/      Workspace, TaskRow, NoteEditor, QuickCapture, AlertsPanel
  sw.ts            service worker : cache hors ligne, push, clic sur notification
```
