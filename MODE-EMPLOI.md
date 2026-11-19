# FolioWork : mode d'emploi

## 1. Ajouter une tâche

**Sur mobile** : bouton rond **+ Ajouter** en bas. **Sur ordinateur** : **Nouvelle tâche** en haut à droite, ou la touche `N`. L'écran « Nouvelle tâche » s'ouvre : écrivez la tâche en une phrase, puis touchez les raccourcis si besoin (**Quand** : ce soir, demain, lundi… ; **Priorité** ; **Catégorie** ; **Répéter** ; **En attente de**). Un raccourci touché l'emporte sur ce que la phrase indiquait.

Sur ordinateur, le champ en haut de la liste reste disponible pour aller encore plus vite.

Écrivez par exemple :

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
| `tous les jours`, `en semaine`, `chaque lundi`, `toutes les 2 semaines`, `tous les mois` | tâche **récurrente** |
| `@Moussa`, `@agence_vision` | **en attente** de cette personne, relance tous les 2 jours |

Si une catégorie est sélectionnée à gauche (ou dans les filtres sur mobile), la nouvelle tâche la reçoit automatiquement.

## 2. Les vues

| Vue | Contenu |
|---|---|
| **Aujourd'hui** | tâches dues aujourd'hui **+ tâches en retard** |
| **À venir** | tâches avec une échéance après aujourd'hui |
| **Toutes** | toutes les tâches ouvertes, **y compris celles sans date** |
| **Terminées** | les tâches cochées, les plus récentes en haut |

⚠️ Une tâche **sans échéance** n'apparaît que dans **Toutes**.

**Aujourd'hui** sépare **En retard** et **Aujourd'hui**, avec une barre de progression de la journée. **À venir** est classé par jour (Demain, lundi 23 novembre…).

Les signaux :

- **Rouge** : en retard (« En retard · Hier 16:00 »).
- **Ambre** : échéance dans moins de 2 h (« Dans 45 min »).
- **URGENT** / **HAUTE** en capitales : la priorité que vous avez choisie.

## 3. Ouvrir une tâche

Cliquez sur une tâche pour la déplier. Vous pouvez :

- **renommer** la tâche directement dans son titre ;
- changer l'**échéance**, le **rappel** (pas de rappel, à l'heure, 15 min, 1 h ou 1 jour avant), la **priorité**, la **catégorie** ;
- écrire une **note** (voir ci-dessous) ;
- **supprimer** la tâche (en bas à droite).

Le **rond** à gauche termine la tâche. Un bandeau **Annuler** apparaît 5 secondes en cas d'erreur.

**Sur mobile, glissez** une tâche : **vers la droite** pour la terminer, **vers la gauche** pour la reporter à demain (même heure, même délai de rappel). Sur ordinateur : bouton **Reporter à demain** dans la tâche ouverte. Dans **Terminées**, un nouveau clic la rouvre.

## 3 bis. Tâches récurrentes

Pour une tâche qui revient (rapport hebdo, point du lundi, reporting mensuel) :

- à la saisie : `Rapport hebdo chaque lundi 9h #Admin`, `Point équipe tous les jours 10h`, `Reporting Meta Ads tous les mois le 5 décembre` ;
- ou après coup : ouvrez la tâche → **Répéter**.

Quand vous **terminez** une occurrence, la suivante est créée aussitôt, avec la même catégorie, la même priorité, le même délai de rappel et la même note, **cases décochées**. Une occurrence terminée en retard repart à la prochaine date à venir (pas de rattrapage). Une tâche rouverte par erreur retire l'occurrence suivante si vous n'y avez pas touché.

Le symbole ↻ et le rythme (« Chaque lundi », « Lun–ven ») s'affichent sous le titre. Pour arrêter : **Répéter → Jamais**.

## 3 ter. En attente de… et relances WhatsApp

Pour tout ce qui dépend de quelqu'un d'autre (BAT, devis, validation) :

- à la saisie : `BAT affiche Kirène jeudi @Moussa` ;
- ou dans la tâche : **Mettre en attente de…** → nom, numéro WhatsApp (facultatif, mémorisé ensuite), rythme de relance (1 à 7 jours).

FolioWork vous rappelle **à 9h** quand il est temps de relancer, avec le bouton **Relancer sur WhatsApp** : WhatsApp s'ouvre avec le message déjà rédigé (« Bonjour Moussa, je reviens vers vous au sujet de « BAT affiche Kirène » (prévu jeudi à 10:00). Où en sommes-nous ? Merci. »). Vous pouvez le modifier avant d'envoyer.

Après **Relancer sur WhatsApp**, FolioWork demande **« Message envoyé ? »** : la relance n'est comptée que si vous répondez **Oui, j'ai relancé**. Si vous avez relancé autrement (appel, e-mail, de vive voix) : **J'ai relancé**.

Une personne **à relancer reste dans la liste** (en ambre) tant que vous n'avez pas choisi :

- **J'ai relancé** : prochaine relance au rythme choisi ;
- **Reçu** : la personne a répondu, la tâche n'attend plus personne (elle reste ouverte) ;
- **Reporter** : demain, dans 2 jours ou dans 1 semaine.

Vous pouvez donc ouvrir la vue **En attente** quand ça vous arrange et faire toutes vos relances d'un coup. Sans action de votre part, la notification revient le lendemain à 9h.
- La vue **En attente** regroupe tout par personne ; « À relancer » s'affiche en ambre.
- Sur Telegram : boutons **Relancer sur WhatsApp**, **J'ai relancé**, **Reçu**, **Dans 2 jours**.

La personne relancée n'a besoin ni de compte ni de l'app.

## 3 quater. La boîte de dépôt

Un lien à donner aux autres services pour qu'ils vous soumettent leurs demandes, **sans compte** :

1. **Alertes → Boîte de dépôt** : choisissez l'adresse (ex. `…/demande/aloyse`), un message d'accueil facultatif (« Prévoir 48 h pour un visuel »), puis **Activer**.
2. **Copier le lien** ou **Partager sur WhatsApp**.

Vos collègues remplissent : la demande en une ligne, les détails, pour quand, « c'est urgent », leur nom, leur service et leur WhatsApp (facultatif).

Chaque demande :

- devient une tâche dans la catégorie **Demandes** (priorité **Haute** si « urgent »), échéance à 9h le jour demandé ;
- vous est signalée par **notification** et sur **Telegram** ;
- reste en haut de **Aujourd'hui**, section bleue **Nouvelles demandes**, jusqu'à ce que vous l'ayez ouverte puis refermée ;
- propose **Répondre sur WhatsApp** avec un accusé de réception prêt à envoyer.

Protection : 8 demandes maximum par 10 minutes et 60 par jour, et un piège à robots. **Désactiver** coupe le lien immédiatement. Si vous changez d'adresse, l'ancienne vous reste réservée à vie : un ancien lien affiche « Ce formulaire a changé d'adresse » avec un bouton vers la nouvelle, et ne peut jamais être repris par quelqu'un d'autre.

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
- Si aucun appareil ni Telegram n'a accepté le rappel, la tâche l'indique en rouge (« Rappel non délivré »). En cas de panne passagère, FolioWork réessaie 3 fois (après 2, 10 puis 30 minutes).

**Activer un nouvel appareil** : sur cet appareil, **Alertes → Activer les notifications**, puis **Envoyer un test**.

**Notifications discrètes** (Alertes) : l'écran n'affiche que « Vous avez un rappel », sans titre ni note. À activer sur un ordinateur partagé ou un écran visible en réunion. Se **déconnecter** retire aussi les notifications de cet appareil. Les boutons d'une notification ne servent qu'une fois et expirent au bout de 12 h.

**Résumé du matin** : **Alertes → Résumé quotidien**, choisissez l'heure. Vous recevez chaque matin les tâches du jour et celles en retard.

## 5 bis. Apparence (mode sombre)

**Alertes → Apparence** : **Automatique** (par défaut, suit le réglage du téléphone ou de l'ordinateur, y compris le passage en sombre programmé le soir), **Clair** ou **Sombre**. Le choix est propre à chaque appareil.

## 5 ter. Exporter mes données

**Alertes → Mes données → Exporter mes données**, puis :

- **Sauvegarde complète** (`foliowork-AAAA-MM-JJ.json`) : tout le compte (tâches ouvertes et terminées, notes avec leur mise en forme, contacts, réglages, boîte de dépôt) ;
- **Tableau Excel** (`.csv`) : une ligne par tâche (titre, statut, échéance, priorité, catégorie, répétition, personne attendue, demandeur, note…), à ouvrir dans Excel ou Google Sheets.

Sur téléphone, le menu de partage s'ouvre : choisissez **Enregistrer dans Fichiers**, Drive ou votre e-mail. Sur ordinateur, le fichier part dans *Téléchargements*. La date du dernier export s'affiche sous le bouton.

### Sauvegarde automatique (Telegram)

Juste en dessous : **Sauvegarde automatique sur Telegram**. Activez-la une fois. Chaque **dimanche à 20h** (heure de votre fuseau), le bot vous envoie le fichier `foliowork-AAAA-MM-JJ.json`, le même que la sauvegarde complète. Vous gardez ainsi une copie par semaine dans la conversation, hors de FolioWork, sans y penser.

- Il faut d'abord relier Telegram (section **Telegram** plus haut).
- **Envoyer maintenant sur Telegram** : une copie immédiate, par exemple avant une grosse réorganisation. Vous pouvez aussi taper `/sauvegarde` au bot.
- La date du dernier envoi et celle du prochain s'affichent sous l'interrupteur. Si Telegram ne répond pas, deux nouveaux essais partent seuls (30 min puis 2 h) et la raison de l'échec s'affiche en rouge.
- Le fichier transite par Telegram et reste dans votre conversation. Ne l'activez pas si vos notes contiennent des informations qui ne doivent pas quitter l'app.

## 6. Le bot Telegram

Écrivez au bot comme dans le champ de saisie :

```
Relancer imprimeur jeudi 10h #Admin !haute
```

La tâche apparaît aussitôt dans l'app, sur tous vos appareils.

| Commande | Effet |
|---|---|
| `/aujourdhui` | liste des tâches du jour et des retards |
| `/sauvegarde` | recevoir tout de suite une copie complète du compte (fichier .json) |
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
| `/` | rechercher (titres **et** contenu des notes ; dans **Terminées**, tout l'historique) |
| `Échap` | refermer la tâche ouverte |

## 9. Hors connexion

FolioWork garde vos tâches et vos notes sur l'appareil. Sans réseau :

- l'app **s'ouvre** et affiche vos tâches, vos notes et les 300 dernières terminées ;
- vous pouvez **ajouter**, **terminer**, **reporter**, **modifier**, **supprimer** une tâche et **écrire dans une note** : tout s'affiche aussitôt ;
- une barre noire indique **« Hors ligne · 2 modifications en attente d'envoi »**.

Les modifications partent seules, dans l'ordre, dès que le réseau revient, **même si vous avez fermé l'app entre-temps**. Rien n'est envoyé en double.

Restent réservés au réseau : les relances (« En attente de »), la boîte de dépôt, les réglages d'**Alertes** et la recherche dans tout l'historique des terminées. Une tâche créée hors ligne reçoit son rappel une fois arrivée au serveur.

Se **déconnecter** efface toutes les données de l'appareil (une confirmation est demandée s'il reste des modifications non envoyées).

## 10. Limites actuelles (v0.1)

- **Un seul utilisateur** : pas encore de partage avec l'équipe.
- **Pas encore de restauration** : les sauvegardes (.json) contiennent tout, mais l'app ne sait pas encore les réimporter.
- Les dates ne sont reconnues **qu'en français**.
