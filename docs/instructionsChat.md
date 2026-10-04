# Plan — Écran Conversation et messagerie temps réel

## But

Rendre l'écran `Conversation` complet dans ce dépôt (Expo 57, React Native 0.86, React Navigation 7) : historique REST, envoi, réception temps réel par Socket.IO, modification par l'auteur, mention « modifié », pagination des anciens messages, suppression des doublons, conservation du texte non envoyé, états loading/erreur.

L'écran sert déjà aux **messages privés** (`dm:<uuid de l'interlocuteur>`) et aux **salons** (`room:<uuid du salon>`) : la fonctionnalité couvre les deux, dans le même hook et les mêmes composants.

Les tests font partie du code livré : chaque fichier ajouté ou modifié arrive avec ses tests dans le même changement.

## Ce qui existe déjà (ne pas refaire)

| Élément | Fichier | État actuel |
| --- | --- | --- |
| Route `Conversation { conversationId, title? }` et validation | `src/navigation/routes.ts`, `src/types/conversationId.ts` | Fait. `parseConversationParams` / `parseConversationId` donnent `{ kind: 'dm' \| 'room', targetId }`. |
| Écran | `src/screens/ConversationScreen.tsx` | Historique en lecture seule, `FlatList` **inversée** (plus récent en bas), clavier géré. |
| Bulle | `src/components/MessageBubble.tsx` | Affiche auteur (salons), heure et déjà « · modifié » si `updatedAt !== createdAt`. |
| Saisie | `src/components/MessageComposer.tsx` | Champ + bouton, `maxLength` 4000. `onSend` synchrone, vide le texte immédiatement : à corriger. |
| Historique REST | `src/services/messagesService.ts` → `fetchHistory(conversationId, limit)` | Première page seulement, DM et salons, renvoie du **plus récent au plus ancien**, résout les pseudos via `lookupPseudos`. |
| Hook de chargement | `src/hooks/useConversationHistory.ts` (sur `useLoadable`) | Chargement initial seulement. Commentaire : « temps réel et pagination : hors périmètre ». |
| Client HTTP | `src/services/httpClient.ts` → `apiFetch` | Ajoute le jeton, délai 10 s, lève `ApiError`. Branché par `SessionContext`. |
| Erreurs | `src/services/ApiError.ts` | Types `network`, `timeout`, `unauthorized`, `forbidden`, `not_found`, `server`, `unknown`; `userMessage()` en français. Pas de type pour 400 ni 429. |
| États visuels | `src/components/StateViews.tsx` | `LoadingState`, `ErrorState` (avec réessai), `EmptyState`. |
| Session | `src/session/SessionContext.tsx` | Provisoire (jeton en mémoire). `useSession()` expose `user`, pas le jeton. |
| URL de l'API | `src/config/env.ts` → `API_URL` | Seul endroit qui lit la configuration. |
| Tests | `src/__tests__/*.test.ts(x)`, Jest + `jest-expo` + Testing Library RN | Modèle à suivre : `messagesService.test.ts` simule `@/services/httpClient`. |

`socket.io-client` **n'est pas installé**.

## Périmètre

### Fichiers de la tâche

Les noms de l'énoncé sont adaptés aux conventions du dépôt (services en camelCase) :

| Énoncé | Fichier dans ce dépôt | Action |
| --- | --- | --- |
| `ConversationScreen` | `src/screens/ConversationScreen.tsx` | Modifier |
| `MessageBubble` | `src/components/MessageBubble.tsx` | Modifier |
| `MessageInput` | `src/components/MessageInput.tsx` | Renommer `MessageComposer.tsx` (utilisé seulement par `ConversationScreen`) puis modifier |
| `useMessages` | `src/hooks/useMessages.ts` | Créer; supprimer `useConversationHistory.ts` (utilisé seulement par `ConversationScreen`) |
| `messages.service` | `src/services/messagesService.ts` | Étendre |
| `websocket.service` | `src/services/websocketService.ts` | Créer |
| Tests | `src/__tests__/…` | Créer / étendre (voir chaque étape) |

### Points d'intégration minimes hors de ces fichiers

Seulement ce qui est indispensable; prévenir le responsable du fichier concerné :

- `src/services/ApiError.ts` : ajouter les types `bad_request` (400) et `rate_limited` (429) avec leurs messages, sans changer les messages existants. Étendre `httpClient.test.ts` / ajouter les cas correspondants.
- `src/session/SessionContext.tsx` : à côté de `configureHttpClient(...)`, brancher le service temps réel (`configureRealtime({ getToken, onUnauthorized: signOut })`) et fermer le socket dans `signOut`. Aucune autre modification de la session.
- `package.json` : `npx expo install socket.io-client` (bibliothèque JavaScript pure, compatible Expo Go). Noter le nombre d'avis `npm audit --audit-level=high` avant et après : il ne doit pas augmenter (voir `AGENTS.md`).
- `README.md` : mettre à jour la ligne « Écran Conversation » de « Limites connues » et la table « Architecture ».

### Hors périmètre (autres développeurs)

Ne pas toucher : session persistante (`TODO(session)`, SecureStore), connexion, navigation et routes, liste des DM, serveurs et salons (`ServerScreen`, `useServerChannels`…), recherche, préférences, présence, indicateur de frappe, notifications, badges non lus, suppression de messages. Les événements `*.deleted` et `typing` sont ignorés par cette tâche.

## Avant de coder

### Décisions à prendre avec l'équipe

1. **Accès au jeton** : `SessionContext` garde le jeton privé (`tokenRef`). Faire accepter au responsable de la session l'appel `configureRealtime({ getToken, onUnauthorized: signOut })` et `disconnectRealtime()` dans `signOut`.
2. **Socket unique** : annoncer que `websocketService` est le seul point de connexion à `/messages`. Présence, notifications et badges non lus devront s'y abonner au lieu d'ouvrir leur propre socket.
3. **Renommage** : `MessageComposer` → `MessageInput` et suppression de `useConversationHistory`. Vérifier que personne d'autre ne modifie ces fichiers.
4. **Interface de modification** : appui long sur sa bulle, puis modification dans le champ du bas (choix de ce plan). Le confirmer avec les maquettes du Frontend avant de coder l'interface.
5. **Plan partagé** : commiter `docs/instructionsChat.md` et `AGENTS.md` sur `feature/messagerie` pour que l'équipe les voie.

### Préparer l'environnement de test

1. Backend lancé avec `A26_5A6_01-Infra` (`docker compose up -d`).
2. Deux comptes et un salon commun aux deux, créés avec l'app Electron ou le Dashboard.
3. Vérifier que le téléphone atteint le temps réel : `http://<IP>:<port>/socket.io/?EIO=4&transport=polling` dans son navigateur doit répondre `0{"sid":…`. Sous WSL2 (cas B du README), le port est `3001` (redirection `netsh`).
4. Expo web seulement : l'origine du navigateur doit figurer dans `CORS_ORIGINS` du backend, sinon le socket est refusé. Sur téléphone, aucune origine n'est envoyée : rien à faire.

## Contrats backend (inchangés)

Base : `API_URL` (Gateway). Toutes les requêtes passent par `apiFetch` (jeton ajouté automatiquement). Un écran n'appelle jamais `fetch` et ne connaît pas l'URL (règle `AGENTS.md`).

| Action | DM (`dm:<userId>`) | Salon (`room:<roomId>`) |
| --- | --- | --- |
| Historique | `GET /api/messages/history/:userId?limit=&cursor=` | `GET /api/messages/rooms/:roomId/history?limit=&cursor=` |
| Envoyer | `POST /api/messages` `{ recipientId, content }` | `POST /api/messages/rooms/:roomId` `{ content }` |
| Modifier | `PATCH /api/messages/:id` `{ content }` | `PATCH /api/messages/rooms/:roomId/:id` `{ content }` |

- Message DM : `{ id, senderId, recipientId, content, createdAt, updatedAt }`. Message de salon : `{ id, roomId, authorId, content, createdAt, updatedAt }`. `fetchHistory` normalise déjà `senderId ?? authorId`.
- Historique : `limit` 1 à 100 (défaut 50); l'API renvoie la page en ordre chronologique; `cursor` = id du message **le plus ancien** déjà chargé, exclu de la page. Pas de métadonnée : `hasOlder = page.length === limit`.
- `content` : non vide, 4000 caractères maximum. Envoi limité à 10 messages / 10 s par utilisateur (429).
- Modification : auteur seulement (403 sinon). Salon : 403 aussi si l'utilisateur n'a plus accès.

Socket.IO :

- URL `${API_URL}/messages`, chemin `/socket.io`, `auth: { token }`, `transports: ['websocket']`.
- Attendre `connexion.prete` avant d'émettre quoi que ce soit. `session.revoquee` : jeton refusé → `onUnauthorized` (déconnexion).
- DM : `private-message.created` / `private-message.updated`, reçus automatiquement par les deux participants.
- Salon : émettre `room-message.join { roomId }` (avec accusé de réception `{ joined: true }`) après chaque `connexion.prete`, sinon **aucun** événement du salon n'arrive; `room-message.leave { roomId }` en quittant l'écran. Écouter `room-message.created` / `room-message.updated` et `room-message.revoked { roomId }` (accès perdu).
- Les événements contiennent le message complet. L'envoi et la modification passent par REST : le client n'émet pas `*.send`.
- Rien n'est rejoué après une coupure : à chaque reconnexion, recharger la page la plus récente en REST et fusionner.

## Étapes

### 1. `messagesService.ts` + tests

- Garder `fetchHistory` et ses tests existants; ajouter le paramètre optionnel `cursor` (encodé avec `URLSearchParams`).
- Ajouter `sendMessage(conversationId, content)` et `editMessage(conversationId, messageId, content)` qui choisissent la route DM ou salon via `parseConversationId` et renvoient un `ChatMessage` normalisé (même conversion que `fetchHistory`, à factoriser).
- Ajouter une fonction pure exportée `mergeMessages(current, incoming)` : fusion par `id` (la version au `updatedAt` le plus récent gagne), tri du plus récent au plus ancien (`createdAt` puis `id`). Elle sert à REST, pagination et temps réel.
- Ajouter `belongsTo(conversationId, currentUserId, rawMessage)` : vrai pour un DM si `{senderId, recipientId}` = `{moi, interlocuteur}`; pour un salon si `roomId` correspond.
- **Tests** (`src/__tests__/messagesService.test.ts`) : routes et corps DM/salon, `cursor`, identifiant invalide sans appel API, erreurs remontées telles quelles, `mergeMessages` (doublon, mise à jour, ordre, égalité de dates), `belongsTo`.

### 2. `websocketService.ts` + tests

- Un seul socket pour la session, créé à la première utilisation avec le jeton de `configureRealtime`; fermé par `disconnectRealtime()` (appelé par `signOut`).
- Exposer : état (`connecting` / `ready` / `disconnected`), `onReady(cb)` (appelé à chaque `connexion.prete`, y compris après reconnexion), `subscribe(event, cb)` retournant une fonction de désabonnement, `joinRoom(roomId)` / `leaveRoom(roomId)` (avec accusé et délai d'attente).
- Garder les rooms rejointes en mémoire pour les rejoindre de nouveau après reconnexion; les oublier sur `room-message.revoked`.
- Application en arrière-plan : iOS et Android coupent le socket. Écouter `AppState` (`react-native`) : au retour à `active`, reconnecter si le socket est déconnecté. Le `connexion.prete` qui suit déclenche `onReady`, donc le rattrapage REST du hook.
- **Tests** (`src/__tests__/websocketService.test.ts`, `socket.io-client` simulé) : URL/namespace et `auth.token`, aucun `join` avant `connexion.prete`, `onReady` après reconnexion, rejoin des salons, `revoked`, `session.revoquee` → `onUnauthorized`, désabonnement, `disconnectRealtime`, reconnexion au retour à `active`.

### 3. `useMessages.ts` + tests

Remplace `useConversationHistory`. Ne réutilise pas `useLoadable` (état trop simple pour la fusion temps réel).

- État : `messages` (plus récent en premier), `status` (`loading` / `error` / `ready`), `errorMessage`, `hasOlder`, `loadingOlder`, `olderError`, `connection`.
- Montage : s'abonner aux événements **avant** de lancer le chargement REST; tamponner ce qui arrive pendant le chargement puis fusionner avec `mergeMessages`. Salon : `joinRoom` à l'entrée, `leaveRoom` à la sortie.
- Événements `*.created` / `*.updated` : ignorer ce qui n'appartient pas à la conversation (`belongsTo`); sinon fusionner. Un message reçu par socket n'a que `authorId` : garder un cache `id → pseudo` dans le hook (rempli par l'historique), appeler `lookupPseudos` seulement pour un id absent, une fois par id.
- `loadOlder()` : ignoré tant que le premier chargement n'est pas terminé (`status !== 'ready'`), si déjà en cours ou si `!hasOlder`. Une liste inversée courte déclenche `onEndReached` dès le premier rendu. Curseur = dernier élément de `messages`; erreur affichée sans vider la liste.
- `send(text)` : `Promise` résolue au succès, rejetée avec un message `userMessage` à l'échec. Le message renvoyé par REST est fusionné; l'événement Socket.IO identique ne crée pas de doublon.
- `edit(messageId, text)` : même principe. Un `403` donne le message `forbidden` de `userMessage()`, sans texte en dur dans le hook.
- `onReady` après reconnexion : recharger la page récente et fusionner, sans perdre les pages anciennes déjà chargées.
- Changement de `conversationId` ou démontage : désabonnement, `leaveRoom`, réponses tardives ignorées (compteur de requête, comme `useLoadable`).
- **Tests** (`src/__tests__/useMessages.test.tsx`, services simulés) : chargement, vide, erreur et réessai; événement reçu pendant le chargement; doublon REST + socket; message d'une autre conversation ignoré; modification reçue; pagination (curseur, `hasOlder`, pas de double appel, ignorée avant la fin du premier chargement, erreur); pseudo résolu une seule fois par auteur; reconnexion; salon join/leave; changement de conversation.

### 4. Interface + tests

- **`MessageInput`** (renommé de `MessageComposer`) :
  - `onSend: (text) => Promise<void>`. Pendant l'envoi : bouton désactivé, texte conservé.
  - Succès : vider seulement si le texte n'a pas changé depuis l'envoi. Échec : texte conservé + erreur affichée sous le champ.
  - Brouillon conservé par `conversationId` en mémoire (Map au niveau du module) : quitter puis rouvrir la conversation le restaure. Pas de stockage persistant.
  - Mode modification : prérempli avec le texte du message, boutons « Enregistrer » / « Annuler »; le texte d'origine reste affiché tant que le `PATCH` n'a pas réussi.
- **`MessageBubble`** : ajouter `onLongPress` seulement si `mine` (ouvre la modification); garder la mention « modifié », mais comparer les dates en millisecondes (`new Date(updatedAt).getTime() !== new Date(createdAt).getTime()`, comme le client Electron) plutôt que les chaînes; libellé d'accessibilité indiquant que le message a été modifié.
- **`ConversationScreen`** : utiliser `useMessages`; garder `LoadingState` / `ErrorState` / `EmptyState`; `onEndReached` de la liste inversée → `loadOlder` avec indicateur en bas de liste (`ListFooterComponent`) et réessai en cas d'erreur. Les anciennes pages s'ajoutent à la **fin** du tableau (haut de l'écran) : la position de lecture ne doit pas sauter, à vérifier sur téléphone. Bandeau discret quand `connection !== 'ready'`; `MessageInput` reste utilisable même en état vide.
- **Tests** :
  - `src/__tests__/MessageInput.test.tsx` : envoi vide refusé, texte conservé si échec, vidé si succès, texte tapé pendant l'envoi conservé, brouillon restauré par conversation, mode modification.
  - `src/__tests__/MessageBubble.test.tsx` : « modifié » affiché ou non (même instant écrit dans deux formats ISO → non modifié), appui long seulement sur ses messages, auteur affiché en salon.
  - `src/__tests__/ConversationScreen.test.tsx` (`useMessages` simulé) : états loading / erreur / vide / liste, pagination déclenchée, bandeau de connexion, paramètres invalides sans appel.

### 5. Vérifier et documenter

```bash
npm test
npm run lint
npm run typecheck
npx expo-doctor
```

- Tous les tests passent, y compris les tests existants.
- Vérification manuelle sur téléphone (Expo Go) avec les deux comptes, une fois en DM et une fois dans le salon commun :
  1. message reçu en direct, aucun doublon chez l'auteur;
  2. modification visible chez l'autre avec « modifié »;
  3. pagination sur plusieurs pages sans saut de position;
  4. coupure : Wi-Fi coupé puis rétabli, et app en arrière-plan 1 minute puis reprise → messages manqués rattrapés;
  5. échecs : mode avion, puis 11 messages en moins de 10 s (`429`) → texte conservé et erreur affichée.
- Mettre à jour `README.md` (« Limites connues », table « Architecture »).

## Critères d'acceptation

- Historique chargé en REST, DM et salons, dans le bon ordre.
- Nouveaux messages et modifications reçus en temps réel, sans recharger l'écran.
- Seul l'auteur peut modifier; la mention « modifié » apparaît chez les deux participants.
- Les anciennes pages se chargent en remontant, jusqu'à la fin de l'historique.
- Jamais deux bulles avec le même `id`.
- Le texte non envoyé n'est jamais perdu après un échec.
- Chargement, erreur (avec réessai), vide, reconnexion et fin d'historique sont visibles.
- Chaque fichier modifié ou créé a ses tests; `npm test`, `npm run lint` et `npm run typecheck` passent.
- Aucune modification backend.
- Règles de `AGENTS.md` respectées : services qui lèvent des `ApiError` (aucun texte d'erreur en dur), jeton jamais journalisé, aucune donnée simulée hors des tests.

## Références

- Message-Service : `src/messages/messages.controller.ts`, `src/room-messages/room-messages.controller.ts`, `src/messages/messages.gateway.ts`
- Infra : `docs/api/temps-reel-dm.md`, `docs/api/temps-reel-salons.md`, `docs/api/frontend.md`
- Client Electron (exemple de fusion et de reconnexion) : `src/infrastructure/gateways/runtime/messages.js`, `src/infrastructure/gateways/runtime/temps-reel.js`
