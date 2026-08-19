# MiraFlow Bridge — serveur de connexion WhatsApp

Micro-service Node 20 qui expose une API REST pour connecter de **vraies**
sessions WhatsApp via QR code, grâce à
[Baileys](https://github.com/WhiskeySockets/Baileys) (protocole WhatsApp Web).
Le frontend MiraFlow (statique) ne peut pas parler directement à WhatsApp :
ce serveur doit tourner en permanence, et son URL doit être renseignée dans
**Paramètres → Sessions → URL du serveur bridge** (variable d'environnement
`VITE_BRIDGE_URL` possible aussi au build).

## API

| Méthode | Route | Réponse |
|---|---|---|
| `GET` | `/health` | `{ ok: true }` |
| `POST` | `/sessions` `{ "sessionId": "s1", "organizationId": "org_A" }` | `{ status: "qr_pending", organizationId }` |
| `GET` | `/sessions/:id/qr` | `{ status, qr?, phone? }` — `qr` = dataURL PNG |
| `GET` | `/sessions/:id/status` | `{ status, phone?, pushname? }` |
| `POST` | `/sessions/:id/messages` `{ "to", "text" }` | envoi direct (409 si déconnecté) |
| `POST` | `/sessions/:id/send` `{ "to", "text" }` | `{ status: "sent" }` ou `{ status: "waiting_connection" }` (202, mis en file) |
| `GET` | `/orgs/:orgId/sessions` | `{ organizationId, sessions: [{ sessionId, status, phone, lastSeenAt, queuedMessages }], count }` |
| `POST` | `/sessions/:id/logout` | `{ status: "disconnected" }` |

Statuts : `qr_pending` → `connecting` → `connected` (ou `disconnected`).

### Multi-tenant et isolation

`POST /sessions` accepte un `organizationId` optionnel (défaut `default` :
l'API historique sans org reste compatible). Les credentials Baileys sont
isolés physiquement par organisation :

```
auth/
├── org_A/
│   ├── session_1/   (owner.json + creds Baileys)
│   └── session_2/
├── org_B/
│   └── session_3/
└── default/         (ancien format ./auth/<sessionId> migré automatiquement ici)
```

Chaque dossier de session contient un `owner.json` `{ "organizationId": ... }`.
Démarrer une session dont le dossier appartient à une autre organisation
renvoie **403 `{ error: "owner_mismatch" }`**. L'endpoint
`GET /orgs/:orgId/sessions` ne liste que les sessions de l'org et n'expose
jamais les credentials.

### Quota, anti-doublon, concurrence, mode dégradé

- **Quota** : si `MAX_SESSIONS_PER_ORG > 0`, créer une session au-delà du quota
  de l'org renvoie **403 `{ error: "quota_exceeded" }`** (contrôle côté backend).
- **Anti-doublon** : chaque `whatsapp_message_id` n'est traité qu'une fois par
  session (Set en mémoire borné à 10 000 ids).
- **Concurrence** : un verrou logique par conversation (chaîne de Promises)
  garantit le traitement séquentiel des messages entrants d'une même conversation.
- **Mode dégradé** : `POST /sessions/:id/send` sur une session déconnectée met
  le message dans une file en mémoire (`waiting_connection`, HTTP 202) ; la
  file est vidée automatiquement à la reconnexion. Aucune perte silencieuse.

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3100` | Port HTTP d'écoute |
| `AUTH_DIR` | `./auth` | Dossier racine de persistance (`<AUTH_DIR>/<orgId>/<sessionId>/`) |
| `MAX_SESSIONS_PER_ORG` | `0` (illimité) | Quota de sessions actives par organisation |
| `LOG_LEVEL` | `info` | Niveau de logs pino |

## Déploiement sur Railway

1. Pousser ce dossier `bridge/` dans un dépôt Git (ou à la racine du repo
   MiraFlow — Railway détecte le `Dockerfile`).
2. Sur [railway.app](https://railway.app) : **New Project → Deploy from GitHub repo**
   et choisir le dépôt. Si le Dockerfile est dans le sous-dossier `bridge/`,
   régler **Settings → Build → Root Directory** sur `bridge`.
3. Ajouter un **Volume** monté sur `/app/auth` (persistance des sessions).
4. Railway expose un port public automatiquement : le service écoute sur la
   variable `PORT` fournie par Railway, rien à configurer.
5. Une fois déployé, copier l'URL publique (ex.
   `https://miraflow-bridge-production.up.railway.app`) et la coller dans
   **Paramètres → Sessions** du frontend, ou la fixer comme
   `VITE_BRIDGE_URL` au build.

## Déploiement sur un VPS (Docker)

```bash
docker build -t miraflow-bridge ./bridge
docker run -d --name miraflow-bridge \
  --restart unless-stopped \
  -p 3100:3100 \
  -v wa_auth:/app/auth \
  miraflow-bridge
```

Vérifier : `curl http://localhost:3100/health` → `{ "ok": true }`.

Exposer ensuite le port 3100 en HTTPS (reverse proxy Caddy/Nginx + certificat)
car le frontend est servi en HTTPS : un navigateur refuse les appels
HTTP mixtes. Exemple Caddy :

```
bridge.mondomaine.com
reverse_proxy localhost:3100
```

## Lancement local (sans Docker)

```bash
cd bridge
npm install
npm start          # écoute sur :3100
```

## ⚠️ Avertissement légal

- Ce bridge est un **pont non officiel** : il n'est ni fourni, ni approuvé,
  ni affilié à WhatsApp / Meta. Il repose sur l'émulation du protocole
  WhatsApp Web via Baileys.
- L'utilisation d'un client non officiel **enfreint potentiellement les
  Conditions d'utilisation de WhatsApp** et expose le numéro à un **risque de
  bannissement temporaire ou définitif**.
- **N'utilisez pas votre numéro principal.** Préférez un numéro dédié
  (idéalement WhatsApp Business) que vous pouvez perdre sans impact.
- Pour un usage commercial pérenne, la voie officielle est la
  **WhatsApp Business Platform (Cloud API)** de Meta.
- Vous êtes responsable de la conformité de votre usage (consentement des
  contacts, RGPD, règles anti-spam de WhatsApp).
