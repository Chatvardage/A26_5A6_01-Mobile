This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Portée et façon de travailler

- Ce dépôt est un **client** de Chatvardage. Il consomme le Gateway (`Serveur-API`, REST `/api/*` et Socket.IO `/socket.io`, namespace `/messages`) et ne réimplémente aucune règle métier du backend.
- Aucun backend simulé, mode hors ligne ou donnée de démonstration dans l'app (décision d'équipe, comme le Frontend). Les doublures des tests (`jest.mock`, `jest.fn()`) ne sont pas concernées.
- Ne jamais modifier un contrat backend depuis ce dépôt. Un besoin de contrat se règle dans le service concerné, puis dans `A26_5A6_01-Infra/docs/` et `A26_5A6_01-Serveur-API/docs/API.md`.
- Rester dans la tâche demandée. Plusieurs développeurs travaillent en parallèle (session, navigation, listes, conversation…) : un changement hors de son fichier se limite au point d'intégration nécessaire et est signalé.
- Présenter un plan avant les modifications. Les commits ne sont permis que si le demandeur les autorise explicitement, après vérification des changements et des tests.

## Sécurité

- Le jeton circule uniquement par `Authorization: Bearer` (`apiFetch`) et `auth.token` (Socket.IO). Ne jamais l'afficher, le journaliser ni l'envoyer ailleurs.
- Ne jamais envoyer d'identité fournie par le client (`x-user-id`, `x-user-role`, `userId` dans le handshake) : le backend la déduit du jeton.
- Socket.IO : n'émettre aucun événement avant `connexion.prete`. `session.revoquee` ou un `401` déconnecte la session.
- `.env` et `.env*.local` ne sont jamais commités; `.env.example` ne contient aucune valeur réelle.

## Erreurs et textes

- Les services lèvent des `ApiError` typées (`kind`), jamais du texte. Le texte affiché est produit à la frontière UI par `userMessage()`.
- Depuis les corrections de messagerie de la version 1.0.0, le kind local `validation` est supprimé : HTTP 400 produit `bad_request`. Migrer les constructions et comparaisons locales vers `bad_request` (aucun changement de contrat backend).
- HTTP 429 produit `rate_limited`. `rate_limit` reste un alias historique distinct pour les consommateurs auth et leur texte « Trop de tentatives » ; la restauration de session gère les deux.
- Les hooks d'envoi et de modification propagent les instances d'erreur originales; seul le composant de saisie les traduit avec `userMessage()`.
- Une nouvelle erreur reçoit un `kind` et son message dans `ApiError.ts`; pas de texte d'erreur en dur dans un écran ou un service.
- Textes d'interface, commentaires et documentation en français; identifiants dans la langue du code existant.

## Tests

- Tout changement de comportement arrive avec ses tests dans `src/__tests__/` (Jest, `jest-expo`, Testing Library RN).
- Couvrir le chemin nominal et les erreurs importantes (réseau, `401`, `403`, réponse vide, paramètres invalides). Éviter les tests qui ne vérifient que `toBeDefined()`.
- Simuler `@/services/httpClient` et `socket.io-client`; aucun test ne dépend d'un backend réel.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

Avant de considérer une tâche terminée : `npx tsc --noEmit` → `npx expo lint` → `npm test`. Ne jamais annoncer le travail terminé si une commande échoue : corriger ou indiquer clairement ce qui bloque.

**Audit des dépendances** : `npm audit --audit-level=high` échoue déjà (avis venant des dépendances du SDK Expo). Ne jamais lancer `npm audit fix --force` (il casse les versions du SDK); corriger les versions avec `npx expo install --fix`. Une nouvelle dépendance ne doit pas augmenter le nombre d'avis `high`/`critical` : comparer avant et après l'ajout.

Avant de fusionner un travail issu d'une copie locale, vérifier qu'aucun marqueur de conflit Git (`<<<<<<<`, `=======`, `>>>>>>>`) ne reste dans le diff.

## Navigation & Routing

- Le contrôle 3 impose **React Navigation** (`@react-navigation/native`, `native-stack`, `bottom-tabs`), pas Expo Router. Le point d'entrée est `index.ts` (`registerRootComponent`).
- Toutes les routes et leurs paramètres typés sont dans `src/navigation/routes.ts`; les navigateurs sont dans `src/navigation/`. Les paramètres de route sont validés (`parseConversationParams`) avant tout chargement.
- Écrans dans `src/screens/`, composants dans `src/components/`, hooks dans `src/hooks/`, appels HTTP dans `src/services/`. Un écran n'appelle jamais `fetch` ni ne connaît l'URL de l'API.
- Docs: https://reactnavigation.org/docs/getting-started

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Documentation

- Chaque changement du chat (correctif, comportement, cycle de vie, erreur, accessibilité ou limite) met à jour la section « Conversation et messagerie » du `README.md` dans le même changement. Distinguer explicitement les garanties livrées des défauts restant à corriger; ne pas présenter un scénario non vérifié comme une garantie.
- Tout changement de commande, de variable `EXPO_PUBLIC_*`, de procédure de lancement ou de limite connue met à jour `README.md` (et `.env.example` si pertinent).
- Modifier ce fichier si une règle de travail change.
- Description de PR : résumé des changements, tests exécutés, impact sur les autres dépôts.

## Documentation centrale

Infra est la référence du démarrage complet, des architectures, contrats et scénarios de validation. Le README local décrit le dépôt et ses commandes; les guides détaillés sont dans `A26_5A6_01-Infra/docs/`. Toute modification de contrat doit mettre à jour la référence centrale et ses liens.

## Revue de code : recommandations non retenues

Décisions prises lors de la revue de la PR « recherche, notifications, reprise réseau » (6-8 octobre 2026). Ne pas
les « corriger » sans nouvelle information : elles reposent sur le comportement réel du code.

- **`lastHandledTap` (`useNotificationNavigation.ts`) reste au niveau du module et n'est pas réinitialisé au changement de
  compte.** Les identifiants de notification sont uniques : une collision entre deux sessions est irréaliste. Surtout,
  `getLastNotificationResponse()` renvoie encore, après une déconnexion puis une reconnexion, la notification qui a lancé
  l'application ; réinitialiser la variable ferait rouvrir l'ancienne conversation. Le dédoublonnage protège donc la
  session suivante au lieu de la bloquer.
- **`// eslint-disable-next-line react-hooks/set-state-in-effect` (`UnreadContext.tsx`) est nécessaire.** `set-state-in-effect`
  est une règle réelle de `eslint-plugin-react-hooks` (règles du compilateur React activées par `eslint-config-expo`), pas
  une règle maison. Le chargement initial des compteurs est une synchronisation avec un système externe (le serveur) : le
  `setState` n'a lieu qu'après la réponse, mais la règle ne peut pas le voir à travers `refresh`. Sans le commentaire, le lint
  échoue. Un `refresh` stable (`useCallback`) ne la désactive pas.
- **Avertissement de lint connu dans `src/partage/useAsyncResource.ts`** (`react-hooks/exhaustive-deps` sur `requestId.current`
  dans le nettoyage de l'effet). Le compteur doit être lu au moment du nettoyage pour invalider les requêtes en vol : copier sa
  valeur dans une variable le rendrait inopérant. Ce fichier est identique dans le Frontend, qui n'a pas ce plugin ; le
  modifier demande de reporter le même changement dans les deux dépôts (`A26_5A6_01-Infra/scripts/verifier-fichiers-partages.sh`).

