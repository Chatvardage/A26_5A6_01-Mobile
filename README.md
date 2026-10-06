# A26_5A6_01-Mobile — Chatvardage (React Native / Expo)

Client mobile de clavardage connecté au Serveur-API (Gateway) de Chatvardage.

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

`npm start` lance la CLI Expo installée dans le projet avec le même exécutable Node, sans appeler `npx`. Cela évite l’erreur `spawn npx ENOENT` sous Windows ou WSL. Si la CLI Expo est absente, exécuter `npm ci` dans ce dépôt.

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

Si le backend est joignable par l'adresse locale de l'ordinateur, l'app la déduit et utilise le port 3000.

**Avec la stack Docker Infra**, le Gateway est volontairement publié sur `127.0.0.1:3000` : le PC peut le joindre, mais pas le téléphone. Sous Windows, créer une redirection dédiée, sans modifier les ports des microservices. Dans **PowerShell administrateur**, remplacer l'adresse d'exemple par l'IPv4 Wi-Fi du PC :

```powershell
$ip = "192.168.0.10"
netsh interface portproxy add v4tov4 listenport=3006 listenaddress=$ip connectport=3000 connectaddress=127.0.0.1
New-NetFirewallRule -DisplayName "Chatvardage API mobile 3006" -Direction Inbound -Protocol TCP -LocalAddress $ip -LocalPort 3006 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

Le port 3006 évite le port 3001, déjà utilisé localement par Auth-Service. Dans le fichier `.env` personnel de ce dépôt, définir `EXPO_PUBLIC_API_URL=http://192.168.0.10:3006` avec la même IP, puis relancer `npm start -- -c`. Cette URL explicite fonctionne aussi si Expo tourne dans WSL ou utilise un tunnel.

Tester `http://192.168.0.10:3006/api/health` dans le navigateur du téléphone : la réponse doit contenir `"status":"ok"`. Le téléphone doit être sur le même Wi-Fi ; un réseau invité ou scolaire peut isoler les appareils. Si l'IP du PC change, mettre à jour la redirection, la règle de pare-feu et `.env`.

Pour retirer cet accès (PowerShell administrateur, avec l'IP utilisée lors de sa création) :

```powershell
netsh interface portproxy delete v4tov4 listenport=3006 listenaddress=192.168.0.10
Remove-NetFirewallRule -DisplayName "Chatvardage API mobile 3006"
```

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
5. lance directement la CLI Expo locale avec Node et les options données (`npm start -- -c` vide le cache).

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
├── sans session : Login
└── avec session : Main (bottom-tabs) ─┬ DirectMessages   liste des messages privés
                                       ├ Servers          liste des serveurs
                                       ├ Search
                                       └ Preferences
                   Server        { serverId: string, title?: string }        salons d'un serveur
                   Conversation  { conversationId: string, title?: string }  messages d'un DM ou d'un salon
                   NewDirectMessage                                          choix du destinataire d'un nouveau DM (modale)
```

Parcours : `DirectMessages` → `Conversation` ; `DirectMessages` → « Nouveau » → `NewDirectMessage` → `Conversation` ; `Servers` → `Server` → `Conversation`.

- **Nouveau message privé** : le bouton « Nouveau » de l'en-tête des Messages privés ouvre, comme sur le desktop, des suggestions (interlocuteurs connus et 20 premiers membres de chaque serveur, via `/api/messages/conversations`, `/api/servers` et `/api/servers/:id/members`) puis, dès qu'on tape, une recherche par début de pseudo (`GET /api/users/search`, 20 caractères et 20 résultats au plus, 250 ms après la dernière frappe). Choisir quelqu'un ouvre `Conversation` sur `dm:<id>` ; la conversation n'apparaît dans la liste qu'après le premier message envoyé.
- `conversationId` vaut `dm:<uuid de l'interlocuteur>` ou `room:<uuid du salon>` ; `serverId` est un UUID. Les deux sont validés avant tout appel API (`parseConversationParams`, `parseServerParams`) : un identifiant invalide affiche une erreur, sans requête.
- Chaque liste a ses propres états (chargement, vide, erreur) : la panne d'une source n'empêche pas l'autre de s'afficher.
- Un serveur n'affiche que les salons que l'API autorise pour l'utilisateur ; la pastille d'un serveur est la somme des non-lus de ses salons.
- Login → Main bascule d'elle-même quand `useSession().status` passe à `signedIn` ; la déconnexion ramène à Login.
- Retour Android : de Conversation vers l'écran précédent (liste de DM ou salons du serveur), de Server vers Serveurs ; depuis Serveurs, Recherche ou Préférences, retour vers Messages privés (`backBehavior="firstRoute"`), puis l'application se ferme.

## Architecture

| Couche | Dossier | Rôle |
|---|---|---|
| Écrans / composants | `src/screens`, `src/components` | Affichage et transmission des actions, aucun appel réseau |
| Hooks | `src/hooks` | `useLoadable` pour les listes et `useMessages` pour l'historique, les événements temps réel et la pagination |
| Services | `src/services` | Client HTTP, erreurs (`ApiError`), messages REST et socket unique `/messages`, utilisateurs, serveurs et salons |
| Session | `src/session` | Contrat `useSession` (voir limites) |

## Limites connues

- **Session provisoire** : `SessionContext` garde le jeton en mémoire seulement (pas de SecureStore, de restauration au redémarrage ni de renouvellement). Le contrat (`status`, `user`, `signIn`, `signOut`) est celui que la session complète doit respecter.
- **Non-lus** : les listes affichent `unreadCount`, mais la source (`src/services/unreadSource.ts`) retourne 0 tant que le calcul et la persistance ne sont pas branchés. L'API n'expose pas d'état de lecture.
- **Dernier message d'un salon** : une requête `history?limit=1` par salon, seulement à l'ouverture d'un serveur (aucun endpoint dédié).
- **Rejoindre / quitter un serveur** : non implanté ici ; l'onglet Serveurs et l'écran Server sont l'emplacement prévu.
- **Écran Conversation** : historique REST, envoi/modification, réception temps réel Socket.IO et pagination sont branchés pour les DM et les salons. Les scénarios de coupure réseau, d'arrière-plan et de stabilité du défilement restent à confirmer sur appareil avec le backend.
- Notifications : non implantées.
- Comportement clavier / retour Android : vérifié par bundle Android et tests unitaires; à confirmer sur émulateur ou appareil.

## Vérifications

```bash
npx tsc --noEmit
npx expo lint
npm test
npm run test:coverage
npm run test:dependencies
npx expo-doctor
```

`npm run test:coverage` lance les tests avec couverture, affiche le résumé dans le terminal
et génère le rapport HTML dans `coverage/lcov-report/index.html`.

La couverture inclut `index.ts` et tous les fichiers TypeScript/TSX de `src`, sauf les tests
eux-mêmes. La commande exige **100 %** de couverture pour les lignes exécutables,
les instructions, les branches et les fonctions. Toute régression fait échouer la commande.
Les fichiers ne contenant que des types ou des réexportations peuvent afficher `0 %` dans
le tableau Jest : ils ne contiennent aucune ligne exécutable à couvrir. La colonne
« Uncovered Line #s » doit rester vide pour tous les fichiers : les chemins alternatifs
sont couverts, pas seulement les lignes du chemin principal.

### Audit des dépendances

```bash
npm audit
npm run test:dependencies
```

`xcode` utilise une surcharge ciblée de `uuid` vers **11.1.1**, qui corrige
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
La surcharge est conservée dans `package.json` et `package-lock.json`.
`test:dependencies` vérifie la version réellement chargée par `xcode`, la création
d'identifiants, l'ajout et la suppression de fichiers, et la lecture/écriture d'un
projet Xcode temporaire. Ce test ne remplace pas une compilation iOS sur macOS.
Retirer la surcharge lorsque `xcode` adoptera une version corrigée compatible.

Au **4 octobre 2026**, deux avis HIGH restent sans version corrigée publiée :

- [`node-forge` ≤ 1.4.0](https://github.com/advisories/GHSA-86w9-cpqp-85rv) :
  validation insuffisante des signatures RSA; utilisé par les outils Expo.
- [`braces` ≤ 3.0.3](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) :
  déni de service avec des motifs profondément imbriqués; utilisé via `micromatch`
  dans les chaînes d'outillage Expo/Metro et Jest.

L'audit propage ces avis aux dépendances parentes : le nombre d'alertes n'est pas
le nombre d'avis distincts. `npm audit` reste donc en échec; les alertes ne sont
ni masquées ni désactivées. Éviter les motifs et certificats non fiables transmis
aux outils concernés, sans considérer cette précaution comme un correctif.
Ne pas utiliser `npm audit fix --force` : la résolution proposée inclut une
rétrogradation incompatible vers Expo 44. Vérifier les nouveaux correctifs avec
`npm audit` et `npx expo install --check`, puis refaire les tests avant une mise à jour.
