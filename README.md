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
npm start             # déduit l'IP de l'API si nécessaire puis lance Expo, avec adaptation WSL2
```

`npm start` déduit l'IP LAN de l'API dans `.env` hors WSL2 seulement si aucune URL n'est
encore configurée, puis lance la CLI Expo installée dans le projet avec le même exécutable
Node, sans appeler `npx`. Une URL déjà présente dans l'environnement ou dans `.env` est
conservée (notamment `10.0.2.2`, une adresse distante ou le mode miroir WSL2). Cela évite
l'erreur `spawn npx ENOENT` sous Windows ou WSL. Si la CLI Expo est absente, exécuter
`npm ci` dans ce dépôt.

Le projet utilise React Navigation, pas Expo Router. La commande de boilerplate `reset-project` a été retirée : elle déplaçait ou supprimait `src` et `scripts`, puis générait une structure Expo Router incompatible.

Scanner le QR code avec Expo Go (Android) ou l'appareil photo (iOS). Le téléphone doit être sur le même réseau que l'ordinateur.

> **Port de Metro** : `.env.development` fixe `RCT_METRO_PORT=8082`, car Adminer (stack Infra) occupe déjà le 8081. Rien à faire, `npm start` et `npx expo start` le prennent en compte.

### Fichiers locaux et secrets

Git ignore les fichiers `.env` personnels, les identifiants locaux (`credentials.json`, `.npmrc`), les clés de signature, les journaux, les rapports de couverture et les caches générés. Seuls `.env.example` (modèle sans valeur réelle) et `.env.development` (port Metro partagé uniquement) sont versionnés parmi les fichiers `.env`.

Ne jamais placer de secret dans une variable `EXPO_PUBLIC_*` : sa valeur est intégrée à l'application et accessible au client. Une règle `.gitignore` ne protège pas un fichier déjà suivi ni l'historique Git ; un secret déjà publié doit être révoqué, même après suppression du fichier.

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
4. l'adresse de la machine qui exécute Metro, sur le port mobile 3006 ;
5. `http://localhost:3000`.

À l'étape 4, seule une adresse locale (`localhost`, `*.local`, IP privée `10.x`, `172.16-31.x`, `192.168.x`) est retenue : un tunnel (exp.direct, ngrok, Cloudflare…) ne donne pas accès au backend et est ignoré. Après toute modification de `.env`, relancer avec le cache vidé (`npm start -- -c`).

Hors WSL2, `npm start` déduit l'IP LAN du PC dans `.env` seulement lors de la première
configuration (sans `EXPO_PUBLIC_API_URL` dans l'environnement ou dans `.env`). Pour
effectuer ou refaire cette mise à jour sans lancer Expo, exécuter depuis ce dépôt.
`npm run update-ip` force alors le port 3000 :

```bash
npm run update-ip
npm start -- -c
```

Sous Linux natif, `npm run update-ip` remplace l'hôte de `EXPO_PUBLIC_API_URL` et force le port 3000.
`npm start` ne modifie `.env` que si aucune URL n'est configurée et utilise alors aussi le port 3000. Le script choisit la première
IPv4 privée détectée (`192.168.x.x`, `10.x.x.x` ou `172.16-31.x.x`). Si plusieurs
interfaces (VPN, VirtualBox, Wi-Fi et Ethernet) sont actives, choisir explicitement
l'adresse correcte :

```bash
npm run update-ip -- --ip 192.168.1.42
```

Cette commande modifie le fichier `.env` local, ignoré par Git. Elle ne doit pas être
utilisée pour l'émulateur Android (`10.0.2.2`), le mode miroir WSL2 ou un backend sur
une autre machine : dans ces cas, conserver l'URL spécifique documentée plus bas.

### Cas A : poste sans WSL2, backend sur le même poste

```bash
npm start
```

Si le backend est joignable depuis le téléphone par l'adresse locale de l'ordinateur, l'app la déduit et utilise le port 3006. Ce port doit être redirigé vers le Gateway local (port 3000), comme dans les cas A et B.

**Avec la stack Docker Infra**, le Gateway est volontairement publié sur `127.0.0.1:3000` : le PC peut le joindre, mais pas le téléphone. Sous Windows, créer une seule fois une redirection dédiée, sans modifier les ports des microservices. Dans **PowerShell administrateur** :

```powershell
netsh interface portproxy add v4tov4 listenport=3006 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1
New-NetFirewallRule -DisplayName "Chatvardage API mobile 3006" -Direction Inbound -Protocol TCP -LocalPort 3006 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

La redirection et la règle ne dépendent pas de l'IP du PC : elles restent valides après un changement de réseau. Le port 3006 évite le port 3001, déjà utilisé localement par Auth-Service.

Dans le fichier `.env` personnel de ce dépôt, définir `EXPO_PUBLIC_API_URL=http://<IPv4-Wi-Fi-du-PC>:3006` (ligne « Adresse IPv4 » du Wi-Fi dans `ipconfig`), puis relancer `npm start -- -c`. Cette URL explicite fonctionne aussi si Expo tourne dans WSL ou utilise un tunnel. **Si l'IP du PC change** (autre réseau, nouveau jour sur un Wi-Fi scolaire), mettre à jour seulement `.env`, puis relancer `npm start -- -c`.

Tester `http://<IPv4-Wi-Fi-du-PC>:3006/api/health` dans le navigateur du téléphone : la réponse doit contenir `"status":"ok"`. Le téléphone doit être sur le même Wi-Fi ; un réseau invité ou scolaire peut isoler les appareils.

Pour retirer cet accès (PowerShell administrateur) :

```powershell
netsh interface portproxy delete v4tov4 listenport=3006 listenaddress=0.0.0.0
Remove-NetFirewallRule -DisplayName "Chatvardage API mobile 3006"
```

### Cas B : WSL2 avec tunnel (configuration standard)

Sous WSL2, Metro et le backend vivent dans un réseau interne que le téléphone ne voit pas. Deux problèmes distincts, deux solutions :

| Problème | Solution | Qui la fournit |
|---|---|---|
| Le téléphone n'atteint pas **Metro** (Expo Go tourne en rond) | Tunnel `--tunnel` (ngrok) | `npm start` l'ajoute seul |
| Le téléphone n'atteint pas **l'API** (le Gateway n'écoute que sur `127.0.0.1` dans WSL) | Redirection Windows du port 3006 vers `localhost:3000` | **Une fois, à la main** (ci-dessous) |

**Configuration, une seule fois** — dans **PowerShell administrateur** (clic droit, « Exécuter en tant qu'administrateur ») :

```powershell
netsh interface portproxy add v4tov4 listenport=3006 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1
New-NetFirewallRule -DisplayName "Chatvardage API 3006" -Direction Inbound -Protocol TCP -LocalPort 3006 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

La redirection survit au redémarrage de Windows. Pour la vérifier : `netsh interface portproxy show v4tov4`.

**Utilisation quotidienne :**

```bash
npm start
```

Au premier lancement, accepter l'installation de `@expo/ngrok`. `scripts/start.js` fait alors, dans l'ordre :

1. détecte WSL2 ;
2. ajoute `--tunnel` si aucune option de réseau (`--tunnel`, `--lan`, `--localhost`) n'est passée ;
3. si `EXPO_PUBLIC_API_URL` n'est définie ni dans l'environnement ni dans `.env`, interroge Windows (`powershell.exe`) pour l'IP Wi-Fi **actuelle** et utilise `http://<cette IP>:3006` ; l'IP peut donc changer d'un jour à l'autre sans rien modifier ;
4. avertit si la redirection du port 3006 est absente ;
5. lance directement la CLI Expo locale avec Node et les options données (`npm start -- -c` vide le cache).

Hors WSL2, `scripts/start.js` déduit `.env` avec la première IPv4 privée détectée
uniquement si aucune URL n'est configurée avant de lancer Expo. Cette étape n'est pas
exécutée sous WSL2, qui utilise plutôt l'adresse Windows détectée par PowerShell.

**Vérification** : `http://<IP-Wi-Fi-de-Windows>:3006/api/health` doit répondre dans le navigateur du téléphone (IP visible dans le message `[start] WSL2 : API détectée à …`, ou avec `ipconfig`, ligne « Adresse IPv4 » du Wi-Fi).

**Limites du script :**

- il ne peut pas créer la redirection ni la règle de pare-feu (droits administrateur) ;
- il suppose que le téléphone est sur le même Wi-Fi que l'ordinateur pour joindre l'API (le tunnel, lui, passe par Internet) ;
- si `powershell.exe` est inaccessible depuis WSL, il affiche un avertissement : définir alors `EXPO_PUBLIC_API_URL` dans `.env` à la main (`http://<IP-Wi-Fi>:3006`) ;
- plusieurs cartes réseau (VPN, VirtualBox, Hyper-V) : il choisit la carte de la route par défaut ; si l'IP détectée est mauvaise, forcer l'URL dans `.env`.
- la présence d'une règle `netsh` ne garantit pas que le Gateway tourne ni que le téléphone peut joindre le proxy : vérifier `/api/health` depuis le téléphone avant d'utiliser l'app.

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

Utiliser `npx expo start` et **non** `npm start` : le script ajouterait le tunnel et le port 3006, inutiles en mode miroir. Comme le mode miroir expose le Gateway directement sur le port 3000, définir `EXPO_PUBLIC_API_URL=http://<IP-Wi-Fi>:3000` dans `.env`, puis relancer Expo avec `-c`. Si le test `curl.exe http://<IP-Wi-Fi>:3000/api/health` échoue dans PowerShell, c'est le pare-feu.

Prérequis : Windows 11 22H2 ou plus récent et WSL à jour (`wsl --update`).

### Cas D : émulateur Android

```bash
npm start      # puis « a » dans le terminal
```

Dans un émulateur Android Studio, `localhost` désigne l'émulateur lui-même. Définir dans `.env` `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` : `10.0.2.2` est l'alias de l'ordinateur hôte et le port 3000 est celui du Gateway local. Après toute modification, arrêter puis relancer Expo avec `npm start -- -c`. Cette adresse remplace celle du port 3006, réservée aux connexions depuis le réseau Wi-Fi / un téléphone physique. Sous WSL2, l'émulateur tourne côté Windows : voir aussi le cas B pour joindre l'API.

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
| `[start] Aucune redirection du port 3006…` | La redirection `netsh` du cas B manque | La créer (PowerShell administrateur) |
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
| Services | `src/services` | Client HTTP, erreurs (`ApiError`), messages REST et factory `createRealtimeService`, utilisateurs, serveurs et salons |
| Session | `src/session` | `SessionManager` détient une instance temps réel `/messages` et le store de brouillons, exposés aux écrans et hooks par `useSession`; nettoyage à la déconnexion et au démontage du provider |

## Conversation et messagerie

Les messages privés (`dm:<uuid>`) et les salons (`room:<uuid>`) utilisent le même écran et la même logique. Les fichiers du dépôt se nomment `messagesService.ts` et `websocketService.ts` (équivalents de `messages.service` et `websocket.service` dans l'énoncé).

| Livraison | Comportement implanté | Zone principale |
|---|---|---|
| Écran Conversation | Liste inversée, saisie multiligne, adaptation au clavier, validation des paramètres avant chargement | `ConversationScreen` |
| Historique REST | Chargement initial de 50 messages, normalisation des auteurs et ordre du plus récent au plus ancien | `messagesService`, `useMessages` |
| Envoi | Requête POST pour un DM ou un salon, insertion de la réponse REST, refus du texte vide, bouton désactivé pendant l'envoi | `MessageInput`, `messagesService` |
| Connexion WebSocket | Socket unique sur `/messages`, chemin `/socket.io`, jeton dans `auth.token`, abonnement aux salons après `connexion.prete` | `websocketService`, `SessionManager` |
| Réception temps réel | Événements `private-message.created` et `room-message.created`, filtrage par conversation et tampon pendant le chargement initial | `useMessages` |
| Modification | Appui long uniquement sur son propre message, préremplissage, enregistrement PATCH et annulation ; l'API reste responsable des permissions | `MessageBubble`, `MessageInput`, `messagesService` |
| Suppression | Appui long sur son propre message : dialogue au style de l'app (`AppDialog`) qui cite le message, Annuler à gauche, Modifier puis Supprimer à droite ; dans un salon, un modérateur, le propriétaire du serveur ou un administrateur peut aussi supprimer le message d'un autre (Annuler / Supprimer seulement : la modification reste réservée à l'auteur, texte de confirmation propre à la modération). Le droit vient de `monRole` de `GET /api/servers` (`useCanModerate`, relu à chaque `serveur.change`) ; « Supprimer » demande une confirmation définitive, puis `DELETE` (message privé : `/api/messages/:id` ; salon : `/api/messages/rooms/:roomId/:id`). Le message disparaît de la liste, la raison d'un refus s'affiche sans retirer le message ; supprimer le message en cours de modification quitte la modification | `ConversationScreen`, `useCanModerate`, `useMessages.remove`, `messagesService.deleteMessage`, `serversService.fetchCanModerate` |
| Serveurs | Découverte : invitations en haut, puis les serveurs publics proposés par pages de 20 (`GET /api/servers/decouvrir?q=&decalage=&limite=`), « Afficher plus de serveurs » et recherche par nom en direct. Gestion : la modification d'un salon ouvre son propre écran (`EditRoom`) ; les confirmations (supprimer, quitter, expulser) passent par `AppDialog`. Invitation reçue (`serveur.change`, raison `invitation`, `cibleId` = moi) : notification locale avec le nom du serveur en mode « Notifications système », son toucher ouvre les invitations | `DiscoverServersScreen`, `useDiscoverServers`, `ManageServerScreen`, `EditRoomScreen`, `AppDialog`, `useInvitationAlerts` |
| Listes | Serveurs triés par dernière activité (`GET /api/messages/activity`, dernier message de leurs salons) et messages privés par dernier message ; 15 éléments à la fois avec « Afficher plus ». Loupe dans l'en-tête des deux onglets : filtre par nom (sans casse ni accents). Pastille du nombre d'invitations en attente sur « Découvrir des serveurs » et sur l'onglet Serveurs de la barre de navigation (`InvitationsProvider`) | `ServersScreen`, `DirectMessagesScreen`, `usePagedList`, `useListFilter`, `HeaderSearchButton`, `InvitationsProvider`, `serversService` |
| Compte | Paramètres › Compte : modifier le mot de passe (mot de passe actuel exigé ; Authentification révoque tous les jetons, la session est rouverte avec le nouveau) et supprimer le compte (mot de passe actuel puis confirmation). Un mot de passe actuel faux (401) n'ouvre ni ne ferme la session : « Mot de passe actuel incorrect » | `AccountSection`, `SessionManager.changePassword` / `deleteAccount`, `authService` |
| Réception des suppressions | Événements `private-message.deleted` et `room-message.deleted` (suppression depuis un autre appareil ou le Web) : le message est retiré de la liste et du tampon de chargement ; un message supprimé ne réapparaît pas avec une page REST arrivée en retard | `useMessages` |
| Réception des modifications | Événements `private-message.updated` et `room-message.updated`, remplacement du contenu sans ajouter de ligne | `useMessages` |
| Mention « modifié » | Affichée lorsque les instants `updatedAt` et `createdAt` diffèrent | `MessageBubble` |
| Pagination | Chargement en fin de liste par pages de 50 avec le curseur du plus ancien message ; demandes simultanées bloquées (y compris entre « charger plus » et le saut vers un résultat de recherche : `jumpTo` attend la page en cours puis réévalue, `loadOlder` est ignoré pendant qu'un saut charge une page), erreur réessayable sans perdre la liste | `ConversationScreen`, `useMessages` |
| Suppression des doublons | Fusion par identifiant entre historique, pagination, réponses POST/PATCH et événements ; conservation de la version au `updatedAt` le plus récent | `mergeMessages` |
| Texte non envoyé | Brouillon par conversation, restauré après navigation et passage en modification ; conservé sur erreur ou si le texte change pendant l'envoi, effacé après succès seulement | `MessageInput` |
| Chargement et erreurs | États initial/vide/erreur avec nouvelle tentative, indicateur de pagination, erreurs d'envoi/modification et bandeau de connexion | `ConversationScreen`, `MessageInput`, `useMessages` |
| Alias | Le nom affiché d'une personne est son alias (Paramètres › Profil) s'il en a choisi un, sinon son pseudo : messages, titre d'une conversation privée, liste des messages privés, recherche et résumé de recherche, choix du destinataire (alias puis `@pseudo`), membres d'un serveur et titre des notifications. Un alias ajouté, modifié ou retiré sur un autre appareil (`profil.changed`) est repris sans rouvrir l'écran ; une panne des profils publics laisse les pseudos | `lookupDisplayNames`, `usePublicProfiles`, `useRefreshOnProfileChange`, `UserChoiceItem` |
| Fiche de profil | Photo (ou initiale), nom affiché, `@pseudo`, présence, alias et pseudo, et un bouton « Message privé ». Ouverte par un appui long sur une conversation de la liste des messages privés, un toucher sur la photo de l'auteur d'un message (salon ou message privé ; pas le message système) et un toucher sur la photo d'un membre d'un serveur. Pas de bouton sur sa propre fiche, ni vers la conversation privée déjà affichée ; l'appui long sur un message garde ses actions (modifier, supprimer). Dans la liste des membres, sa propre ligne n'a ni pastille de présence ni fiche. La fiche reprend les profils déjà suivis par l'écran qui l'ouvre : son « En ligne / Hors ligne » est celui de la pastille | `ProfileSheet` (`useProfileSheet`), `ConversationItem`, `MessageBubble`, `ServerMembersScreen` |
| Présence | Un seul suivi de présence pour toute l'app : Message-Service ne garde qu'un `presence.suivre` par connexion (le dernier remplace les autres) et refuse deux demandes à moins d'une seconde. `usePublicProfiles` envoie donc une seule demande, l'union des personnes affichées par tous les écrans montés, regroupée et espacée d'au moins 1,1 s, renvoyée à chaque connexion prête ; les `presence.changed` s'appliquent à tous les écrans | `usePublicProfiles` |

Le temps réel est configuré avant de publier une session connectée. Un renouvellement du jeton reconnecte le socket sans supprimer les abonnements ; une déconnexion ou révocation ferme le socket. Dès la première `connexion.prete`, puis à chaque reconnexion, l'historique récent est rechargé et fusionné sans vider les pages déjà chargées. Ce rattrapage couvre la fenêtre entre le premier chargement REST et l'arrivée des événements; une ancienne requête initiale ne remplace pas le résultat du rattrapage.

**Limites à connaître** : les brouillons restent uniquement en mémoire de la session, sans stockage sur disque ni garantie après fermeture/rechargement de l'app. Ils sont effacés à la déconnexion, révocation, destruction du provider ou changement de compte, mais conservés au renouvellement du même compte. Au maximum 100 brouillons non vides sont conservés : au-delà, le moins récemment ouvert ou modifié est supprimé (LRU). Un champ vidé ou composé uniquement d'espaces ne conserve pas d'entrée. Le rattrapage après reconnexion recharge une seule page récente de 50 messages, pas toute une interruption prolongée. La validation sur appareil avec deux sessions backend réelles reste nécessaire pour confirmer le défilement, le clavier et les transitions arrière-plan/réseau.

Les dates `createdAt` et `updatedAt` des messages doivent être valides. Une réponse REST ou un événement temps réel contenant une date invalide est signalé comme une réponse serveur invalide, sans remplacer la liste déjà affichée.

### Corrections et garanties du client chat

Cette section décrit le comportement actuel, et remplace le plan historique `docs/instructionsChat.md`, supprimé après livraison. Les contrats REST et Socket.IO restent ceux du Gateway; aucune règle métier du backend n'est réimplémentée ici.

| Zone | Changement effectué et comportement actuel |
|---|---|
| Propriétaire du socket | `createRealtimeService()` crée un état indépendant par instance. `SessionManager` détient l'instance et `SessionContext` l'expose aux hooks. Le provider ferme le temps réel à son démontage; le service n'est plus un singleton de module. |
| Abonnements à la fermeture | Les événements du socket sont retirés avant sa fermeture. Les observateurs reçoivent une dernière transition `disconnected`, puis les abonnements d'état et de connexion prête sont vidés. Les attentes avant connexion prête sont rejetées à la fermeture. |
| État initial | `onConnectionState` notifie immédiatement l'état courant. Une transition déclenchée pendant cette notification reste observable; si le callback lève, son abonnement est retiré avant propagation de l'erreur. |
| Observateurs de connexion prête | `onReady` n'enregistre son callback qu'après création réussie du socket. Les callbacks sont parcourus sur une copie pour que la fermeture déclenchée par l'un d'eux n'interrompe pas silencieusement les suivants. Aucun salon n'est rejoint si la connexion a été interrompue pendant ces notifications. |
| Renouvellement du jeton | Le socket existant est reconnecté avec le nouveau `auth.token`, en conservant les abonnements. Les notifications d'état identiques sont dédupliquées et la déconnexion volontaire ne publie pas d'état intermédiaire parasite. Dans Socket.IO 4.8.4, `disconnect()` notifie synchroniquement, uniquement si le socket était connecté. |
| Jeton absent lors d'une reconfiguration | Si un socket existe et que `configureRealtime` reçoit un fournisseur sans jeton, le service ferme le socket, nettoie ses abonnements et attentes, puis appelle `onUnauthorized` pour déconnecter la session. Il ne conserve pas silencieusement l'ancien jeton. Sans socket, la configuration reste paresseuse : toute tentative d'abonnement sans jeton lève `ApiError('unauthorized')`. |
| Initialisation du hook | Si un abonnement échoue, les abonnements déjà créés sont retirés. Une `ApiError` produit un état d'erreur réessayable; une exception inattendue est propagée après nettoyage. Le réessai recrée les abonnements avant de charger l'historique. |
| Réponses asynchrones | Le compteur de génération invalide les réponses REST, les résolutions de pseudos et les callbacks temps réel d'une ancienne conversation. Parmi les chargements récents concurrents, seul le dernier demandé met à jour la liste et les états. Les résultats d'envoi et de modification ne sont fusionnés que dans leur conversation d'origine encore active. |
| Adhésion et sortie de salon | Une sortie différée ne quitte pas un salon rouvert pendant l'adhésion. Un ACK de sortie ancien ne supprime pas la nouvelle adhésion, et un ACK d'entrée d'une connexion précédente ne marque pas le salon rejoint sur la connexion actuelle. Un `joinRoom` non configuré ne mémorise pas le salon. |
| Révocation et reconnexion | La révocation invalide la génération d'adhésion du hook : ni un succès ni un échec tardif ne remplace son erreur d'accès. Chaque connexion prête suit l'adhésion courante, plutôt que l'ancien ACK perdu à la coupure; son expiration ne crée donc pas de fausse erreur après une reconnexion réussie. |
| Résolution des auteurs | L'ensemble de recherches de pseudos ne contient que les demandes en cours. Après une erreur ou une réponse vide, le prochain événement de cet auteur retente la résolution. Une recherche réussie enrichit tous ses messages reçus pendant l'attente, y compris dans le tampon initial, sans requête concurrente en double. |
| Validation et fusion | Les dates invalides ou de mauvais type produisent `ApiError('invalid_response')`. La fusion est calculée avant la mise à jour de la liste, et le tampon initial n'est vidé qu'après succès. Un cache `WeakMap` évite de reparsing les dates déjà validées; une modification de leurs chaînes invalide le cache. La fusion et le tri parcourent toujours la liste : ce cache ne rend pas l'opération constante. |
| Erreurs et migration | Les actions d'envoi/modification propagent les erreurs originales, sans lancer de chaîne localisée. `MessageInput` affiche leur traduction via `userMessage()`. Le catalogue est exhaustif au niveau TypeScript (`satisfies`). Le kind local `validation` a été retiré au profit de `bad_request` pour HTTP 400. HTTP 429 produit `rate_limited`; `rate_limit` reste compatible avec les consommateurs auth historiques et leur texte spécifique. La restauration de session gère les deux. |
| Erreur avec une liste conservée | Même dans le cas défensif `status === 'error'` avec des messages présents, la liste reste affichée avec l'erreur de chargement (ou le message générique) et l'éventuelle erreur d'accès distincte. Une même erreur n'est pas annoncée deux fois. Le flux initial sans messages conserve son écran d'erreur réessayable. |
| Chemins REST et événements | Tous les identifiants interpolés dans les chemins de messagerie (conversation et message) passent par `encodeURIComponent`; les identifiants de conversation restent validés comme UUID, sans changement de contrat. `receive` se repose sur `belongsTo` pour rejeter les événements nuls, non objets ou étrangers à la conversation, sans répéter ce contrôle. |
| Brouillons et comptes | Le store est obligatoirement injecté dans `MessageInput` depuis la session; aucune Map globale n'est partagée entre comptes. L'ancien store est vidé puis remplacé à la déconnexion/révocation, au démontage et au changement de compte, pour isoler aussi les callbacks tardifs. La navigation remonte les écrans lors d'un changement de compte, mais pas au renouvellement du même utilisateur. La limite LRU reste de 100 brouillons non vides; la modification ne remplace pas la composition. |
| Envoi et édition tardifs | Un verrou synchrone par référence empêche deux déclenchements d'envoi/modification avant le prochain rendu, en complément du bouton désactivé. Le succès d'envoi n'efface pas un texte plus récent, même saisi dans une autre instance. Un brouillon évincé pendant l'envoi n'empêche pas de vider le champ après succès. Une ancienne modification terminée après démontage ne déclenche plus `onCancelEdit` sur le parent. |
| Accessibilité | Le bouton de réessai de pagination porte le libellé explicite « Réessayer le chargement des messages précédents ». |
| Lisibilité et lint | Les handlers de réception/révocation sont déclarés avant leur utilisation; les anciens indicateurs de première connexion et d'échec d'adhésion ainsi que l'API inutilisée `hasRealtimeBeenReady` ont été supprimés. Le commentaire `react-hooks/set-state-in-effect` est conservé : cette règle existe dans la version installée du plugin. |
| Maintenance du dépôt | L'ancien `MessageComposer`, inutilisé par l'app, et son texte « Envoi bientôt disponible » ont été supprimés; la saisie active est `MessageInput`. Le script `reset-project` et sa commande npm ont été retirés car ils généraient Expo Router. Le fichier d'icône possède une newline finale. Le contrôle Xcode nettoie uniquement son répertoire temporaire via `rmSync`, y compris lorsqu'une étape échoue. |

### Revues préventives et périmètre de sécurité

Une revue approfondie a confirmé une fuite locale de brouillons entre comptes dans l'ancien store global. Elle est corrigée par le store détenu par la session, son effacement/remplacement et le remontage des écrans au changement de compte. La contre-revue n'a identifié aucune autre vulnérabilité exploitable dans le périmètre examiné. Ce résultat ne garantit pas l'absence de vulnérabilités et ne constitue pas un audit du Gateway, des autres services ou des dépendances. Les permissions restent vérifiées par le backend; l'absence d'un bouton dans l'UI n'est pas un contrôle d'autorisation.

Les défauts fonctionnels précédemment documentés (sortie de salon rouvert, adhésion tardive masquant une révocation et pseudo jamais retenté) sont corrigés et couverts par des régressions, ainsi que le rattrapage initial, les anciens ACK après reconnexion et les doubles déclenchements d'envoi. Les garanties correspondantes sont détaillées dans le tableau ci-dessus.

L'examen local des fichiers suivis et de l'historique Git disponible n'a identifié aucun secret exploitable; la contre-revue a aussi examiné le diff des corrections. Les fichiers d'environnement privés, clés, certificats et identifiants locaux sont exclus par `.gitignore`, qui n'efface toutefois pas un secret déjà suivi ou commité. Aucun contenu sensible n'a été envoyé à un scanner distant, et aucun push n'a été effectué pendant cette revue. Les branches distantes, PR, commentaires, artefacts GitHub et historiques non disponibles localement ne sont pas couverts : ce contrôle ne permet pas d'affirmer que GitHub n'a jamais reçu de secret.

### Parcours de validation sur appareil

Avec le Gateway et les services réels démarrés depuis Infra, connecter deux comptes dans deux clients :

1. Ouvrir un DM puis un salon accessible : vérifier l'historique ou l'état vide.
2. Envoyer depuis chaque client : vérifier la réception sans rechargement et une seule ligne par message, y compris chez l'expéditeur.
3 bis. Supprimer son message par appui long (menu, puis confirmation) : il disparaît aussitôt chez l'expéditeur et sans rechargement chez l'autre client, et la recherche ne le retrouve plus ; un refus du serveur affiche sa raison sans retirer le message. Avec un compte modérateur d'un salon, supprimer le message d'un autre membre ; avec un compte membre, aucun appui long n'est proposé sur les messages des autres.
3. Modifier son message par appui long : vérifier le contenu et la mention « modifié » sur les deux clients ; aucun appui long de modification ne doit être proposé sur un message d'autrui.
4. Ouvrir une conversation contenant plus de 50 messages et remonter : vérifier les pages anciennes, l'absence de doublons et la conservation de la position.
5. Saisir un brouillon, changer de conversation puis revenir ; ouvrir et annuler une modification : vérifier que le brouillon de composition reste présent.
6. Couper puis rétablir le réseau : vérifier les erreurs, le texte conservé après échec d'envoi, la reconnexion et le rattrapage récent ; vérifier aussi le retour depuis l'arrière-plan.
7. Saisir un brouillon puis se déconnecter : un autre compte ouvrant la même conversation ne doit voir ni ce brouillon ni une édition de l'ancien compte.

## Limites connues

- **Session** : SecureStore, validation au démarrage, rotation réelle via Auth-Service/Gateway, refresh partagé et retour Login après échec du renouvellement. HTTP utilise `Authorization: Bearer` et Socket.IO `auth.token` ; aucun identifiant utilisateur n'est fourni dans le handshake.
- **Non-lus** : les listes et les badges d'onglets utilisent `GET /api/messages/unread` (état de lecture en base, donc juste après un redémarrage). Les compteurs se rechargent au démarrage, à chaque reconnexion du canal temps réel et au retour au premier plan, et augmentent en direct à chaque message reçu hors de la conversation affichée.
- **Dernier message d'un salon** : une requête `history?limit=1` par salon, seulement à l'ouverture d'un serveur (aucun endpoint dédié).
- **Rejoindre / quitter un serveur** : non implanté ici ; l'onglet Serveurs et l'écran Server sont l'emplacement prévu.
- **Suppression** : le droit de modérer est déduit du rôle effectif du serveur (`monRole`, comme `peutModerer` côté Room-Service) ; il n'est proposé qu'à titre d'aide, l'API vérifie toujours le droit et répond 403 sinon (raison affichée, message conservé). Si le rôle n'a pas pu être lu (réseau), la modération n'est pas proposée. Message privé : seul l'expéditeur peut supprimer. Le menu et la confirmation sont des alertes natives : leur affichage sur appareil, et un test avec un vrai compte modérateur, restent à faire.
- **Écran Conversation** : historique REST, envoi/modification, réception temps réel Socket.IO et pagination sont branchés pour les DM et les salons. Les scénarios de coupure réseau, d'arrière-plan et de stabilité du défilement restent à confirmer sur appareil avec le backend.
- **Notifications** : locales seulement (voir ci-dessous). Aucune notification push : le jeton d'appareil n'est pas enregistré côté API.
- Comportement clavier / retour Android : vérifié par bundle Android et tests unitaires; à confirmer sur émulateur ou appareil.

## Listes : cinq états et hook partagé

Les listes de conversations (messages privés, serveurs, salons d'un serveur) obéissent au même contrat, porté par un hook maison, sans bibliothèque de requêtes :

| État | Hook | Composant |
|---|---|---|
| 1. Chargement : première réponse pas encore arrivée | `state.status = 'loading'` | `LoadingState` |
| 2. Erreur | `'error'` + `message` (raison traduite) ; `retry` | `ErrorState` : raison et bouton « Réessayer » |
| 3. Vide : requête réussie sans conversation | `'empty'` | `EmptyState` (tirer pour rafraîchir reste possible) |
| 4. Succès | `'ready'` + `data` | `FlatList` et ses actions (ouvrir, nouveau message) |
| 5. Rafraîchissement | `refreshing` ; `refreshError` si la mise à jour échoue | la liste reste visible ; un échec affiche `RefreshErrorBanner` (raison + « Réessayer ») au-dessus d'elle |

## Code partagé avec le client Web (`src/partage/`)

Les hooks et règles réutilisables par le mobile **et** le Web vivent dans `src/partage/`, selon la convention des services (`src/partage/` : fichiers identiques à l'octet près dans plusieurs dépôts). Règle : un fichier de ce dossier n'importe que `react` et ses voisins (chemins relatifs) ; ni React Native, ni Expo, ni l'alias `@/`. Le test `partage.test.ts` le vérifie, donc un import d'application casse les tests au lieu de casser silencieusement la réutilisation.

| Fichier | Rôle |
|---|---|
| `useAsyncResource.ts` | Hook des cinq états d'une liste (ci-dessus). Paramètres : `load`, `isEmpty`, `describeError` |
| `useSearch.ts` | `useSearchResults({ search, describeError, debounceMs? }, conversationId?)` : délai de frappe, annulation, pagination sans doublon, états `idle`/`tooShort`/`loading`/`ready`/`empty`/`error` |
| `search.ts` | Types `SearchResult` / `SearchPage` / `SearchInput` et règle des 2 à 100 caractères |
| `groupResults.ts`, `highlight.ts` | Regroupement par messages privés puis par serveur, surlignage du texte cherché |

Chaque application fournit seulement ce qui lui est propre. Mobile : `useLoadable` (= `useAsyncResource` + `userMessage`) et `useSearch` (= `useSearchResults` + `searchMessages` + `userMessage`). Web React : `useSearchResults({ search: rechercherMessages, describeError: messageErreur }, conversationId)`.

Le Frontend (`A26_5A6_01-Frontend/src/partage/`) contient la copie identique, testée avec Vitest (`@testing-library/react`, couverture à 100 %). Toute modification se reporte à l'identique dans les deux dépôts : `A26_5A6_01-Infra/scripts/verifier-fichiers-partages.sh` compare les cinq fichiers (et la CI d'Infra le fait aussi). Les fichiers ne contiennent aucun commentaire `eslint-disable`, car les deux dépôts n'ont pas les mêmes règles ESLint. Limite : les pages de chat du Web sont en JS simple et n'utilisent pas encore ces hooks.

## Écran adaptatif et rotation

`app.json` n'impose plus l'orientation (`"orientation": "default"`) : l'application suit la rotation de l'appareil (portrait et paysage). Après ce changement, relancer Metro avec le cache vidé (`npm start -- -c`) ; sur une development build, l'orientation est lue au build.

- `ContentFrame` (`src/components/ContentFrame.tsx`) encadre les écrans à liste (messages privés, serveurs, salons, nouveau message, conversation, recherches) : il respecte les marges latérales de la zone sûre (encoche, coins arrondis en paysage) et limite la largeur du contenu à `MaxContentWidth` (800), centré, sur tablette ou en paysage, pour garder des lignes lisibles.
- Connexion et inscription défilent déjà (`ScrollView`, largeur limitée à 480) : le formulaire reste accessible quand le clavier prend la moitié de l'écran en paysage.
- Les bulles de message gardent une largeur maximale de 80 % du cadre ; le bandeau de connexion respecte aussi les marges latérales.
- Non vérifié sur appareil : le comportement du clavier et du défilement vers un message après une rotation en cours de saisie.

## Recherche, réseau et notifications

**Recherche** (`GET /api/messages/search`, 2 à 100 caractères, 20 résultats par page, curseur `nextCursor`)
- Onglet **Recherche** : `GET /api/messages/search/summary` fournit les comptes complets par interlocuteur et par serveur, séparés en deux catégories. Huit personnes et huit serveurs sont affichés au départ, avec « Voir plus » indépendant sous chaque catégorie au-delà de huit éléments (huit supplémentaires par appui). Les groupes à zéro sont absents. Une personne ouvre `ConversationSearch` sur son DM avec le texte prérempli; un serveur ouvre `ServerSearch` sur ses seuls salons ayant des correspondances, puis un salon ouvre la même recherche directe. Le texte est conservé à chaque étape et les noms de serveurs identiques restent séparés par identifiant. Les résultats de messages surlignent le texte; toucher un résultat ouvre sa page directement, défile jusqu'au message et l'entoure 3 secondes. Un message devenu introuvable affiche un avis.
- Bouton loupe dans l'en-tête d'une **conversation** (message privé ou salon) : route `ConversationSearch { conversationId, title? }`, recherche limitée à cette conversation (`conversationId=` côté API), comme sur le client Web. Les deux interlocuteurs d'un message privé peuvent chacun chercher dans leurs anciens messages ; dans un salon, la recherche porte sur le salon affiché. Le droit de lecture est vérifié par l'API (403 / 404). Toucher un résultat dépile jusqu'à la conversation déjà ouverte (`popTo`) et la place sur le message : plusieurs recherches de suite n'empilent donc rien, et la flèche de retour ramène directement à la liste.
- `useSearch` et `useSearchSummary` : délai de frappe de 350 ms, annulation et invalidation de la requête précédente. Les messages se paginent sans doublon uniquement par « Plus de résultats ». Les résumés sont calculés côté service, sans télécharger les messages pour compter. Reconstruire Message-Service pour exposer `/api/messages/search/summary` avant d'utiliser le nouveau mobile; le Gateway relaie déjà cette famille de routes. Aucun changement du client Electron.

**Réseau** : `network.adapter` (NetInfo) + état du canal temps réel → `useConnection` (`online`, `reconnecting`, `offline`) → bandeau `ConnectionStatus` affiché au-dessus de l'application avec une session ouverte. Le service temps réel est celui de la session (`useSession().realtime`). Le canal Socket.IO se reconnecte seul ; à chaque `connexion.prete`, les compteurs de non-lus sont rechargés par l'API et l'historique de la conversation ouverte est rattrapé par `useMessages` (fusion sans doublon). Le bandeau global est masqué dans une conversation, qui affiche déjà son propre état de connexion.

**Texte non envoyé** : géré par `MessageInput` et le magasin de brouillons de la session (en mémoire, effacé à la déconnexion ou au changement de compte) : un envoi qui échoue laisse le texte dans le champ. Il ne survit pas à un redémarrage de l'application.

**Notifications** (`notifications.adapter`, expo-notifications)
- Notification **locale** quand un message arrive dans une conversation qui n'est pas affichée (ou quand l'application est en arrière-plan). Elle contient le pseudo et « Nouveau message », jamais le texte ; son seul payload est `conversationId`, validé avant d'ouvrir `Conversation` (toucher pendant que l'application tourne, ou lancement à froid).
- Permission : `granted`, `denied`, `undetermined` ou `unavailable` (web, module absent). Demandée une seule fois au premier lancement ; l'état et un bouton « Activer » / « Ouvrir les réglages » sont dans Préférences.
- Le **badge** (onglets Messages privés et Serveurs, listes) reste fonctionnel sans permission. Le badge de l'icône n'est mis à jour que si la permission est accordée.

Limites : le canal temps réel est coupé par le système peu après le passage en arrière-plan, donc aucune notification n'arrive application fermée (il faudrait du push, hors périmètre). **Expo Go sur Android (SDK 53+)** : le simple chargement d'`expo-notifications` y lève une erreur. L'adaptateur ne charge donc pas le module dans ce cas : l'application démarre, les notifications sont « indisponibles » (affiché dans Préférences) et seul le badge dans l'application fonctionne. Pour tester les notifications locales sur Android, utiliser une development build (`npx expo run:android` ou `eas build --profile development`). Sur iOS, Expo Go permet de les tester. Les salons sont rejoints pour les alertes après chaque changement de conversation (délai de 0,8 s) car l'écran d'un salon quitte sa room en se fermant.

## Vérifications

La CI (`.github/workflows/ci.yml`) rejoue à chaque PR et sur `main`/`develop` : `npm ci`, `tsc`, `expo lint`, les tests avec couverture à 100 % et `expo export --platform android` (le bundle doit compiler). `npm audit` et `expo-doctor` y tournent à titre informatif, sans bloquer. Aucun APK n'est produit : le build installable (EAS) reste à faire pour le contrôle 4.

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

Au **9 octobre 2026**, deux avis HIGH restent sans version corrigée publiée :

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

Vérification du **9 octobre 2026**, avec Node **22.23.2** et le SDK Expo **57** :

- `npx expo install --fix` confirme que les dépendances sont à jour.
- `npm audit fix` ne modifie ni le manifeste ni le verrouillage et termine en échec
  avec **49 alertes HIGH**, **0 CRITICAL**, provenant des deux avis ci-dessus.
- Les dernières versions publiées sur npm sont toujours `braces@3.0.3` et
  `node-forge@1.4.0`, toutes deux affectées. Les avis officiels indiquent qu'aucune
  version corrigée n'est disponible.

Il n'existe donc actuellement aucune correction par mise à jour de ces deux
paquets. Une migration de Jest seule ne retire pas `braces` de la chaîne Metro.
Le résultat attendu reste un audit en échec tant que ces dépendances sont présentes
et affectées; cette vérification ne constitue pas une résolution des failles.

### Préférences du téléphone et accueil

Le thème clair/sombre et la langue suivent automatiquement les paramètres du téléphone. La langue enregistrée dans le profil serveur ne remplace pas celle du téléphone. Le français et l’anglais sont disponibles; les autres langues utilisent l’anglais. L’onglet Accueil propose des accès aux serveurs, messages privés, recherche et paramètres.

### Conversation et messagerie : suivi des nouveaux messages

Les nouveaux messages replaçent la conversation en bas si la distance au dernier message ne dépasse pas une page visible. Au-delà, la position de lecture est conservée. La hauteur visible tient compte du clavier. Les droits d’écriture sont relus après reconnexion et à chaque `serveur.change` ; pendant cette relecture, la zone de saisie garde le droit précédent au lieu de disparaître puis réapparaître (une révocation `room-message.revoked` la ferme immédiatement, et une perte de droit annoncée par `serveur.change` s’applique à l’arrivée de la réponse, le backend refusant l’envoi entre-temps). Les listes (serveurs, salons, messages privés) se mettent à jour en arrière-plan sans afficher le spinner, réservé au geste « tirer pour rafraîchir ». le rôle effectif fourni par Room-Service permet la compatibilité avec les anciennes réponses sans `peutEcrire`. Une interdiction explicite du serveur reste prioritaire.

Un envoi réussi remet toujours la conversation en bas, quelle que soit la position de lecture. Le seuil d’une page concerne uniquement les messages reçus. Un envoi en erreur conserve la position et le brouillon.

### Membres et modération

La liste des membres affiche les avatars, la présence et le rôle effectif. Depuis cette liste, un modérateur peut choisir **Expulser**, puis confirmer. Le serveur valide les permissions : seuls les membres de rang inférieur peuvent être exclus; l’auto-exclusion et l’exclusion dans le serveur Chatvardage par défaut ne sont pas proposées. Après succès, la liste est relue; un refus conserve le membre et affiche une erreur.

Les avatars sont alignés en haut de la bulle; la date et les accusés apparaissent dessous. Les champs de gestion du serveur utilisent une couleur d’indication adaptée au thème et la visibilité publique est centrée dans sa ligne.

La date des messages reçus est alignée à gauche sous le début de la bulle. Celle de ses propres messages reste alignée à droite.

Les boutons d’envoi, de modification, de recherche de destinataires et leurs libellés d’accessibilité suivent la langue du téléphone. Le message de bienvenue d’origine et son auteur Système sont traduits à l’affichage; le contenu des utilisateurs et les messages modifiés restent inchangés.

### Conversation et messagerie : résultats anciens

Un résultat de recherche ouvre une page directement depuis le message choisi, avec un indicateur de chargement puis une mise en évidence instantanée. Les messages intermédiaires ne sont plus chargés. La pagination reprend depuis cette position, vers les messages plus anciens ou plus récents. Une reconstruction locale de Message-Service est nécessaire pour activer les nouveaux paramètres `around` et `direction`.

### Conversation et messagerie : pagination de recherche

La cible de défilement reste en attente tant que le saut masque la liste (`jumping`), puis est appliquée après les événements natifs de dimensions et de contenu. Le chargement reste visible au-dessus de la liste transparente jusqu'à un placement précis et la confirmation que la cible est visible, suivis de deux images pour laisser le natif appliquer le déplacement. Les approximations nécessaires aux messages de hauteur variable restent masquées ; elles ne réactivent ni le suivi du dernier message, ni la pagination, ni le maintien automatique de position. Une nouvelle recherche ou le démontage annule les tentatives et la révélation précédentes. La mise en évidence de trois secondes commence à la révélation. Les tests couvrent les mesures tardives, les échecs successifs de placement et le retour de recherche avec le vrai hook de profils publics. Validation du rendu natif sur appareil à effectuer.

Une nouvelle cible de navigation (`messageId` ou `focusToken`) affiche le chargement dès le premier rendu, avant le lancement des effets : l'ancienne liste ne passe plus par un rendu visible intermédiaire. La préparation du saut se fait avant la peinture (`useLayoutEffect`). Les régressions inspectent chaque rendu de la liste, pour une première ouverture ciblée et une conversation déjà ouverte, en DM et salon, avec une cible déjà chargée ou absente et une seconde sélection du même message.

Chaque sélection de résultat remonte une fenêtre centrée sur le message. S'il est déjà chargé, ses messages sont réutilisés sans nouvelle requête ; une image permet d'afficher l'indicateur de chargement et de démonter la liste. Sinon, la fenêtre est lue sur le serveur. La fenêtre locale est limitée à 101 messages et la pagination reprend des deux côtés si des messages ont été retirés. Les lignes de la fenêtre ciblée sont rendues dès le montage, avec une taille de lot initial stable après la révélation, pour éviter les ajouts progressifs autour de la cible. Le contour de mise en évidence est dessiné en superposition et ne modifie jamais les dimensions de la bulle. L'indicateur reste affiché pendant le placement natif, sans animation de défilement ; une seconde sélection du même résultat suit le même chemin. Les tests couvrent les DM et salons, la réutilisation sans réseau, les curseurs d'une fenêtre locale réduite et le contour sans modification de mise en page. La fluidité native reste à confirmer sur appareil.

La recherche générale montre les comptes par personne et serveur, avec « Voir plus » indépendant par catégorie; la recherche dans un DM ou un salon charge les messages suivants uniquement avec « Plus de résultats ». Le défilement n'ajoute pas automatiquement des lignes. Le retour d'un résultat vers une conversation déjà ouverte conserve son ancre initiale : seul le saut vers le message charge la nouvelle page, sans relancer le chargement initial en concurrence. Les régressions DM et salon vérifient la fin du chargement, le défilement et une seconde sélection du même résultat. Validation manuelle sur appareil non effectuée. Le bloc Chatvardage de l'accueil affiche le logo du frontend (déjà présent dans les ressources mobiles); les icônes des raccourcis sont conservées.

### Conversation et messagerie : fin des messages récents

Après une ouverture ciblée ou un saut de recherche, le mobile vérifie avec une requête d'historique limitée à un message si un résultat existe après le dernier message affiché. Le bouton « Charger les messages plus récents » est masqué quand cette borne est atteinte, y compris si la dernière page contient exactement 50 messages. La vérification ne résout pas les pseudos. Une panne de cette vérification conserve la possibilité de charger pour ne pas masquer des messages inconnus. Les régressions couvrent les DM, salons et pages pleines; validation manuelle sur appareil non effectuée.

## Renforcement sécurité — 9 octobre 2026

Un build de diffusion exige une origine explicite `EXPO_PUBLIC_API_URL=https://...`, sans identifiants, chemin, paramètres ou fragment. La déduction depuis Metro et HTTP sont réservés au développement. La recherche paginée partagée annule les requêtes remplacées et déduplique les résultats d'une même page; les fichiers partagés restent identiques au Frontend.

L'override YAML concerne seulement l'outil `@istanbuljs/load-nyc-config`. Les versions Expo restent alignées sur le SDK 57 (`expo install --check`); ne pas utiliser `npm audit fix --force`.

### Limites connues

L'audit npm conserve des alertes élevées : [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), utilisé par la chaîne Metro/Jest, et [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), via les outils Expo. Aucun correctif publié n'est disponible pour ces deux avis lors de l'audit du 9 octobre 2026. Les compteurs incluent les dépendants, pas autant de failles distinctes. Retirer cette exception dès une version corrigée compatible avec le SDK; le contrôle `npm audit --audit-level=high` reste actif et échoue actuellement. Voir `../A26_5A6_01-Infra/docs/audit-securite-2026-10-09.md`.

Une URL de configuration syntaxiquement invalide produit le même diagnostic explicite EXPO_PUBLIC_API_URL qu’une origine interdite, sans afficher sa valeur. Expo 57 installe son implémentation WHATWG URL au chargement du runtime; aucun deuxième polyfill n’est ajouté. Les tests de configuration exécutent les deux parseurs Node et Expo 57. La validation sur appareil physique reste à effectuer.
