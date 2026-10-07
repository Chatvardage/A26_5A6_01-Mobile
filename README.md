# A26_5A6_01-Mobile — Chatvardage (React Native / Expo)

Client mobile de clavardage connecté au Serveur-API (Gateway) de Chatvardage.

Au démarrage, une erreur réseau, un timeout, un HTTP 5xx ou un quota temporaire
pendant la validation `/me` conserve la session dans SecureStore. Un message et
le bouton « Réessayer » restent visibles ; aucun écran protégé ni credential
HTTP n'est activé avant la validation. Un 401 déclenche toujours le refresh,
et un échec de ce refresh nettoie la session.
Une erreur de lecture SecureStore affiche également « Réessayer » et préserve
les données stockées ; aucune session n'est activée avant une lecture et une validation réussies.
Le client HTTP respecte également
le signal d'annulation de l'appelant, en conservant son timeout propre ; une
annulation explicite propage l'erreur d'annulation sans la convertir en timeout.

## Versions

| Outil | Version |
|---|---|
| Node | 24 (testé), 22.9+ requis |
| Expo SDK | 57 |
| React Native / React | 0.86 / 19.2 |
| React Navigation | 7 (`native`, `native-stack`, `bottom-tabs`) |
| Tests | Jest 29 + jest-expo + Testing Library RN |

## Démarrage

Prérequis : Node 22.9+, l'app **Expo Go** (SDK 57) sur le téléphone, et le backend lancé depuis le dépôt Infra :

```bash
cd ../A26_5A6_01-Infra && docker compose up --build -d && ./scripts/healthcheck.sh
```

Puis, dans ce dépôt :

```bash
npm ci
npm test
npm start             # équivaut à « npx expo start », adapté automatiquement à WSL2
```

Scanner le QR code avec Expo Go (Android) ou l'appareil photo (iOS). Le téléphone doit être sur le même réseau que l'ordinateur.

> **Port de Metro** : `.env.development` fixe `RCT_METRO_PORT=8082`, car Adminer (stack Infra) occupe déjà le 8081. Rien à faire, `npm start` et `npx expo start` le prennent en compte.

### Quelle commande utiliser ?

| Votre situation | Commande | `.env` | Détails |
|---|---|---|---|
| **A.** Linux, macOS ou Windows natif, backend sur ce poste | `npm start` | Inutile | [Cas A](#cas-a--poste-sans-wsl2-backend-sur-le-même-poste) |
| **B.** WSL2, configuration standard de l'équipe | `npm start` | Inutile | [Cas B](#cas-b--wsl2-avec-tunnel-configuration-standard) |
| **C.** WSL2 en mode miroir | `npx expo start` | Inutile | [Cas C](#cas-c--wsl2-en-mode-miroir-alternative-durable) |
| **D.** Émulateur Android | `npm start`, puis `a` | Parfois | [Cas D](#cas-d--émulateur-android) |
| **E.** Backend sur une autre machine | `npm start` | Obligatoire | [Cas E](#cas-e--backend-sur-une-autre-machine) |

Dans tous les cas : le backend doit tourner (Infra) et, sur téléphone, l'appareil doit avoir accès à Internet (tunnel) ou être sur le même réseau Wi-Fi que l'ordinateur (sans réseau invité).

### Comment l'URL de l'API est choisie

L'app (`src/config/env.ts`) prend la première source disponible :

1. `EXPO_PUBLIC_API_URL` dans l'environnement du shell ;
2. `EXPO_PUBLIC_API_URL` dans le fichier `.env` personnel (ignoré par git, créé avec `cp .env.example .env`) ;
3. sous WSL2 seulement, `npm start` fournit l'URL détectée (voir cas B) ;
4. l'adresse de la machine qui exécute Metro, sur le port 3000 ;
5. `http://localhost:3000`.

À l'étape 4, seule une adresse locale (`localhost`, `*.local`, IP privée `10.x`, `172.16-31.x`, `192.168.x`) est retenue : un tunnel (exp.direct, ngrok, Cloudflare…) ne donne pas accès au backend et est ignoré. Après toute modification de `.env`, relancer avec le cache vidé (`npm start -- -c`).

### Cas A : poste sans WSL2, backend sur le même poste

```bash
npm start
```

Aucune configuration. Metro et le backend sont joignables par l'adresse locale de l'ordinateur ; l'app la déduit et utilise le port 3000.

### Cas B : WSL2 avec tunnel (configuration standard)

Sous WSL2, Metro et le backend vivent dans un réseau interne que le téléphone ne voit pas. Deux problèmes distincts, deux solutions :

| Problème | Solution | Qui la fournit |
|---|---|---|
| Le téléphone n'atteint pas **Metro** (Expo Go tourne en rond) | Tunnel `--tunnel` (ngrok) | `npm start` l'ajoute seul |
| Le téléphone n'atteint pas **l'API** (le Gateway n'écoute que sur `127.0.0.1` dans WSL) | Redirection Windows du port 3001 vers `localhost:3000` | **Une fois, à la main** (ci-dessous) |

**Configuration, une seule fois** — dans **PowerShell administrateur** (clic droit, « Exécuter en tant qu'administrateur ») :

```powershell
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1
New-NetFirewallRule -DisplayName "Chatvardage API 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Any
```

La redirection survit au redémarrage de Windows. Pour la vérifier : `netsh interface portproxy show v4tov4`.

**Utilisation quotidienne :**

```bash
npm start
```

Au premier lancement, accepter l'installation de `@expo/ngrok`. `scripts/start.js` fait alors, dans l'ordre :

1. détecte WSL2 ;
2. ajoute `--tunnel` si aucune option de réseau (`--tunnel`, `--lan`, `--localhost`) n'est passée ;
3. si `EXPO_PUBLIC_API_URL` n'est définie ni dans l'environnement ni dans `.env`, interroge Windows (`powershell.exe`) pour l'IP Wi-Fi **actuelle** et utilise `http://<cette IP>:3001` ; l'IP peut donc changer d'un jour à l'autre sans rien modifier ;
4. avertit si la redirection du port 3001 est absente ;
5. lance `npx expo start` avec les options données (`npm start -- -c` vide le cache).

**Vérification** : `http://<IP-Wi-Fi-de-Windows>:3001/api/health` doit répondre dans le navigateur du téléphone (IP visible dans le message `[start] WSL2 : API détectée à …`, ou avec `ipconfig`, ligne « Adresse IPv4 » du Wi-Fi).

**Limites du script :**

- il ne peut pas créer la redirection ni la règle de pare-feu (droits administrateur) ;
- il suppose que le téléphone est sur le même Wi-Fi que l'ordinateur pour joindre l'API (le tunnel, lui, passe par Internet) ;
- si `powershell.exe` est inaccessible depuis WSL, il affiche un avertissement : définir alors `EXPO_PUBLIC_API_URL` dans `.env` à la main (`http://<IP-Wi-Fi>:3001`) ;
- plusieurs cartes réseau (VPN, VirtualBox, Hyper-V) : il choisit la carte de la route par défaut ; si l'IP détectée est mauvaise, forcer l'URL dans `.env`.

### Cas C : WSL2 en mode miroir (alternative durable)

Le mode miroir rend WSL directement joignable depuis le réseau : ni tunnel ni redirection.

1. Créer ou modifier `C:\Users\<nom>\.wslconfig` :
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
2. Dans PowerShell administrateur :
   ```powershell
   wsl --shutdown
   Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
   New-NetFirewallRule -DisplayName "Chatvardage" -Direction Inbound -Protocol TCP -LocalPort 3000,8082 -Action Allow -Profile Any
   ```
3. Relancer le backend (Infra), puis, dans ce dépôt :
   ```bash
   npx expo start
   ```

Utiliser `npx expo start` et **non** `npm start` : le script ajouterait le tunnel et le port 3001, inutiles en mode miroir. L'app déduit l'adresse du poste, port 3000. Si le test `curl.exe http://<IP-Wi-Fi>:3000/api/health` échoue dans PowerShell, c'est le pare-feu.

Prérequis : Windows 11 22H2 ou plus récent et WSL à jour (`wsl --update`).

### Cas D : émulateur Android

```bash
npm start      # puis « a » dans le terminal
```

Dans un émulateur, `localhost` désigne l'émulateur lui-même. Si la connexion échoue, définir dans `.env` : `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` (alias de l'ordinateur hôte). Sous WSL2, l'émulateur tourne côté Windows : voir aussi le cas B pour joindre l'API.

### Cas E : backend sur une autre machine

Définir dans `.env` l'adresse de cette machine :

```bash
cp .env.example .env
# EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
```

Puis `npm start -- -c`. Cette machine doit autoriser le port 3000 dans son pare-feu.

### Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Expo Go tourne en rond, puis page d'erreur bleue | Le téléphone n'atteint pas Metro | Sous WSL2, utiliser `npm start` (tunnel) ou le mode miroir ; sinon vérifier le Wi-Fi commun |
| « Impossible de joindre le serveur » à la connexion | Le téléphone n'atteint pas l'API | Tester `/api/health` dans le navigateur du téléphone (cas B) ; vérifier la redirection `netsh`, le pare-feu, l'URL affichée par `npm start` |
| Le bouton de connexion tourne puis erreur après 10 s | Délai de requête dépassé (API injoignable) | Idem ci-dessus |
| `[start] Aucune redirection du port 3001…` | La redirection `netsh` du cas B manque | La créer (PowerShell administrateur) |
| `[start] IP Windows introuvable…` | `powershell.exe` inaccessible | Définir `EXPO_PUBLIC_API_URL` dans `.env` |
| L'IP a changé (autre réseau, redémarrage du routeur) | — | Avec `npm start` : rien à faire. Avec un `.env` fixe : le mettre à jour, puis `npm start -- -c` |
| Avertissement jaune « Cannot connect to Expo CLI » | Rechargement à chaud perdu (fréquent en tunnel) | Sans gravité : secouer le téléphone, puis *Reload* |
| « Port 8081 is being used by another process » | Adminer (Infra) | Vérifier que `.env.development` est présent (Metro utilise le 8082) |
| Port 8082 « running this app in another window » | Un Metro est déjà lancé | Le fermer (`Ctrl+C`) avant d'en relancer un |

> **Web non ciblé** : `app.json` fixe `web.output` à `single` (SPA), car le rendu statique exige Expo Router, que ce projet n'utilise plus. L'application cible Android et iOS.

## Navigation

Routes centralisées dans [`src/navigation/routes.ts`](src/navigation/routes.ts), organisées comme l'app desktop : messages privés d'un côté, serveurs et leurs salons de l'autre.

```text
RootStack (native-stack)
├── sans session : Login / Register
└── avec session : Main (bottom-tabs) ─┬ DirectMessages   liste des messages privés
                                       ├ Servers          liste des serveurs
                                       ├ Search
                                       └ Preferences
                   Server        { serverId: string, title?: string }        salons d'un serveur
                   Conversation  { conversationId: string, title?: string }  messages d'un DM ou d'un salon
```

Parcours : `DirectMessages` → `Conversation` ; `Servers` → `Server` → `Conversation`.

- `conversationId` vaut `dm:<uuid de l'interlocuteur>` ou `room:<uuid du salon>` ; `serverId` est un UUID. Les deux sont validés avant tout appel API (`parseConversationParams`, `parseServerParams`) : un identifiant invalide affiche une erreur, sans requête.
- Chaque liste a ses propres états (chargement, vide, erreur) : la panne d'une source n'empêche pas l'autre de s'afficher.
- Un serveur n'affiche que les salons que l'API autorise pour l'utilisateur ; la pastille d'un serveur est la somme des non-lus de ses salons.
- Login → Main bascule d'elle-même quand `useSession().status` passe à `signedIn` ; la déconnexion ramène à Login.
- Retour Android : de Conversation vers l'écran précédent (liste de DM ou salons du serveur), de Server vers Serveurs ; depuis Serveurs, Recherche ou Préférences, retour vers Messages privés (`backBehavior="firstRoute"`), puis l'application se ferme.

## Architecture

| Couche | Dossier | Rôle |
|---|---|---|
| Écrans / composants | `src/screens`, `src/components` | Affichage et transmission des actions, aucun appel réseau |
| Hooks | `src/hooks` | `useLoadable` (états loading / empty / error / ready, réessai, rafraîchissement) et ses usages `useDirectMessages`, `useServers`, `useServerChannels` et `useConversationHistory` |
| Services | `src/services` | Client HTTP, traduction des erreurs (`ApiError`), messages privés, serveurs et salons, historique |
| Session | `src/session` | Contrat `useSession` (voir limites) |

## Limites connues

- **Session** : SecureStore, validation au démarrage, rotation réelle via Auth-Service/Gateway, refresh partagé et retour Login après échec. Voir ci-dessous.
- **Non-lus** : les listes et les badges d'onglets utilisent `GET /api/messages/unread` (état de lecture en base, donc juste après un redémarrage). Les compteurs se rechargent au démarrage, à chaque reconnexion du canal temps réel et au retour au premier plan.
- **Dernier message d'un salon** : une requête `history?limit=1` par salon, seulement à l'ouverture d'un serveur (aucun endpoint dédié).
- **Rejoindre / quitter un serveur** et **ouvrir un nouveau message privé** : non implantés ici ; l'onglet Serveurs et l'écran Server sont l'emplacement prévu.
- **Écran Conversation** : historique en lecture seule; l'envoi, le temps réel, la pagination et la modification ne sont pas branchés. La recherche est décrite ci-dessous ; un résultat d'une recherche dans une conversation ramène à la conversation sans défiler jusqu'au message.
- **Notifications** : locales seulement (voir ci-dessous). Aucune notification push : le jeton d'appareil n'est pas enregistré côté API.
- Comportement clavier / retour Android : vérifié par bundle Android et tests unitaires; à confirmer sur émulateur ou appareil.

## Recherche, réseau et notifications

**Recherche** (`GET /api/messages/search`, 2 à 100 caractères, 20 résultats par page, curseur `nextCursor`)
- Onglet **Recherche** : toutes les conversations accessibles ; toucher un résultat ouvre `Conversation` avec son `conversationId`.
- Bouton loupe dans l'en-tête d'une **conversation** (message privé ou salon) : route `ConversationSearch { conversationId, title? }`, recherche limitée à cette conversation (`conversationId=` côté API), comme sur le client Web. Les deux interlocuteurs d'un message privé peuvent chacun chercher dans leurs anciens messages ; dans un salon, la recherche porte sur le salon affiché. Le droit de lecture est vérifié par l'API (403 / 404).
- `useSearch` : délai de frappe de 350 ms, annulation de la requête précédente, pagination sans doublon (`Plus de résultats` ou fin de liste).

**Réseau** : `network.adapter` (NetInfo) + état du canal temps réel → `useConnection` (`online`, `reconnecting`, `offline`) → bandeau `ConnectionStatus` affiché au-dessus de l'application avec une session ouverte. Le canal Socket.IO se reconnecte seul ; à chaque `connexion.prete`, les compteurs de non-lus sont rechargés par l'API et l'historique de la conversation ouverte est rechargé (fusion sans doublon).

**Texte non envoyé** : `drafts.adapter` (AsyncStorage) conserve un brouillon par conversation, restauré à la réouverture et après un redémarrage. Un envoi qui échoue laisse le texte dans le champ. Les brouillons sont effacés à la déconnexion. Ils ne contiennent aucun jeton (les jetons restent dans SecureStore).

**Notifications** (`notifications.adapter`, expo-notifications)
- Notification **locale** quand un message arrive dans une conversation qui n'est pas affichée (ou quand l'application est en arrière-plan). Elle contient le pseudo et « Nouveau message », jamais le texte ; son seul payload est `conversationId`, validé avant d'ouvrir `Conversation` (toucher pendant que l'application tourne, ou lancement à froid).
- Permission : `granted`, `denied`, `undetermined` ou `unavailable` (web, module absent). Demandée une seule fois au premier lancement ; l'état et un bouton « Activer » / « Ouvrir les réglages » sont dans Préférences.
- Le **badge** (onglets Messages privés et Serveurs, listes) reste fonctionnel sans permission. Le badge de l'icône n'est mis à jour que si la permission est accordée.

Limites : le canal temps réel est coupé par le système peu après le passage en arrière-plan, donc aucune notification n'arrive application fermée (il faudrait du push, hors périmètre). **Expo Go sur Android (SDK 53+)** : le simple chargement d'`expo-notifications` y lève une erreur. L'adaptateur ne charge donc pas le module dans ce cas : l'application démarre, les notifications sont « indisponibles » (affiché dans Préférences) et seul le badge dans l'application fonctionne. Pour tester les notifications locales sur Android, utiliser une development build (`npx expo run:android` ou `eas build --profile development`). Sur iOS, Expo Go permet de les tester. Les salons sont rejoints pour les alertes après chaque changement de conversation (délai de 0,8 s) car l'écran d'un salon quitte sa room en se fermant.

## Vérifications

```bash
npx tsc --noEmit
npx expo lint
npm test
npx expo-doctor
```


## Authentification mobile

Les écrans Login/Register passent par `useSession` et le service Auth existant.
`SessionManager` porte la machine `loading / signedOut / signedIn`; le Context la
publie à React. `storage.adapter` conserve uniquement les deux tokens et les
champs publics de l'utilisateur dans **expo-secure-store ~57.0.4**. Aucun mot de
passe n'est conservé. iOS utilise `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; le plugin
SecureStore configure la sauvegarde Android. Android/iOS sont les cibles.

Au lancement, la navigation affiche un indicateur de restauration jusqu'à la
lecture SecureStore et la validation `/api/auth/me`. Un 401 provoque une rotation
par `POST /api/auth/refresh`; tout échec termine la restauration en `signedOut`.
Les appels publics login/register/refresh/logout n'envoient pas le Bearer.
Les requêtes protégées partagent un seul renouvellement et ne sont reprises
qu'une fois. Les générations de session empêchent les réponses tardives de
réactiver une session après déconnexion, y compris en StrictMode.

Logout lance immédiatement le nettoyage local indépendamment du réseau, puis
révoque la famille via `POST /api/auth/logout`. Si l'API native de suppression
SecureStore échoue, l'utilisateur et le token HTTP sont effacés et un message
propose de réessayer le nettoyage; une panne physique du stockage ne peut pas
être masquée comme une suppression réussie. La persistance est sérialisée pour
éviter qu'une écriture en cours rétablisse une session après logout.

Le backend émet des accès de 15 minutes et des familles de refresh de 30 jours
maximum. Les rotations ne prolongent pas ces 30 jours. L'ancien refresh token
ne peut plus renouveler mais permet encore de révoquer toute sa famille.
Appliquer les migrations Auth avec le Compose habituel avant d'utiliser ces routes.
Voir le [contrat central](../A26_5A6_01-Infra/docs/api/authentification.md#sessions-renouvelables--register-login-refresh-et-logout).

### Validation

```bash
npm install
npm run typecheck
npm run lint
npm test -- --runInBand
npm test -- --coverage --runInBand
npx expo-doctor
npx expo export --platform android
```

Le moteur de tests `test-renderer` est fixé à 1.2.0 pour React 19.2 (la version
1.3.0 tire react-reconciler 0.34, qui exige React 19.3).

La couverture inclut toute la source `src/` et le point d'entrée `index.ts`.
Les seuils Jest exigent 100 % des instructions, branches, fonctions et lignes.
Les fichiers qui ne contiennent que des types ou réexports n'ont aucune unité
exécutable à couvrir. Aucun fichier applicatif n'est exclu du calcul.

L'intégration réseau réelle se lance avec `npm run test:auth-e2e` après build du
Gateway et démarrage d'Auth sur une base **de test** migrée. Fournir
`AUTH_E2E_SERVICE_URL` et `AUTH_E2E_JWT_SECRET` (clé temporaire de cette instance,
jamais une clé de production). Ce test utilise le vrai code HTTP/Auth/session
Mobile avec le vrai Gateway/Auth/PostgreSQL. L'API native SecureStore est remplacée
par un adaptateur en mémoire sous Node; les tests Jest vérifient séparément son
contrat. Des JWT expirés sont signés avec la clé temporaire pour exercer la
restauration et les 401 concurrents sans attendre 15 minutes. Aucun credential
n'est imprimé. Les interactions natives restent à confirmer sur appareil.

Pour valider également l'image Docker de la Gateway, fournir
`AUTH_E2E_GATEWAY_URL` avec l'URL de cette instance isolée. Le script utilise
alors cette Gateway existante au lieu de démarrer une Gateway locale.

### Avis npm en attente de correctif compatible

Au 4 octobre 2026, `npm audit` signale des avis transitifs sur braces <=3.0.3
(GHSA-vfj7-8cjw-p6xm), node-forge <=1.4.0 (GHSA-86w9-cpqp-85rv) et uuid <11.1.1
(GHSA-w5hq-g745-h8pq). Les versions npm actuelles de braces/node-forge restent
concernées. Les corrections automatiques proposées changent des versions majeures
ou rétrogradent Expo vers SDK 44. Ne pas exécuter `npm audit fix --force` : la
compatibilité SDK 57 doit être conservée. Réexaminer ces avis dès qu'une version
corrigée compatible est disponible; Expo Doctor et les tests ne remplacent pas
cet audit. Les résultats exacts de l'audit sont consignés dans le rapport de tâche.
