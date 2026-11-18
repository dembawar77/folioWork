# Mettre FolioWork en ligne

Tout se fait depuis des pages web, **sans terminal**. Les intitulés sont donnés tels qu'ils apparaissent : en français pour Google et Cloudflare, en anglais pour Convex (son tableau de bord n'existe qu'en anglais). Compte environ 30 minutes la première fois.
Coût : 0 FCFA (offres gratuites de Convex, Cloudflare, Google et Telegram).

Ordre à respecter : **1 → 6**. Chaque étape a besoin de la précédente.

---

## 1. Convex (le backend)

1. Créez un compte sur **dashboard.convex.dev** (connexion avec GitHub).
2. **Create project** → nom : `foliowork`.
3. Ouvrez le déploiement **Production** : cliquez sur le nom du projet en haut à gauche, puis choisissez **Production**.
   ⚠️ Ne confondez pas avec **Project settings** (réglages du projet) : la clé n'y est pas.
4. Dans le menu de gauche du déploiement Production, ouvrez **Settings** (engrenage en bas) et récupérez :
   - **HTTP Actions URL**, qui se termine par **`.convex.site`** (nécessaire pour Google à l'étape 2) ;
   - une **Production Deploy Key** : cliquez sur *Generate*, copiez-la tout de suite (elle ne s'affiche qu'une fois) et gardez-la pour l'étape 5.

## 2. Google (le bouton « Continuer avec Google »)

La console Google s'affiche en français.

1. Allez sur **console.cloud.google.com** → **Sélectionner un projet** → **Nouveau projet** → nom : `FolioWork`.
2. Menu ☰ → **API et services** → **Écran de consentement OAuth** (ou **Google Auth Platform**) : type d'utilisateur *Externe*, nom de l'application `FolioWork`, votre e-mail. Dans **Audience** / **Utilisateurs tests**, ajoutez votre adresse Gmail (ou publiez l'application).
3. **API et services** → **Identifiants** → **Créer des identifiants** → **ID client OAuth** :
   - Type d'application : **Application Web**
   - **URI de redirection autorisés** → **Ajouter un URI** : `https://VOTRE-DEPLOIEMENT.convex.site/oauth/google/callback`
     (l'adresse `.convex.site` de l'étape 1, suivie de `/oauth/google/callback`)
   - **Créer**
4. Copiez l'**ID client** et le **Code secret du client**.

## 3. Telegram (le bot)

1. Dans Telegram, ouvrez **@BotFather** → `/newbot`.
2. Donnez un nom (`FolioWork`) puis un identifiant qui finit par `bot` (ex. `foliowork_aloyse_bot`).
3. BotFather vous donne un **token** (`123456:ABC…`). Ne le partagez avec personne.

## 4. Variables d'environnement Convex

Dans Convex → **Settings → Environment Variables**, ajoutez :

| Nom | Valeur |
|---|---|
| `AUTH_GOOGLE_CLIENT_ID` | Client ID Google (étape 2) |
| `AUTH_GOOGLE_CLIENT_SECRET` | Client secret Google (étape 2) |
| `SITE_URL` | l'adresse de l'app, ex. `https://foliowork.pages.dev` (connue à l'étape 5, mettez-la dès maintenant) |
| `TELEGRAM_BOT_TOKEN` | token de BotFather (étape 3) |
| `TELEGRAM_BOT_USERNAME` | identifiant du bot, **sans** `@` |
| `VAPID_SUBJECT` | `mailto:votre-adresse@email.com` |

Les trois dernières clés (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TELEGRAM_WEBHOOK_SECRET`) se génèrent à l'étape 6, une fois le code déployé.

## 5. Cloudflare Pages (l'hébergement)

Le tableau de bord Cloudflare s'affiche en français.

1. **dash.cloudflare.com** → menu de gauche **Calcul** → **Workers et Pages** → **Créer une application**.
2. L'écran propose d'abord *Workers* : choisissez l'onglet ou le lien **Pages** (« Vous cherchez à déployer Pages ? Commencer »).
3. **Importer un dépôt Git** (ou **Connecter à Git**) → connectez GitHub → dépôt **folioWork** → **Commencer la configuration**.
4. Remplissez :

   | Champ | Valeur |
   |---|---|
   | Nom du projet | `foliowork` |
   | Branche de production | la branche du code (ex. `main`) |
   | Préréglage de framework | **Aucun** |
   | Commande de build | `npm run build:cloudflare` |
   | Répertoire de sortie de build | `dist` |

5. **Variables d'environnement (avancé)** → ajoutez :
   - `CONVEX_DEPLOY_KEY` = la Deploy Key de l'étape 1
   - `NODE_VERSION` = `22`
6. **Enregistrer et déployer**. Chaque build envoie aussi le backend sur Convex.
7. L'adresse finale est `https://NOM-DU-PROJET.pages.dev`. Si elle diffère de celle mise dans `SITE_URL`, corrigez `SITE_URL` dans Convex.

## 6. Clés de notification et branchement du bot

Dans Convex → **Functions** :

1. Ouvrez **`notify:generateSecrets`** → **Run function**. Copiez les trois valeurs renvoyées dans **Settings → Environment Variables** :
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TELEGRAM_WEBHOOK_SECRET`.
   ⚠️ Ne relancez pas cette fonction plus tard : de nouvelles clés désactiveraient les appareils déjà abonnés.
2. Ouvrez **`telegram:setup`** → **Run function**. Le résultat doit afficher `webhookSet: true`.

## C'est prêt

1. Ouvrez l'app → **Continuer avec Google**.
2. **Alertes → Activer les notifications** sur l'ordinateur, puis refaites-le sur le téléphone.
   Sur iPhone : Safari → Partager → **Sur l'écran d'accueil**, puis ouvrez l'app depuis l'icône avant d'activer.
3. **Alertes → Envoyer un test**.
4. **Alertes → Relier Telegram** → appuyez sur **Démarrer** dans Telegram.
5. Écrivez au bot : `Relancer imprimeur demain 10h #Créa !urgent`.

---

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| « redirect_uri_mismatch » à la connexion | l'URI de redirection Google ne correspond pas exactement à `…convex.site/oauth/google/callback` |
| Retour sur la page de connexion après Google | `SITE_URL` ne correspond pas à l'adresse de l'app |
| « Notifications web non configurées » | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` absents (étape 6) |
| Le bot ne répond pas | `telegram:setup` pas lancé, ou `TELEGRAM_WEBHOOK_SECRET` défini après l'avoir lancé : relancez `telegram:setup` |
| Le build Cloudflare échoue sur une variable manquante | les variables de l'étape 4 doivent exister **avant** le premier build |

Les journaux d'exécution sont dans Convex → **Logs**.
