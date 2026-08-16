# Debug Session: bridge-sync-break
- **Status**: [OPEN]
- **Issue**: Les campagnes, l'Inbox et les sessions WhatsApp n'utilisent pas un flux réel cohérent avec le bridge. Le frontend continue d'afficher des données simulées ou non synchronisées alors que le bridge est lancé.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-bridge-sync-break.ndjson

## Reproduction Steps
1. Démarrer le frontend et le bridge.
2. Connecter une session WhatsApp via le QR bridge.
3. Lancer une campagne depuis le frontend.
4. Vérifier l'état de l'Inbox, des campagnes et des sessions.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Le frontend ne persiste pas l'état réel de session renvoyé par le bridge dans le store utilisé par Inbox/Campagnes. | High | Low | Partiellement confirmé |
| B | Les campagnes locales appellent uniquement la simulation (`sendMessage`, pompe locale) et n'appellent jamais le bridge pour un envoi WhatsApp réel. | High | Medium | Confirmé |
| C | L'Inbox lit uniquement le store simulé et n'est jamais alimentée par les événements/messages du bridge. | High | Medium | Confirmé |
| D | Le bridge expose seulement le flux QR/session mais aucun endpoint d'envoi ou de récupération de messages, donc le frontend ne peut pas synchroniser le runtime réel. | High | Low | Confirmé |
| E | Il existe un défaut de mapping entre `sessionId`, `conversationId` et contact, donc les données réelles n'atterrissent jamais dans les bonnes vues. | Medium | Medium | Inconclusif |

## Log Evidence
- Instrumentation ajoutée dans `src/lib/bridge.ts`, `src/pages/Dashboard.tsx`, `src/pages/Campaigns.tsx`, `src/lib/sim/store.ts`, `bridge/src/index.js`.
- runId actif : `pre-fix`
- `src/pages/Campaigns.tsx:onLaunch` logge `campaign created locally` avec `hasBridgeDispatch:false`, preuve que le lancement campagne reste local/simulé.
- `bridge/src/index.js` n'expose que `/health`, `/sessions`, `/sessions/:id/qr`, `/sessions/:id/status`, `/sessions/:id/logout`.
- `src/pages/Inbox.tsx` consomme `useConversations`, `useContacts`, `useSessions` depuis `src/lib/sim/store.ts`.
- `src/lib/supabase.ts` contient le client DB, mais aucun helper Supabase n'est consommé ailleurs dans `src/` pour Inbox/Campagnes/Contacts/Dashboard.

## Verification Conclusion
- Les campagnes ne passent pas par un envoi WhatsApp réel.
- L'Inbox et les campagnes vivent encore sur `SimEngine` / Zustand local.
- Le bridge gère la connexion QR réelle, mais pas le mirroring des messages ni l'envoi sortant.
- Supabase est branché pour quelques helpers d'administration/onboarding, pas pour le coeur CRM/Inbox/Campagnes.
