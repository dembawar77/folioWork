# FolioWork : mode d'emploi

## 1. Ajouter une tâche en une ligne

Tapez dans le champ « Nouvelle tâche » puis **Entrée** :

```
Brief campagne vendredi 9h #Campagnes !urgent
```

FolioWork remplit lui-même l'échéance, la catégorie et la priorité. Un aperçu s'affiche sous le champ avant la validation.

| Vous écrivez | Résultat |
|---|---|
| `demain 10h`, `vendredi 9h`, `le 25 novembre à 14h30` | échéance à cette date et cette heure |
| `dans 2 heures`, `ce soir` | échéance calculée à partir de maintenant |
| `lundi`, `3 décembre` (sans heure) | échéance à **09:00** |
| `#Créa`, `#campagne_ramadan` | catégorie « Créa », « Campagne ramadan » |
| `!urgent` · `!haute` · `!basse` | priorité (Normale par défaut) |

Si une catégorie est sélectionnée à gauche (ou dans les filtres sur mobile), la nouvelle tâche la reçoit automatiquement.

## 2. Les vues

| Vue | Contenu |
|---|---|
| **Aujourd'hui** | tâches dues aujourd'hui **+ tâches en retard** |
| **À venir** | tâches avec une échéance après aujourd'hui |
| **Toutes** | toutes les tâches ouvertes, **y compris celles sans date** |
| **Terminées** | les tâches cochées, les plus récentes en haut |

⚠️ Une tâche **sans échéance** n'apparaît que dans **Toutes**.

Les couleurs : **rouge** = en retard ou urgent, **orange** = échéance dans moins de 2 h ou priorité haute.

## 3. Ouvrir une tâche

Cliquez sur une tâche pour la déplier. Vous pouvez :

- **renommer** la tâche directement dans son titre ;
- changer l'**échéance**, le **rappel** (pas de rappel, à l'heure, 15 min, 1 h ou 1 jour avant), la **priorité**, la **catégorie** ;
- écrire une **note** (voir ci-dessous) ;
- **supprimer** la tâche (en bas à droite).

Le **rond** à gauche termine la tâche. Dans **Terminées**, un nouveau clic la rouvre.

## 4. Les notes

Chaque tâche a sa note : compte rendu, idées, liens, sous-tâches. Elle s'enregistre seule (« Enregistré » en haut à droite).

Barre d'outils : gras, italique, titre, liste à puces, **cases à cocher**, code, lien.

Raccourcis en tapant :

| Tapez | Obtenez |
|---|---|
| `[ ] ` en début de ligne | une case à cocher |
| `- ` | une liste à puces |
| `## ` | un titre |

Le nombre de cases cochées s'affiche dans la liste (ex. `2/5`).

## 5. Rappels et notifications

- Chaque tâche avec une échéance reçoit un rappel automatique, selon le **Rappel par défaut** choisi dans **Alertes**.
- Le rappel arrive sur **tous les appareils activés** et sur **Telegram**.
- Boutons dans la notification : **✅ Terminé** et **⏰ +15 min** (ordinateur et Android ; sur iPhone, touchez la notification pour ouvrir la tâche).
- Toucher la notification ouvre directement la tâche.

**Activer un nouvel appareil** : sur cet appareil, **Alertes → Activer les notifications**, puis **Envoyer un test**.

**Résumé du matin** : **Alertes → Résumé quotidien**, choisissez l'heure. Vous recevez chaque matin les tâches du jour et celles en retard.

## 6. Le bot Telegram

Écrivez au bot comme dans le champ de saisie :

```
Relancer imprimeur jeudi 10h #Admin !haute
```

La tâche apparaît aussitôt dans l'app, sur tous vos appareils.

| Commande | Effet |
|---|---|
| `/aujourdhui` | liste des tâches du jour et des retards |
| `/aide` | rappel de la syntaxe |

Les rappels Telegram ont aussi les boutons **Terminé** et **+15 min**.
Pour délier le compte : **Alertes → Telegram → Délier**.

## 7. Sur mobile

- Barre du bas : **Aujourd'hui** · **À venir** · **Alertes** · **+ Ajouter**.
- Sous le titre : filtres **Toutes**, **Terminées** et vos catégories.
- **Installer l'app** : Android → Chrome, menu ⋮ → *Installer l'application*. iPhone → Safari, *Partager* → *Sur l'écran d'accueil* (obligatoire pour les notifications sur iPhone).
- **Partager vers FolioWork** (Android, app installée) : depuis WhatsApp, Gmail, Chrome… → *Partager* → **FolioWork**. Le texte arrive dans le champ « Nouvelle tâche » ; ajoutez une date et validez.

## 8. Sur ordinateur

| Touche | Action |
|---|---|
| `N` | nouvelle tâche |
| `/` | rechercher (titres **et** contenu des notes) |
| `Échap` | refermer la tâche ouverte |

## 9. Limites actuelles (v0.1)

- **Hors connexion** : si le réseau coupe un instant, vos modifications partent dès qu'il revient. Mais si vous **fermez l'app** sans réseau, les modifications non envoyées sont perdues, et l'app rouverte hors ligne n'affiche pas vos tâches.
- **Pas de tâches récurrentes** (rapport hebdo, etc.) pour l'instant.
- **Un seul utilisateur** : pas encore de partage avec l'équipe.
- Les dates ne sont reconnues **qu'en français**.
