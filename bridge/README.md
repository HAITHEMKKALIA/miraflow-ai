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
| `POST` | `/sessions` `{ "sessionId": "ma-session" }` | `{ status: "qr_pending" }` |
| `GET` | `/sessions/:id/qr` | `{ status, qr?, phone? }` — `qr` = dataURL PNG |
| `GET` | `/sessions/:id/status` | `{ status, phone?, pushname? }` |
| `POST` | `/sessions/:id/logout` | `{ status: "disconnected" }` |

Statuts : `qr_pending` → `connecting` → `connected` (ou `disconnected`).
L'état d'authentification est persisté dans `./auth/<sessionId>` : après un
redémarrage, les sessions connectées se reconnectent sans rescanner le QR
(reconnexion automatique avec backoff en cas de micro-coupure).

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3100` | Port HTTP d'écoute |
| `AUTH_DIR` | `./auth` | Dossier de persistance des sessions |
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
